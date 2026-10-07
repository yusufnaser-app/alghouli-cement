const { pool, query } = require('../../config/db');

const getDriverIdFromUser = async (userId) => {
  const r = await query(`SELECT id FROM drivers WHERE user_id = $1`, [userId]);
  return r.rows[0]?.id || null;
};

/**
 * كشف حساب السائق
 */
const getLedger = async (driverId, opts = {}) => {
  let sql = `
    SELECT dl.*, o.order_number
    FROM driver_ledger dl
    LEFT JOIN orders o ON o.id = dl.order_id
    WHERE dl.driver_id = $1
  `;
  const params = [driverId];

  if (opts.from) {
    params.push(opts.from);
    sql += ` AND dl.created_at >= $${params.length}`;
  }
  if (opts.to) {
    params.push(opts.to);
    sql += ` AND dl.created_at <= $${params.length}`;
  }

  params.push(opts.limit || 200);
  sql += ` ORDER BY dl.created_at DESC LIMIT $${params.length}`;
  const r = await query(sql, params);
  return r.rows;
};

/**
 * ملخص الحساب
 */
const getSummary = async (driverId) => {
  const r = await query(
    `SELECT
       d.full_name, d.phone, d.current_balance,
       COALESCE(SUM(dl.debit), 0) AS total_dues,
       COALESCE(SUM(dl.credit), 0) AS total_paid,
       COALESCE(SUM(CASE WHEN dl.transaction_type = 'advance' THEN dl.debit ELSE 0 END), 0) AS total_advances,
       COALESCE(SUM(CASE WHEN dl.transaction_type = 'deduction' THEN dl.debit ELSE 0 END), 0) AS total_deductions
     FROM drivers d
     LEFT JOIN driver_ledger dl ON dl.driver_id = d.id
     WHERE d.id = $1
     GROUP BY d.id, d.full_name, d.phone, d.current_balance`,
    [driverId]
  );
  return r.rows[0] || null;
};

/**
 * حركات السائق المالية الثلاث (دفعة / سلفة / خصم) — كلها دائن (تُنقص ما تدين به المؤسسة للسائق).
 * كانت السلفة والخصم تُسجَّلان كمدين بينما الرصيد ينقص (إشارة خاطئة): صُحّح الآن.
 * تمر عبر نواة الدفتر: قفل + مفتاح عدم تكرار اختياري + تدقيق داخل نفس المعاملة.
 */
const recordDriverMovement = async (driverId, data, userId, type, defaultDesc, ctx = {}) => {
  const core = require('../accounting/ledger.core');
  const { logAudit } = require('../audit/audit.service');
  const { AccountingError } = require('../accounting/accounting.engine');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await core.postDriverEntry(client, {
      driverId, currency: 'YER', debit: 0, credit: String(data.amount), transactionType: type,
      description: data.description || defaultDesc, referenceCode: data.reference || `${type.toUpperCase()}-${Date.now()}`,
      sourceType: `driver_${type}`, idempotencyKey: data.idempotencyKey ? `driver-${type}:${driverId}:${data.idempotencyKey}` : undefined,
      createdBy: userId,
    });
    if (!r.duplicate) {
      await logAudit(client, {
        userId, action: `DRIVER_${type.toUpperCase()}`, entityType: 'driver_ledger', entityId: r.entry.id,
        newValues: { driver_id: driverId, amount: String(data.amount), reference: data.reference || null },
        reason: data.description || null, ip: ctx.ip, userAgent: ctx.userAgent,
      });
    }
    await client.query('COMMIT');
    return { new_balance: parseFloat(r.balance), duplicate: r.duplicate };
  } catch (err) {
    await client.query('ROLLBACK');
    if (err instanceof AccountingError) { const e = new Error(err.message); e.status = err.status; throw e; }
    throw err;
  } finally {
    client.release();
  }
};
/**
 * رصيد افتتاحي لسائق مؤسسة فقط (سائق التاجر حسابه عند تاجره). دفتر السائق بالريال فقط (رصيد واحد).
 * side: owed_to_driver (مستحق للسائق ← debit) | owed_by_driver (على السائق للمؤسسة ← credit).
 * واحد لكل (سائق، عملة): فهرس uq_driver_ledger_opening. المرجع الرسمي PENDING في طابور YemenSoft.
 * asOf لا عمود له في driver_ledger (لا entry_date) → يُسجَّل في الوصف والتدقيق فقط.
 */
