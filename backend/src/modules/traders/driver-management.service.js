const { pool, query } = require('../../config/db');
const bcrypt = require('bcryptjs');

// احصل على customer_id من user_id
const getTraderId = async (userId) => {
  const r = await query(`SELECT id FROM customers WHERE user_id = $1`, [userId]);
  return r.rows[0]?.id || null;
};

// احصل على قائمة سائقي التاجر
const listMyDrivers = async (userId) => {
  const traderId = await getTraderId(userId);
  if (!traderId) {
    const err = new Error('التاجر غير موجود');
    err.status = 404;
    throw err;
  }
  const r = await query(
    `SELECT d.id, d.full_name, d.phone, d.driver_type, d.status, d.approval_status,
            d.current_balance, d.created_at,
            (SELECT COUNT(*) FROM vehicles v WHERE v.owner_trader_id = $1 AND v.current_driver_id = d.id) AS vehicles_count,
            (SELECT COUNT(*) FROM deliveries dd WHERE dd.driver_id = d.id) AS trips_count
     FROM drivers d
     WHERE d.owner_trader_id = $1
     ORDER BY d.created_at DESC`,
    [traderId]
  );
  return r.rows;
};

// احصل على قائمة قاطرات التاجر
const listMyVehicles = async (userId) => {
  const traderId = await getTraderId(userId);
  if (!traderId) {
    const err = new Error('التاجر غير موجود');
    err.status = 404;
    throw err;
  }
  const r = await query(
    `SELECT v.*, d.full_name AS driver_name
     FROM vehicles v
     LEFT JOIN drivers d ON d.id = v.current_driver_id
     WHERE v.owner_trader_id = $1
     ORDER BY v.created_at DESC`,
    [traderId]
  );
  return r.rows;
};

// التاجر يضيف سائقًا جديدًا
const addDriver = async (userId, data) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const traderId = await getTraderId(userId);
    if (!traderId) {
      const err = new Error('التاجر غير موجود');
      err.status = 404;
      throw err;
    }

    // تحقق من عدم وجود مستخدم بنفس الهاتف
    const ex = await client.query(`SELECT id FROM users WHERE phone = $1`, [data.phone]);
    if (ex.rows.length > 0) {
      const err = new Error('رقم الهاتف مسجل مسبقًا');
      err.status = 409;
      err.code = 'PHONE_EXISTS';
      throw err;
    }

    // أنشئ مستخدم بكلمة مرور افتراضية
    const tempPassword = data.password || 'Driver@' + Math.floor(1000 + Math.random() * 9000);
    const hash = await bcrypt.hash(tempPassword, 12);

    const u = await client.query(
      `INSERT INTO users (full_name, phone, password_hash, user_type, otp_verified, status)
       VALUES ($1, $2, $3, 'driver', TRUE, 'active')
       RETURNING id`,
      [data.fullName, data.phone, hash]
    );
    const driverUserId = u.rows[0].id;

    // اربط بدور driver
    const r = await client.query(`SELECT id FROM roles WHERE name = 'driver'`);
    if (r.rows.length > 0) {
      await client.query(
        `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [driverUserId, r.rows[0].id]
      );
    }

    // أنشئ صف driver
    const d = await client.query(
      `INSERT INTO drivers
       (user_id, full_name, phone, driver_type, owner_trader_id, approval_status, status)
       VALUES ($1, $2, $3, 'trader_driver', $4, 'active', 'available')
       RETURNING *`,
      [driverUserId, data.fullName, data.phone, traderId]
    );

    // إذا أعطى رقم قاطرة — أنشئ قاطرة
    let vehicle = null;
    if (data.vehiclePlate) {
      const v = await client.query(
        `INSERT INTO vehicles
         (plate_number, vehicle_type, capacity_tons, owner_trader_id, current_driver_id, owner_type, status)
         VALUES ($1, $2, $3, $4, $5, 'trader', 'available')
         RETURNING *`,
        [data.vehiclePlate, data.vehicleType || 'truck_10t', data.capacityTons || 10, traderId, d.rows[0].id]
      );
      vehicle = v.rows[0];
    }

    await client.query('COMMIT');
    return {
      driver: d.rows[0],
      vehicle,
      credentials: {
        phone: data.phone,
        password: tempPassword,
      },
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// تحديث بيانات سائق
const updateDriver = async (userId, driverId, data) => {
  const traderId = await getTraderId(userId);
  if (!traderId) {
    const err = new Error('التاجر غير موجود');
    err.status = 404;
    throw err;
  }
  const r = await query(
    `UPDATE drivers SET
       full_name = COALESCE($1, full_name),
       phone = COALESCE($2, phone),
       status = COALESCE($3, status),
       updated_at = NOW()
     WHERE id = $4 AND owner_trader_id = $5
     RETURNING *`,
    [data.fullName || null, data.phone || null, data.status || null, driverId, traderId]
  );
  if (r.rows.length === 0) {
    const err = new Error('السائق غير موجود أو لا يتبع لك');
    err.status = 404;
    throw err;
  }
  return r.rows[0];
};

// حذف سائق (فقط إذا لم يكن لديه رحلات)
const removeDriver = async (userId, driverId) => {
  const traderId = await getTraderId(userId);
  if (!traderId) {
    const err = new Error('التاجر غير موجود');
    err.status = 404;
    throw err;
  }

  const trips = await query(`SELECT COUNT(*) AS c FROM deliveries WHERE driver_id = $1`, [driverId]);
  if (parseInt(trips.rows[0].c, 10) > 0) {
    const err = new Error('لا يمكن حذف سائق لديه رحلات');
    err.status = 400;
    throw err;
  }

  const r = await query(
    `DELETE FROM drivers WHERE id = $1 AND owner_trader_id = $2 RETURNING user_id`,
    [driverId, traderId]
  );
  if (r.rows.length === 0) {
    const err = new Error('السائق غير موجود');
    err.status = 404;
    throw err;
  }

  // احذف user
  if (r.rows[0].user_id) {
    await query(`DELETE FROM users WHERE id = $1`, [r.rows[0].user_id]);
  }
  return true;
};

// إضافة قاطرة للتاجر
const addVehicle = async (userId, data) => {
  const traderId = await getTraderId(userId);
  if (!traderId) {
    const err = new Error('التاجر غير موجود');
    err.status = 404;
    throw err;
  }
  const r = await query(
    `INSERT INTO vehicles
     (plate_number, vehicle_type, capacity_tons, capacity_bags, owner_trader_id,
      current_driver_id, owner_type, status, notes)
     VALUES ($1, $2, $3, $4, $5, $6, 'trader', 'available', $7)
     RETURNING *`,
    [
      data.plateNumber, data.vehicleType || 'truck_10t',
      data.capacityTons || 10, data.capacityBags || null,
      traderId, data.currentDriverId || null, data.notes || null,
    ]
  );
  return r.rows[0];
};

// حذف قاطرة
const removeVehicle = async (userId, vehicleId) => {
  const traderId = await getTraderId(userId);
  if (!traderId) {
    const err = new Error('التاجر غير موجود');
    err.status = 404;
    throw err;
  }
  const r = await query(
    `DELETE FROM vehicles WHERE id = $1 AND owner_trader_id = $2 RETURNING id`,
    [vehicleId, traderId]
  );
  if (r.rows.length === 0) {
    const err = new Error('القاطرة غير موجودة');
    err.status = 404;
    throw err;
  }
  return true;
};

module.exports = {
  getTraderId,
  listMyDrivers,
  listMyVehicles,
  addDriver,
  updateDriver,
  removeDriver,
  addVehicle,
  removeVehicle,
};
