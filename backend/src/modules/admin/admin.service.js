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
           o.created_at,
           u.full_name AS customer_name, u.phone AS customer_phone
    FROM orders o
    JOIN customers c ON c.id = o.customer_id
    JOIN users u ON u.id = c.user_id
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

const updateOrderStatus = async (orderId, newStatus, userId, reason) => {
  const r = await query(
    `UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2
     RETURNING id, status, order_number`,
    [newStatus, orderId]
  );
  if (r.rows.length === 0) return null;
  await query(
    `INSERT INTO order_status_history (order_id, to_status, changed_by, reason)
     VALUES ($1, $2, $3, $4)`,
    [orderId, newStatus, userId, reason || 'تحديث إداري']
  );
  return r.rows[0];
};

module.exports = { dashboard, listOrders, listCustomers, updateOrderStatus };
