const { query } = require('../../config/db');

const dashboard = async () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const [todaySales, monthSales, ordersStat, pendingPayments, lowStock] = await Promise.all([
    query(
      `SELECT COUNT(*) AS orders, COALESCE(SUM(total_amount),0) AS total
       FROM orders WHERE created_at >= $1`, [today]
    ),
    query(
      `SELECT COUNT(*) AS orders, COALESCE(SUM(total_amount),0) AS total
       FROM orders WHERE created_at >= $1`, [monthStart]
    ),
    query(
      `SELECT status, COUNT(*) AS count FROM orders GROUP BY status`
    ),
    query(`SELECT COUNT(*) AS count FROM payments WHERE status = 'under_review'`),
    query(`SELECT COUNT(*) AS count FROM inventory WHERE available_qty < 100`),
  ]);

  const statuses = {};
  ordersStat.rows.forEach(r => { statuses[r.status] = parseInt(r.count, 10); });

  return {
    today: {
      orders: parseInt(todaySales.rows[0].orders, 10),
      sales: parseFloat(todaySales.rows[0].total),
    },
    month: {
      orders: parseInt(monthSales.rows[0].orders, 10),
      sales: parseFloat(monthSales.rows[0].total),
    },
    orders_by_status: statuses,
    pending_payments: parseInt(pendingPayments.rows[0].count, 10),
    low_stock: parseInt(lowStock.rows[0].count, 10),
  };
};

const listOrders = async (filters = {}) => {
  let sql = `
    SELECT o.id, o.order_number, o.status, o.source,
           o.total_amount, o.paid_amount, o.remaining_amount,
           o.created_at, og.group_number,
           u.full_name AS customer_name, u.phone AS customer_phone
    FROM orders o
    JOIN customers c ON c.id = o.customer_id
    JOIN users u ON u.id = c.user_id
    LEFT JOIN order_groups og ON og.id = o.group_id
    WHERE 1=1
  `;
  const params = [];
  if (filters.status) {
    params.push(filters.status);
    sql += ` AND o.status = $${params.length}`;
  }
  if (filters.source) {
    params.push(filters.source);
    sql += ` AND o.source = $${params.length}`;
  }
  sql += ` ORDER BY o.created_at DESC LIMIT 100`;
  const r = await query(sql, params);
  return r.rows;
};

const listCustomers = async () => {
  const r = await query(
    `SELECT c.id, c.customer_type, c.governorate, c.area,
            u.full_name, u.phone, u.status,
            (SELECT COUNT(*) FROM orders WHERE customer_id = c.id) AS orders_count,
            (SELECT COALESCE(SUM(total_amount),0) FROM orders WHERE customer_id = c.id) AS total_spent
     FROM customers c
     JOIN users u ON u.id = c.user_id
     ORDER BY c.created_at DESC`
  );
  return r.rows;
};

// حالات مالية/محاسبية لا تُضبط يدويًا أبدًا: تنتج فقط عن مساراتها (اعتماد الدفع، التحميل/الترحيل، العكس).
const FINANCIAL_STATUSES = ['PAYMENT_APPROVED', 'PENDING_PAYMENT_REVIEW', 'LOADED', 'COMPLETED', 'DELIVERED', 'CANCELLED', 'CREDIT_REJECTED'];
const OPERATIONAL_STATUSES = ['PREPARING', 'READY_FOR_LOADING', 'IN_TRANSIT', 'ON_HOLD'];

const updateOrderStatus = async (orderId, newStatus, userId, reason, ctx = {}) => {
  if (!OPERATIONAL_STATUSES.includes(newStatus)) {
    const e = new Error(FINANCIAL_STATUSES.includes(newStatus)
      ? 'هذه الحالة مالية ولا تُغيَّر يدويًا: استخدم اعتماد الدفع/التحميل/عكس الترحيل'
      : 'حالة غير مسموحة'); e.status = 400; e.code = 'STATUS_NOT_ALLOWED'; throw e;
  }
  if (!reason || String(reason).trim().length < 3) { const e = new Error('سبب التغيير مطلوب'); e.status = 400; throw e; }
  const { pool } = require('../../config/db');
  const { logAudit } = require('../audit/audit.service');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query(`SELECT id, status, order_number, accounting_status FROM orders WHERE id = $1 FOR UPDATE`, [orderId]);
    if (!cur.rows.length) { await client.query('ROLLBACK'); return null; }
    const o = cur.rows[0];
    if (['POSTED', 'REVERSED'].includes(o.accounting_status) || ['CANCELLED', 'COMPLETED'].includes(o.status)) {
      const e = new Error('الطلب مرحّل أو منتهٍ: لا يمكن تغيير حالته يدويًا'); e.status = 409; throw e;
    }
    await client.query(`UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2`, [newStatus, orderId]);
    await client.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, reason) VALUES ($1,$2,$3,$4,$5)`,
      [orderId, o.status, newStatus, userId, reason]);
    await logAudit(client, { userId, action: 'ORDER_STATUS_MANUAL', entityType: 'orders', entityId: orderId, entityRef: o.order_number,
      oldValues: { status: o.status }, newValues: { status: newStatus }, reason, ip: ctx.ip, userAgent: ctx.userAgent });
    await client.query('COMMIT');
    return { id: orderId, status: newStatus, order_number: o.order_number };
  } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
};

module.exports = { dashboard, listOrders, listCustomers, updateOrderStatus };
