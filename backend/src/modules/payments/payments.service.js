const { pool, query } = require('../../config/db');

const generatePaymentRef = async () => {
  const year = new Date().getFullYear();
  const result = await query(
    `SELECT COUNT(*) FROM payments WHERE reference_code LIKE $1`,
    [`PAY-${year}-%`]
  );
  const count = parseInt(result.rows[0].count, 10) + 1;
  return `PAY-${year}-${String(count).padStart(6, '0')}`;
};

const listMethods = async () => {
  const result = await query(
    `SELECT id, code, name_ar, type FROM payment_methods WHERE status = 'active'`
  );
  return result.rows;
};

const submitPayment = async (userId, data) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // تحقق من الطلب
    const orderResult = await client.query(
      `SELECT o.id, o.order_number, o.status, o.total_amount, o.paid_amount
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       WHERE o.id = $1 AND c.user_id = $2`,
      [data.orderId, userId]
    );
    if (orderResult.rows.length === 0) {
      const err = new Error('الطلب غير موجود');
      err.status = 404;
      throw err;
    }
    const order = orderResult.rows[0];

    if (order.status !== 'PENDING_PAYMENT') {
      const err = new Error('لا يمكن إرسال دفعة في الحالة الحالية');
      err.status = 400;
      throw err;
    }

    // تحقق من طريقة الدفع
    const methodResult = await client.query(
      `SELECT id FROM payment_methods WHERE id = $1 AND status = 'active'`,
      [data.methodId]
    );
    if (methodResult.rows.length === 0) {
      const err = new Error('طريقة الدفع غير متاحة');
      err.status = 400;
      throw err;
    }

    // أنشئ الدفعة
    const referenceCode = await generatePaymentRef();

    const paymentResult = await client.query(
      `INSERT INTO payments
       (order_id, method_id, amount_due, amount_transferred, transfer_date,
        transaction_ref, status, reference_code)
       VALUES ($1, $2, $3, $4, $5, $6, 'under_review', $7)
       RETURNING id, reference_code, status`,
      [
        order.id,
        data.methodId,
        order.total_amount,
        data.amountTransferred,
        data.transferDate,
        data.transactionRef || null,
        referenceCode,
      ]
    );
    const payment = paymentResult.rows[0];

    // حدّث حالة الطلب
    await client.query(
      `UPDATE orders SET status = 'PENDING_PAYMENT_REVIEW', updated_at = NOW()
       WHERE id = $1`,
      [order.id]
    );

    // سجّل الحالة
    await client.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, reason)
       VALUES ($1, $2, 'PENDING_PAYMENT_REVIEW', $3, $4)`,
      [order.id, order.status, userId, 'تم رفع إيصال الدفع']
    );

    await client.query('COMMIT');
    return {
      payment_id: payment.id,
      reference_code: payment.reference_code,
      status: payment.status,
      order_status: 'PENDING_PAYMENT_REVIEW',
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const getMyPayments = async (userId) => {
  const result = await query(
    `SELECT p.id, p.reference_code, p.status, p.amount_due,
            p.amount_transferred, p.transfer_date, p.transaction_ref,
            p.rejection_reason, p.created_at,
            o.order_number
     FROM payments p
     JOIN orders o ON o.id = p.order_id
     JOIN customers c ON c.id = o.customer_id
     WHERE c.user_id = $1
     ORDER BY p.created_at DESC`,
    [userId]
  );
  return result.rows;
};

const getPaymentById = async (paymentId, userId = null, isAdmin = false) => {
  let sql = `
    SELECT p.id, p.reference_code, p.status, p.amount_due,
           p.amount_transferred, p.transfer_date, p.transaction_ref,
           p.rejection_reason, p.reviewed_at, p.created_at,
           o.id AS order_id, o.order_number, o.total_amount,
           u.full_name AS customer_name, u.phone AS customer_phone,
           pm.name_ar AS method_name, pm.code AS method_code
    FROM payments p
    JOIN orders o ON o.id = p.order_id
    JOIN customers c ON c.id = o.customer_id
    JOIN users u ON u.id = c.user_id
    JOIN payment_methods pm ON pm.id = p.method_id
    WHERE p.id = $1
  `;
  const params = [paymentId];

  if (!isAdmin && userId) {
    sql += ` AND c.user_id = $2`;
    params.push(userId);
  }

  const result = await query(sql, params);
  return result.rows[0] || null;
};

const listPendingPayments = async () => {
  const result = await query(
    `SELECT p.id, p.reference_code, p.status,
            p.amount_due, p.amount_transferred, p.transfer_date,
            p.transaction_ref, p.created_at,
            o.order_number, o.id AS order_id,
            u.full_name AS customer_name, u.phone AS customer_phone,
            pm.name_ar AS method_name
     FROM payments p
     JOIN orders o ON o.id = p.order_id
     JOIN customers c ON c.id = o.customer_id
     JOIN users u ON u.id = c.user_id
     JOIN payment_methods pm ON pm.id = p.method_id
     WHERE p.status IN ('under_review', 'pending')
     ORDER BY p.created_at ASC`
  );
  return result.rows;
};

const approvePayment = async (paymentId, reviewerId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const pResult = await client.query(
      `SELECT p.id, p.order_id, p.status, p.amount_transferred,
              o.status AS order_status
       FROM payments p
       JOIN orders o ON o.id = p.order_id
       WHERE p.id = $1`,
      [paymentId]
    );
    if (pResult.rows.length === 0) {
      const err = new Error('الدفعة غير موجودة');
      err.status = 404;
      throw err;
    }
    const payment = pResult.rows[0];

    if (payment.status === 'approved') {
      const err = new Error('الدفعة معتمدة مسبقًا');
      err.status = 400;
      throw err;
    }

    // اعتمد الدفعة
    await client.query(
      `UPDATE payments
       SET status = 'approved', reviewed_by = $1, reviewed_at = NOW()
       WHERE id = $2`,
      [reviewerId, paymentId]
    );

    // حدّث الطلب
    await client.query(
      `UPDATE orders
       SET status = 'PAYMENT_APPROVED',
           paid_amount = $1,
           remaining_amount = total_amount - $1,
           updated_at = NOW()
       WHERE id = $2`,
      [payment.amount_transferred, payment.order_id]
    );

    // احفظ الحالة
    await client.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, reason)
       VALUES ($1, $2, 'PAYMENT_APPROVED', $3, 'اعتماد الدفع')`,
      [payment.order_id, payment.order_status, reviewerId]
    );

    await client.query('COMMIT');
    return { payment_id: paymentId, status: 'approved', order_status: 'PAYMENT_APPROVED' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const rejectPayment = async (paymentId, reviewerId, reason) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const pResult = await client.query(
      `SELECT id, order_id, status FROM payments WHERE id = $1`,
      [paymentId]
    );
    if (pResult.rows.length === 0) {
      const err = new Error('الدفعة غير موجودة');
      err.status = 404;
      throw err;
    }
    const payment = pResult.rows[0];

    await client.query(
      `UPDATE payments
       SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW(),
           rejection_reason = $2
       WHERE id = $3`,
      [reviewerId, reason, paymentId]
    );

    await client.query(
      `UPDATE orders SET status = 'PENDING_PAYMENT', updated_at = NOW()
       WHERE id = $1`,
      [payment.order_id]
    );

    await client.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, reason)
       VALUES ($1, 'PENDING_PAYMENT_REVIEW', 'PENDING_PAYMENT', $2, $3)`,
      [payment.order_id, reviewerId, `رفض الدفع: ${reason}`]
    );

    await client.query('COMMIT');
    return { payment_id: paymentId, status: 'rejected' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

module.exports = {
  listMethods,
  submitPayment,
  getMyPayments,
  getPaymentById,
  listPendingPayments,
  approvePayment,
  rejectPayment,
};
