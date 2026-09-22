const { pool, query } = require('../../config/db');

/**
 * تسجيل معاملة في كشف الحساب
 */
const addTransaction = async (client, {
  customerId,
  orderId,
  transactionType,
  debit = 0,
  credit = 0,
  description,
  paymentMethod,
  referenceCode,
  createdBy,
}) => {
  const balRes = await client.query(
    `SELECT current_balance FROM customers WHERE id = $1 FOR UPDATE`,
    [customerId]
  );
  if (balRes.rows.length === 0) {
    const err = new Error('العميل غير موجود');
    err.status = 404;
    throw err;
  }
  const currentBalance = parseFloat(balRes.rows[0].current_balance || 0);
  const newBalance = currentBalance + debit - credit;

  await client.query(
    `INSERT INTO customer_ledger
     (customer_id, order_id, transaction_type, debit, credit, balance_after,
      description, payment_method, reference_code, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      customerId, orderId || null, transactionType,
      debit, credit, newBalance,
      description || null, paymentMethod || null, referenceCode || null,
      createdBy || null,
    ]
  );

  await client.query(
    `UPDATE customers SET current_balance = $1 WHERE id = $2`,
    [newBalance, customerId]
  );

  return newBalance;
};

/**
 * جلب كشف الحساب
 */
const getLedger = async (customerId, { from, to, limit = 100 } = {}) => {
  let sql = `
    SELECT cl.*, o.order_number
    FROM customer_ledger cl
    LEFT JOIN orders o ON o.id = cl.order_id
    WHERE cl.customer_id = $1
  `;
  const params = [customerId];

  if (from) {
    params.push(from);
    sql += ` AND cl.created_at >= $${params.length}`;
  }
  if (to) {
    params.push(to);
    sql += ` AND cl.created_at <= $${params.length}`;
  }

  params.push(limit);
  sql += ` ORDER BY cl.created_at DESC LIMIT $${params.length}`;

  const r = await query(sql, params);
  return r.rows;
};

/**
 * ملخص الحساب
 */
const getSummary = async (customerId) => {
  const r = await query(
    `SELECT
       c.current_balance,
       c.credit_limit,
       COALESCE(SUM(cl.debit), 0) AS total_purchases,
       COALESCE(SUM(cl.credit), 0) AS total_payments,
       COUNT(DISTINCT cl.order_id) AS total_orders
     FROM customers c
     LEFT JOIN customer_ledger cl ON cl.customer_id = c.id
     WHERE c.id = $1
     GROUP BY c.id, c.current_balance, c.credit_limit`,
    [customerId]
  );
  return r.rows[0] || {
    current_balance: 0,
    credit_limit: 0,
    total_purchases: 0,
    total_payments: 0,
    total_orders: 0,
  };
};

/**
 * تسجيل دفعة
 */
const recordPayment = async (customerId, { amount, method, reference, notes, createdBy }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const newBalance = await addTransaction(client, {
      customerId,
      transactionType: 'payment',
      credit: amount,
      description: notes || `دفعة - ${method || 'نقدي'}`,
      paymentMethod: method,
      referenceCode: reference,
      createdBy,
    });

    await client.query('COMMIT');
    return { new_balance: newBalance };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * قائمة العملاء مع أرصدتهم
 */
const listCustomersWithBalance = async (filters = {}) => {
  let sql = `
    SELECT
      c.id, c.customer_type, c.governorate, c.area,
      c.credit_limit, c.current_balance,
      u.full_name, u.phone, u.status,
      (SELECT COUNT(*) FROM orders WHERE customer_id = c.id) AS orders_count,
      (SELECT COALESCE(SUM(total_amount),0) FROM orders WHERE customer_id = c.id) AS total_spent
    FROM customers c
    JOIN users u ON u.id = c.user_id
    WHERE 1=1
  `;
  const params = [];

  if (filters.customerType) {
    params.push(filters.customerType);
    sql += ` AND c.customer_type = $${params.length}`;
  }
  if (filters.hasBalance === 'true') {
    sql += ` AND c.current_balance > 0`;
  }

  sql += ` ORDER BY c.current_balance DESC, u.full_name ASC`;
  const r = await query(sql, params);
  return r.rows;
};

module.exports = {
  addTransaction,
  getLedger,
  getSummary,
  recordPayment,
  listCustomersWithBalance,
};
