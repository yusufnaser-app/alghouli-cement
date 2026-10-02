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
