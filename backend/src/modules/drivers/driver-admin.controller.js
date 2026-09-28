const asyncHandler = require('../../utils/asyncHandler');
const response = require('../../utils/response');
const { query } = require('../../config/db');

// ============ اعتماد السائقين ============

const listPending = asyncHandler(async (req, res) => {
  const r = await query(`
    SELECT d.id, d.full_name, d.phone, d.driver_type, d.approval_status,
           d.status, d.national_id, d.license_number, d.created_at,
           u.id AS user_id,
           (SELECT json_agg(json_build_object(
             'id', v.id, 'plate_number', v.plate_number,
             'vehicle_type', v.vehicle_type, 'capacity_tons', v.capacity_tons
           ))
           FROM vehicles v WHERE v.current_driver_id = d.id) AS vehicles
    FROM drivers d
    JOIN users u ON u.id = d.user_id
    WHERE d.approval_status = 'pending_approval'
    ORDER BY d.created_at DESC
  `);
  return response.success(res, r.rows, 'السائقون المعلقون');
});

const listAll = asyncHandler(async (req, res) => {
  const r = await query(`
    SELECT d.id, d.full_name, d.phone, d.driver_type, d.approval_status,
           d.status, d.current_balance, d.created_at,
           u.id AS user_id
    FROM drivers d
    JOIN users u ON u.id = d.user_id
    ORDER BY d.created_at DESC
  `);
  return response.success(res, r.rows, 'كل السائقين');
});

const approve = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const r = await query(
    `UPDATE drivers SET approval_status = 'active', updated_at = NOW()
     WHERE id = $1 AND approval_status = 'pending_approval'
     RETURNING id, full_name, phone`,
    [id]
  );
  if (r.rows.length === 0) {
    return response.error(res, 'السائق غير موجود أو ليس بانتظار الاعتماد', 400);
  }
  await query(
    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values)
     VALUES ($1, 'DRIVER_APPROVED', 'drivers', $2, $3)`,
    [req.user.id, id, JSON.stringify({ approval_status: 'active' })]
  );
  return response.success(res, r.rows[0], 'تم اعتماد السائق');
});

const reject = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const r = await query(
    `UPDATE drivers SET approval_status = 'rejected', updated_at = NOW()
     WHERE id = $1 AND approval_status = 'pending_approval'
     RETURNING id, full_name, phone`,
    [id]
  );
  if (r.rows.length === 0) {
    return response.error(res, 'السائق غير موجود أو ليس بانتظار الاعتماد', 400);
  }
  await query(
    `UPDATE users SET status = 'blocked' WHERE id = (SELECT user_id FROM drivers WHERE id = $1)`,
    [id]
  );
  await query(
    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values)
     VALUES ($1, 'DRIVER_REJECTED', 'drivers', $2, $3)`,
    [req.user.id, id, JSON.stringify({ approval_status: 'rejected', reason })]
  );
  return response.success(res, r.rows[0], 'تم رفض السائق');
});