const setDriverOpeningBalance = async (driverId, { amount, side, currency = 'YER', asOf, notes }, userId, ctx = {}) => {
  const core = require('../accounting/ledger.core');
  const engine = require('../accounting/accounting.engine');
  const { AccountingError } = engine;
  const { logAudit } = require('../audit/audit.service');
  const { enqueueSync } = require('../accounting/accounting-integration.service');
  const fail = (message, code, status) => { const e = new Error(message); e.code = code; e.status = status; return e; };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (currency !== 'YER') throw fail('دفتر السائق بالريال اليمني فقط', 'DRIVER_CURRENCY_YER_ONLY', 422);
    if (!['owed_to_driver', 'owed_by_driver'].includes(side)) throw fail('الجانب يجب أن يكون owed_to_driver أو owed_by_driver', 'INVALID_SIDE', 400);
    if (engine.toMinor(amount) <= 0) throw fail('مبلغ غير صالح', 'INVALID_AMOUNT', 400);

    const d = await client.query(`SELECT id, driver_type, owner_trader_id FROM drivers WHERE id = $1 FOR UPDATE`, [driverId]);
    if (!d.rows.length) throw fail('السائق غير موجود', 'DRIVER_NOT_FOUND', 404);
    if (d.rows[0].driver_type !== 'institution_driver' || d.rows[0].owner_trader_id) {
      throw fail('الرصيد الافتتاحي لسائقي المؤسسة فقط — سائق التاجر حسابه عند تاجره', 'NOT_INSTITUTION_DRIVER', 422);
    }

    const r = await core.postDriverEntry(client, {
      driverId, currency, debit: side === 'owed_to_driver' ? String(amount) : 0, credit: side === 'owed_by_driver' ? String(amount) : 0,
      transactionType: 'opening_balance',
      description: `${notes || 'رصيد افتتاحي'}${asOf ? ` (بتاريخ ${asOf})` : ''}`,
      referenceCode: `OPEN-DRV-${currency}`, sourceType: 'opening_balance',
      idempotencyKey: `opening:driver:${driverId}:${currency}`, createdBy: userId,
    });
    if (r.duplicate) throw fail('يوجد رصيد افتتاحي لهذا السائق؛ صحّحه بتسوية أو عكس', 'OPENING_EXISTS', 409);

    await logAudit(client, {
      userId, action: 'DRIVER_OPENING_BALANCE_SET', entityType: 'driver_ledger', entityId: r.entry.id,
      newValues: { driver_id: driverId, amount: String(amount), side, currency, as_of: asOf || null },
      reason: notes || null, ip: ctx.ip, userAgent: ctx.userAgent,
    });
    await enqueueSync({
      client, operation: 'POST_OPENING_BALANCE', entityType: 'driver_ledger', entityId: r.entry.id,
      payload: { party: 'driver', driver_id: driverId, amount: String(amount), side, currency, as_of: asOf || null, reference: `OPEN-DRV-${currency}` },
      idempotencyKey: `sync:opening:driver:${driverId}:${currency}`, createdBy: userId,
    });
    await client.query('COMMIT');
    return { entry_id: r.entry.id, currency, new_balance: parseFloat(r.balance), sync_status: 'PENDING' };
  } catch (err) {
    await client.query('ROLLBACK');
    if (err instanceof AccountingError) { const e = new Error(err.message); e.status = err.status; e.code = err.code; throw e; }
    throw err;
  } finally {
    client.release();
  }
};

