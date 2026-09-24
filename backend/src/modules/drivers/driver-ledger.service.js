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
 * تسجيل دفعة للسائق
 */
const recordPayment = async (driverId, data, userId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const d = await client.query(
      `SELECT id, current_balance FROM drivers WHERE id = $1 FOR UPDATE`,
      [driverId]
    );
    if (d.rows.length === 0) {
      const err = new Error('السائق غير موجود');
      err.status = 404;
      throw err;
    }
    const balance = parseFloat(d.rows[0].current_balance || 0);
    const newBalance = balance - data.amount;

    await client.query(
      `INSERT INTO driver_ledger
       (driver_id, transaction_type, description, debit, credit, balance_after,
        reference_code, created_by)
       VALUES ($1, 'payment', $2, 0, $3, $4, $5, $6)`,
      [
        driverId,
        data.description || `دفعة - ${data.method || 'نقدي'}`,
        data.amount,
        newBalance,
        data.reference || null,
        userId,
      ]
    );

    await client.query(
      `UPDATE drivers SET current_balance = $1 WHERE id = $2`,
      [newBalance, driverId]
    );

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
 * تسجيل سلفة للسائق
 */
const recordAdvance = async (driverId, data, userId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const d = await client.query(
      `SELECT id, current_balance FROM drivers WHERE id = $1 FOR UPDATE`,
      [driverId]
    );
    if (d.rows.length === 0) {
      const err = new Error('السائق غير موجود');
      err.status = 404;
      throw err;
    }
    const balance = parseFloat(d.rows[0].current_balance || 0);
    const newBalance = balance + data.amount;

    await client.query(
      `INSERT INTO driver_ledger
       (driver_id, transaction_type, description, debit, credit, balance_after,
        reference_code, created_by)
       VALUES ($1, 'advance', $2, $3, 0, $4, $5, $6)`,
      [
        driverId,
        data.description || 'سلفة',
        data.amount,
        newBalance,
        data.reference || null,
        userId,
      ]
    );

    await client.query(
      `UPDATE drivers SET current_balance = $1 WHERE id = $2`,
      [newBalance, driverId]
    );

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
 * خصم من السائق
 */
const recordDeduction = async (driverId, data, userId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const d = await client.query(
      `SELECT id, current_balance FROM drivers WHERE id = $1 FOR UPDATE`,
      [driverId]
    );
    if (d.rows.length === 0) {
      const err = new Error('السائق غير موجود');
      err.status = 404;
      throw err;
    }
    const balance = parseFloat(d.rows[0].current_balance || 0);
    const newBalance = balance + data.amount;

    await client.query(
      `INSERT INTO driver_ledger
       (driver_id, transaction_type, description, debit, credit, balance_after,
        reference_code, created_by)
       VALUES ($1, 'deduction', $2, $3, 0, $4, $5, $6)`,
      [
        driverId,
        data.description || 'خصم',
        data.amount,
        newBalance,
        data.reference || null,
        userId,
      ]
    );

    await client.query(
      `UPDATE drivers SET current_balance = $1 WHERE id = $2`,
      [newBalance, driverId]
    );

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
