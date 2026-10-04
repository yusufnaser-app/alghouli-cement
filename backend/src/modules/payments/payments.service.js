const { pool, query } = require('../../config/db');
const ledger = require('../accounting/ledger.core');
const { toMinor, fromMinor, AccountingError } = require('../accounting/accounting.engine');
const { logAudit } = require('../audit/audit.service');

const wrapAcc = (e) => {
  if (!(e instanceof AccountingError)) return e;
  const x = new Error(e.message); x.status = e.status || 400; x.code = e.code; return x;
};

/** المدفوع على الطلب = مجموع الدفعات المعتمدة بعملة الطلب (لا خلط عملات). */
const recomputeOrderPaid = async (client, orderId) => {
  const r = await client.query(
    `SELECT o.currency, COALESCE(o.final_total_amount, o.total_amount, 0) AS due,
            COALESCE((SELECT SUM(p.amount_transferred) FROM payments p
                      WHERE p.order_id = o.id AND p.status = 'approved' AND p.payment_currency = o.currency), 0) AS paid
     FROM orders o WHERE o.id = $1`, [orderId]);
  const paid = toMinor(r.rows[0].paid);
  const remaining = Math.max(0, toMinor(r.rows[0].due) - paid);
  await client.query(`UPDATE orders SET paid_amount = $1, remaining_amount = $2, updated_at = NOW() WHERE id = $3`,
    [fromMinor(paid), fromMinor(remaining), orderId]);
  return { paid: fromMinor(paid), remaining: fromMinor(remaining) };
};

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
      `SELECT o.id, o.order_number, o.status, o.total_amount, o.paid_amount, o.currency
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       WHERE o.id = $1 AND c.user_id = $2
       FOR UPDATE OF o`,
      [data.orderId, userId]
    );
    if (orderResult.rows.length === 0) {
      const err = new Error('الطلب غير موجود');
      err.status = 404;
      throw err;
    }
    const order = orderResult.rows[0];

    if (!['PENDING_PAYMENT', 'PAYMENT_APPROVED'].includes(order.status)) {
      const err = new Error('لا يمكن إرسال دفعة في الحالة الحالية');
      err.status = 400;
      throw err;
    }

    // تحقق من طريقة الدفع
    const methodResult = await client.query(
      `SELECT id, code FROM payment_methods WHERE id = $1 AND status = 'active'`,
      [data.methodId]
    );
    if (methodResult.rows.length === 0) {
      const err = new Error('طريقة الدفع غير متاحة');
      err.status = 400;
      throw err;
    }

    // تحقق من طريقة الدفع والعملة.
    // لا يوجد سعر صرف: المبلغ يحفظ بنفس العملة التي أدخلها العميل.
    const methodCode = methodResult.rows[0].code;
    if (['network_transfer', 'e_wallet'].includes(methodCode) &&
        (!data.transactionRef || !data.transactionRef.trim())) {
      const err = new Error('رقم الحوالة أو رقم العملية مطلوب');
      err.status = 400;
      throw err;
    }

    const paymentCurrency = data.paymentCurrency;
    const referenceCode = await generatePaymentRef();

    const paymentResult = await client.query(
      `INSERT INTO payments
       (order_id, method_id, amount_due, amount_transferred, payment_currency,
        transfer_date, transaction_ref, status, reference_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'under_review', $8)
       RETURNING id, reference_code, status, payment_currency, amount_transferred`,
      [
        order.id,
        data.methodId,
        order.total_amount,
        data.amountTransferred,
        paymentCurrency,
        data.transferDate,
        data.transactionRef ? data.transactionRef.trim() : null,
        referenceCode,
      ]
    );
    const payment = paymentResult.rows[0];

    // الدفعة الأولى تنقل الطلب للمراجعة؛ الدفعات الإضافية على طلب معتمد لا تُرجع حالته للخلف.
    if (order.status === 'PENDING_PAYMENT') {
      await client.query(
        `UPDATE orders SET status = 'PENDING_PAYMENT_REVIEW', updated_at = NOW()
         WHERE id = $1`,
        [order.id]
      );
      await client.query(
        `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, reason)
         VALUES ($1, $2, 'PENDING_PAYMENT_REVIEW', $3, $4)`,
        [order.id, order.status, userId, 'تم رفع إيصال الدفع']
      );
    }

    await client.query('COMMIT');
    return {
      payment_id: payment.id,
      reference_code: payment.reference_code,
      status: payment.status,
      order_status: order.status === 'PENDING_PAYMENT' ? 'PENDING_PAYMENT_REVIEW' : order.status,
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
            p.amount_transferred, p.payment_currency, p.transfer_date, p.transaction_ref,
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
           p.amount_transferred, p.payment_currency, p.transfer_date, p.transaction_ref,
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
            p.amount_due, p.amount_transferred, p.payment_currency, p.transfer_date,
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

/**
 * اعتماد دفعة: قيد دائن واحد في دفتر العميل بعملة الدفعة (لا تحويل).
 * - قفل صف الدفعة والطلب FOR UPDATE ← الضغط المزدوج/الطلبان المتزامنان لا يُنتجان قيدين.
 * - مفتاح idempotency = payment:<id>:approve (خط دفاع ثانٍ في قاعدة البيانات).
 * - الحالات المسموحة للاعتماد: under_review / pending فقط. (rejected/cancelled/reversed لا تؤثر ولا تُعتمد.)
 * - الدفعة مرتبطة بطلبها (order_id) وتبقى كذلك؛ لا نفترض أنها تخص آخر طلب.
 */
const approvePayment = async (paymentId, reviewerId, ctx = {}) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const pResult = await client.query(
      `SELECT p.id, p.order_id, p.status, p.amount_transferred, p.payment_currency, p.reference_code,
              o.status AS order_status, o.fax_requested, o.delivery_type, o.customer_id, o.priced_by,
              o.order_number, o.fax_id
       FROM payments p
       JOIN orders o ON o.id = p.order_id
       WHERE p.id = $1
       FOR UPDATE OF p, o`,
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
    if (!['under_review', 'pending'].includes(payment.status)) {
      const err = new Error(`لا يمكن اعتماد دفعة بحالة ${payment.status}؛ يجب إرسال دفعة جديدة`);
      err.status = 409;
      throw err;
    }
    // فصل المهام: من سعّر الطلب لا يعتمد دفعته (إلا مدير النظام)
    const roles = ctx.roles || [];
    if (!roles.includes('admin') && payment.priced_by && payment.priced_by === reviewerId) {
      const err = new Error('لا يجوز لمن سعّر الطلب اعتماد دفعته (فصل المهام)');
      err.status = 403;
      err.code = 'SEGREGATION_OF_DUTIES';
      throw err;
    }

    await client.query(
      `UPDATE payments
       SET status = 'approved', reviewed_by = $1, reviewed_at = NOW()
       WHERE id = $2`,
      [reviewerId, paymentId]
    );

    // قيد دائن بعملة الدفعة (دون أي تحويل)
    let posted;
    try {
      posted = await ledger.postCustomerEntry(client, {
        customerId: payment.customer_id,
        orderId: payment.order_id,
        currency: payment.payment_currency,
        debit: 0,
        credit: payment.amount_transferred,
        transactionType: 'payment',
        description: `دفعة معتمدة للطلب ${payment.order_number}`,
        referenceCode: payment.reference_code,
        sourceType: 'payment',
        sourceId: payment.id,
        idempotencyKey: `payment:${payment.id}:approve`,
        createdBy: reviewerId,
      });
    } catch (e) { throw wrapAcc(e); }

    const totals = await recomputeOrderPaid(client, payment.order_id);

    // الطلب ينتقل لـ PAYMENT_APPROVED فقط إن كان بانتظار مراجعة الدفع (لا رجوع للخلف ولا تغيير لطلب محمّل)
    let orderStatus = payment.order_status;
    if (payment.order_status === 'PENDING_PAYMENT_REVIEW') {
      orderStatus = 'PAYMENT_APPROVED';
      await client.query(`UPDATE orders SET status = 'PAYMENT_APPROVED', updated_at = NOW() WHERE id = $1`, [payment.order_id]);
      await client.query(
        `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, reason)
         VALUES ($1, $2, 'PAYMENT_APPROVED', $3, 'اعتماد الدفع')`,
        [payment.order_id, payment.order_status, reviewerId]
      );
    }

    if (payment.fax_requested && !payment.fax_id && orderStatus === 'PAYMENT_APPROVED') {
      try {
        const faxService = require('../faxes/fax.service');
        await faxService.createFaxFromOrder(client, payment.order_id, reviewerId);
      } catch (faxErr) {
        if (faxErr.code !== 'FAX_NOT_READY') throw faxErr;
      }
    }

    await logAudit(client, {
      userId: reviewerId, action: 'PAYMENT_APPROVED', entityType: 'payments', entityId: payment.id,
      entityRef: payment.reference_code,
      oldValues: { status: payment.status },
      newValues: { status: 'approved', amount: String(payment.amount_transferred), currency: payment.payment_currency,
        order_id: payment.order_id, ledger_entry_id: posted.entry.id, paid_on_order: totals.paid },
      ip: ctx.ip, userAgent: ctx.userAgent,
    });

    await client.query('COMMIT');
    // تكليف تلقائي بعد اعتماد الدفع — الفشل لا يؤثر على الاعتماد
    if (orderStatus === 'PAYMENT_APPROVED') {
      try { await require('../deliveries/auto-assign.service').tryAutoAssign(payment.order_id, reviewerId); } catch (e) { console.error('[auto-assign] hook:', e.message); }
    }
    return { payment_id: paymentId, status: 'approved', order_status: orderStatus,
      currency: payment.payment_currency, customer_balance: posted.balance, order_paid: totals.paid, order_remaining: totals.remaining };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/** رفض دفعة غير معتمدة فقط. الدفعة المعتمدة لا تُرفض: تُعكس عبر reversePayment. */
const rejectPayment = async (paymentId, reviewerId, reason, ctx = {}) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const pResult = await client.query(
      `SELECT p.id, p.order_id, p.status, p.reference_code, o.status AS order_status
       FROM payments p JOIN orders o ON o.id = p.order_id
       WHERE p.id = $1 FOR UPDATE OF p, o`,
      [paymentId]
    );
    if (pResult.rows.length === 0) {
      const err = new Error('الدفعة غير موجودة');
      err.status = 404;
      throw err;
    }
    const payment = pResult.rows[0];
    if (payment.status === 'approved') {
      const err = new Error('الدفعة معتمدة: استخدم عكس الدفعة (مع السبب) بدل الرفض');
      err.status = 409;
      throw err;
    }
    if (!['under_review', 'pending'].includes(payment.status)) {
      const err = new Error(`الدفعة بحالة ${payment.status} ولا يمكن رفضها`);
      err.status = 409;
      throw err;
    }

    await client.query(
      `UPDATE payments
       SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW(),
           rejection_reason = $2
       WHERE id = $3`,
      [reviewerId, reason, paymentId]
    );

    if (payment.order_status === 'PENDING_PAYMENT_REVIEW') {
      await client.query(
        `UPDATE orders SET status = 'PENDING_PAYMENT', updated_at = NOW() WHERE id = $1`,
        [payment.order_id]
      );
      await client.query(
        `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, reason)
         VALUES ($1, 'PENDING_PAYMENT_REVIEW', 'PENDING_PAYMENT', $2, $3)`,
        [payment.order_id, reviewerId, `رفض الدفع: ${reason}`]
      );
    }

    await logAudit(client, {
      userId: reviewerId, action: 'PAYMENT_REJECTED', entityType: 'payments', entityId: payment.id,
      entityRef: payment.reference_code, oldValues: { status: payment.status }, newValues: { status: 'rejected' },
      reason, ip: ctx.ip, userAgent: ctx.userAgent,
    });

    await client.query('COMMIT');
    return { payment_id: paymentId, status: 'rejected' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * عكس دفعة معتمدة (إلغاء بالأثر): قيد معاكس في الدفتر، والدفعة تصبح reversed، ويبقى الأصل ظاهرًا في الكشف.
 * لا حذف. لا يُنفَّذ مرتين (idempotent).
 */
const reversePayment = async (paymentId, reviewerId, reason, ctx = {}) => {
  if (!reason || String(reason).trim().length < 3) {
    const err = new Error('سبب العكس مطلوب'); err.status = 400; throw err;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const pr = await client.query(
      `SELECT p.id, p.order_id, p.status, p.reference_code, p.amount_transferred, p.payment_currency
       FROM payments p JOIN orders o ON o.id = p.order_id WHERE p.id = $1 FOR UPDATE OF p, o`, [paymentId]);
    if (!pr.rows.length) { const err = new Error('الدفعة غير موجودة'); err.status = 404; throw err; }
    const payment = pr.rows[0];
    if (payment.status === 'reversed') {
      await client.query('ROLLBACK');
      return { payment_id: paymentId, status: 'reversed', already_reversed: true };
    }
    if (payment.status !== 'approved') {
      const err = new Error('يمكن عكس الدفعات المعتمدة فقط'); err.status = 409; throw err;
    }
    const entry = await client.query(`SELECT id FROM customer_ledger WHERE idempotency_key = $1`, [`payment:${payment.id}:approve`]);
    let reversal = null;
    if (entry.rows.length) {
      try {
        reversal = await ledger.reverseCustomerEntry(client, entry.rows[0].id, { reason, userId: reviewerId, referenceCode: payment.reference_code });
      } catch (e) { throw wrapAcc(e); }
    }
    await client.query(
      `UPDATE payments SET status = 'reversed', reversed_by = $1, reversed_at = NOW(), reversal_reason = $2 WHERE id = $3`,
      [reviewerId, reason, paymentId]);
    const totals = await recomputeOrderPaid(client, payment.order_id);
    await logAudit(client, {
      userId: reviewerId, action: 'PAYMENT_REVERSED', entityType: 'payments', entityId: payment.id, entityRef: payment.reference_code,
      oldValues: { status: 'approved', amount: String(payment.amount_transferred), currency: payment.payment_currency },
      newValues: { status: 'reversed', reversal_entry_id: reversal ? reversal.entry.id : null, order_paid: totals.paid },
      reason, ip: ctx.ip, userAgent: ctx.userAgent,
    });
    await client.query('COMMIT');
    return { payment_id: paymentId, status: 'reversed', customer_balance: reversal ? reversal.balance : null, order_paid: totals.paid };
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
  reversePayment,
  recomputeOrderPaid,
};