const suspend = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  await query(
    `UPDATE drivers SET approval_status = 'suspended', updated_at = NOW() WHERE id = $1`,
    [id]
  );
  await query(
    `UPDATE users SET status = 'suspended' WHERE id = (SELECT user_id FROM drivers WHERE id = $1)`,
    [id]
  );
  await query(
    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values)
     VALUES ($1, 'DRIVER_SUSPENDED', 'drivers', $2, $3)`,
    [req.user.id, id, JSON.stringify({ reason })]
  );
  return response.success(res, { id, status: 'suspended' }, 'تم تعليق السائق');
});

// ============ الحسابات المالية ============

const listWithBalance = asyncHandler(async (req, res) => {
  const r = await query(`
    SELECT d.id, d.full_name, d.phone, d.driver_type, d.status,
           d.approval_status, d.current_balance,
           u.email,
           (SELECT v.plate_number FROM vehicles v
            WHERE v.current_driver_id = d.id LIMIT 1) AS plate_number,
           (SELECT COUNT(*) FROM loading_faxes lf WHERE lf.driver_id = d.id) AS trips_count,
           (SELECT COALESCE(SUM(debit), 0) FROM driver_ledger dl
            WHERE dl.driver_id = d.id AND dl.transaction_type = 'transport_due') AS total_dues,
           (SELECT COALESCE(SUM(credit), 0) FROM driver_ledger dl
            WHERE dl.driver_id = d.id AND dl.transaction_type = 'payment') AS total_paid
    FROM drivers d
    JOIN users u ON u.id = d.user_id
    ORDER BY d.current_balance DESC, d.full_name ASC
  `);
  return response.success(res, r.rows, 'السائقون');
});

const ledgerService = require('./driver-ledger.service');

const parseAmount = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const payDriver = asyncHandler(async (req, res) => {
  const amount = parseAmount(req.body.amount);
  if (!amount) return response.error(res, 'المبلغ مطلوب', 400);
  const { method, reference, description } = req.body;
  const r = await ledgerService.recordPayment(
    req.params.id, { amount, method, reference, description }, req.user.id
  );
  await query(
    `INSERT INTO notifications (user_id, title_ar, body_ar, type, reference_type, reference_id)
     SELECT d.user_id, 'تم تسجيل دفعة', 'تم تحويل ' || $1::text || ' ريال إلى حسابك.',
            'PAYMENT_RECEIVED', 'drivers', d.id
     FROM drivers d WHERE d.id = $2`,
    [String(amount), req.params.id]
  );
  return response.success(res, r, 'تم تسجيل الدفعة');
});

const advanceDriver = asyncHandler(async (req, res) => {
  const amount = parseAmount(req.body.amount);
  if (!amount) return response.error(res, 'المبلغ مطلوب', 400);
  const r = await ledgerService.recordAdvance(
    req.params.id,
    { amount, reference: req.body.reference, description: req.body.description },
    req.user.id
  );
  return response.success(res, r, 'تم تسجيل السلفة');
});

const deductDriver = asyncHandler(async (req, res) => {
  const amount = parseAmount(req.body.amount);
  if (!amount) return response.error(res, 'المبلغ مطلوب', 400);
  const r = await ledgerService.recordDeduction(
    req.params.id,
    { amount, reference: req.body.reference, description: req.body.reason },
    req.user.id
  );
  return response.success(res, r, 'تم تسجيل الخصم');
});

const getStatement = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { from, to } = req.query;

  let sql = `
    SELECT dl.*,
           (SELECT order_number FROM orders WHERE id = dl.order_id) AS order_number
    FROM driver_ledger dl
    WHERE dl.driver_id = $1
  `;
  const params = [id];
  if (from) { params.push(from); sql += ` AND dl.created_at >= $${params.length}`; }
  if (to) { params.push(to); sql += ` AND dl.created_at <= $${params.length}`; }
  sql += ` ORDER BY dl.created_at DESC LIMIT 200`;

  const ledger = await query(sql, params);

  const summary = await query(`
    SELECT
      COALESCE(SUM(CASE WHEN transaction_type = 'transport_due' THEN debit ELSE 0 END), 0) AS total_dues,
      COALESCE(SUM(CASE WHEN transaction_type = 'payment' THEN credit ELSE 0 END), 0) AS total_paid,
      COALESCE(SUM(CASE WHEN transaction_type = 'advance' THEN debit ELSE 0 END), 0) AS total_advances,
      COALESCE(SUM(CASE WHEN transaction_type = 'deduction' THEN debit ELSE 0 END), 0) AS total_deductions,
      (SELECT current_balance FROM drivers WHERE id = $1) AS current_balance
    FROM driver_ledger WHERE driver_id = $1
  `, [id]);

  return response.success(res, {
    summary: summary.rows[0],
    ledger: ledger.rows,
  }, 'كشف الحساب');
});

module.exports = {
  // اعتماد السائقين
  listPending, listAll, approve, reject, suspend,
  // الحسابات
  listWithBalance, payDriver, advanceDriver, deductDriver, getStatement,
};
