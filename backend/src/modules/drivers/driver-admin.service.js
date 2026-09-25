const { query } = require('../../config/db');

// قائمة السائقين المعلقين
const listPending = async () => {
  const r = await query(
    `SELECT d.id, d.full_name, d.phone, d.driver_type, d.approval_status,
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
     ORDER BY d.created_at DESC`
  );
  return r.rows;
};

// كل السائقين
const listAll = async (filters = {}) => {
  let sql = `
    SELECT d.id, d.full_name, d.phone, d.driver_type, d.approval_status,
           d.status, d.national_id, d.current_balance, d.created_at,
           u.id AS user_id,
           (SELECT json_agg(json_build_object(
             'id', v.id, 'plate_number', v.plate_number,
             'vehicle_type', v.vehicle_type
           ))
           FROM vehicles v WHERE v.current_driver_id = d.id) AS vehicles
    FROM drivers d
    JOIN users u ON u.id = d.user_id
    WHERE 1=1
  `;
  const params = [];

  if (filters.approvalStatus) {
    params.push(filters.approvalStatus);
    sql += ` AND d.approval_status = $${params.length}`;
  }
  if (filters.driverType) {
    params.push(filters.driverType);
    sql += ` AND d.driver_type = $${params.length}`;
  }

  sql += ` ORDER BY d.created_at DESC LIMIT 100`;
  const r = await query(sql, params);
  return r.rows;
};

// اعتماد سائق
const approve = async (driverId, adminId) => {
  const r = await query(
    `UPDATE drivers SET approval_status = 'active', updated_at = NOW()
     WHERE id = $1 AND approval_status = 'pending_approval'
     RETURNING id, full_name, phone`,
    [driverId]
  );
  if (r.rows.length === 0) {
    const err = new Error('السائق غير موجود أو ليس بانتظار الاعتماد');
    err.status = 400;
    throw err;
  }

  // سجّل في audit_logs
  await query(
    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values)
     VALUES ($1, 'DRIVER_APPROVED', 'drivers', $2, $3)`,
    [adminId, driverId, JSON.stringify({ approval_status: 'active' })]
  );

  return r.rows[0];
};

// رفض سائق
const reject = async (driverId, adminId, reason) => {
  const r = await query(
    `UPDATE drivers SET approval_status = 'rejected', updated_at = NOW()
     WHERE id = $1 AND approval_status = 'pending_approval'
     RETURNING id, full_name, phone`,
    [driverId]
  );
  if (r.rows.length === 0) {
    const err = new Error('السائق غير موجود أو ليس بانتظار الاعتماد');
    err.status = 400;
    throw err;
  }

  // عطّل المستخدم
  await query(
    `UPDATE users SET status = 'blocked' WHERE id = (SELECT user_id FROM drivers WHERE id = $1)`,
    [driverId]
  );

  await query(
    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values)
     VALUES ($1, 'DRIVER_REJECTED', 'drivers', $2, $3)`,
    [adminId, driverId, JSON.stringify({ approval_status: 'rejected', reason })]
  );

  return r.rows[0];
};

// تعليق سائق نشط
const suspend = async (driverId, adminId, reason) => {
  await query(
    `UPDATE drivers SET approval_status = 'suspended', updated_at = NOW() WHERE id = $1`,
    [driverId]
  );
  await query(
    `UPDATE users SET status = 'suspended' WHERE id = (SELECT user_id FROM drivers WHERE id = $1)`,
    [driverId]
  );
  await query(
    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values)
     VALUES ($1, 'DRIVER_SUSPENDED', 'drivers', $2, $3)`,
    [adminId, driverId, JSON.stringify({ reason })]
  );
  return { id: driverId, status: 'suspended' };
};

module.exports = { listPending, listAll, approve, reject, suspend };