const recordPayment = (driverId, data, userId, ctx) => recordDriverMovement(driverId, data, userId, 'payment', `دفعة - ${data.method || 'نقدي'}`, ctx);
const recordAdvance = (driverId, data, userId, ctx) => recordDriverMovement(driverId, data, userId, 'advance', 'سلفة', ctx);
const recordDeduction = (driverId, data, userId, ctx) => recordDriverMovement(driverId, data, userId, 'deduction', 'خصم', ctx);

/**
 * قائمة السائقين مع أرصدتهم
 */
const listDriversWithBalance = async (filters = {}) => {
  let sql = `
    SELECT d.id, d.full_name, d.phone, d.driver_type, d.approval_status,
           d.current_balance, d.status,
           (SELECT COUNT(*) FROM deliveries WHERE driver_id = d.id) AS trips_count,
           (SELECT COALESCE(SUM(quantity), 0) FROM order_items oi
            JOIN deliveries dd ON dd.order_id = oi.order_id
            WHERE dd.driver_id = d.id) AS total_quantity
    FROM drivers d
    WHERE 1=1
  `;
  const params = [];
  if (filters.driverType) {
    params.push(filters.driverType);
    sql += ` AND d.driver_type = $${params.length}`;
  }
  if (filters.hasBalance === 'true') {
    sql += ` AND d.current_balance > 0`;
  }
  sql += ` ORDER BY d.current_balance DESC, d.full_name ASC`;
  const r = await query(sql, params);
  return r.rows;
};

module.exports = {
  getDriverIdFromUser,
  getLedger,
  getSummary,
  recordPayment,
  recordAdvance,
  recordDeduction,
  setDriverOpeningBalance,
  listDriversWithBalance,
};

// الملف الشخصي للسائق
const getMyProfile = async (userId) => {
  const { query } = require('../../config/db');
  const r = await query(
    `SELECT d.id, d.full_name, d.phone, d.driver_type, d.status,
            d.approval_status, d.current_balance,
            d.national_id, d.address, d.photo_url,
            d.license_number, d.license_expiry,
            u.email,
            (SELECT json_agg(json_build_object(
              'id', v.id, 'plate_number', v.plate_number,
              'vehicle_type', v.vehicle_type, 'capacity_tons', v.capacity_tons,
              'capacity_bags', v.capacity_bags, 'operating_status', v.operating_status
            ))
            FROM vehicles v
            WHERE v.current_driver_id = d.id) AS vehicles
     FROM drivers d
     JOIN users u ON u.id = d.user_id
     WHERE d.user_id = $1`,
    [userId]
  );
  return r.rows[0] || null;
};

module.exports.getMyProfile = getMyProfile;

// تحديث الملف الشخصي
const updateMyProfile = async (userId, data) => {
  const { query } = require('../../config/db');
  const fields = [];
  const params = [];

  const map = {
    fullName: 'full_name',
    nationalId: 'national_id',
    address: 'address',
    licenseNumber: 'license_number',
    licenseExpiry: 'license_expiry',
    photoUrl: 'photo_url',
  };

  for (const [k, col] of Object.entries(map)) {
    if (data[k] !== undefined) {
      params.push(data[k]);
      fields.push(`${col} = $${params.length}`);
    }
  }

  if (fields.length === 0) {
    const err = new Error('لا توجد بيانات للتحديث');
    err.status = 400;
    throw err;
  }

  params.push(userId);
  const r = await query(
    `UPDATE drivers SET ${fields.join(', ')}
     WHERE user_id = $${params.length}
     RETURNING id, full_name, national_id, address, license_number, license_expiry`,
    params
  );
  if (r.rows.length === 0) {
    const err = new Error('السائق غير موجود');
    err.status = 404;
    throw err;
  }

  // حدّث الاسم في users أيضًا
  if (data.fullName) {
    await query(`UPDATE users SET full_name = $1 WHERE id = $2`, [data.fullName, userId]);
  }

  return r.rows[0];
};

module.exports.updateMyProfile = updateMyProfile;
