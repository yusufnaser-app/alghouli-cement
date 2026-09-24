const bcrypt = require('bcryptjs');
const { pool, query } = require('../../config/db');
const { signAccess, signRefresh, verifyRefresh } = require('../../utils/jwt');

const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

const createOtp = async (phone, purpose = 'register') => {
  const code = generateOtp();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  await query(
    `INSERT INTO otp_codes (phone, code, purpose, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [phone, code, purpose, expiresAt]
  );
  console.log(`📱 OTP لـ ${phone}: ${code}`);
  return code;
};

const verifyOtpCode = async (phone, code, purpose = 'register') => {
  const result = await query(
    `SELECT id FROM otp_codes
     WHERE phone = $1 AND code = $2 AND purpose = $3
       AND used_at IS NULL AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [phone, code, purpose]
  );
  if (result.rows.length === 0) return null;
  await query(`UPDATE otp_codes SET used_at = NOW() WHERE id = $1`, [result.rows[0].id]);
  return result.rows[0];
};

const getCapacityForVehicleType = (type) => ({
  truck_10t: 10,
  truck_20t: 20,
  tanker: 30,
  pickup: 3,
}[type] || 10);

const register = async (data) => {
  const existing = await query(`SELECT id, otp_verified FROM users WHERE phone = $1`, [data.phone]);

  if (existing.rows.length > 0) {
    if (existing.rows[0].otp_verified) {
      const err = new Error('رقم الهاتف مسجل مسبقًا');
      err.status = 409;
      err.code = 'DUPLICATE_ENTRY';
      throw err;
    }
    const code = await createOtp(data.phone, 'register');
    return {
      userId: existing.rows[0].id,
      phone: data.phone,
      otpSent: true,
      resent: true,
      devOtp: code,
    };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ============ سائق ============
    if (data.userType === 'driver') {
      if (!data.password || data.password.length < 6) {
        const err = new Error('كلمة المرور مطلوبة');
        err.status = 400;
        throw err;
      }
      if (!data.nationalId) {
        const err = new Error('رقم البطاقة مطلوب');
        err.status = 400;
        throw err;
      }
      if (!data.plateNumber) {
        const err = new Error('رقم اللوحة مطلوب');
        err.status = 400;
        throw err;
      }
      if (!data.vehicleType) {
        const err = new Error('نوع القاطرة مطلوب');
        err.status = 400;
        throw err;
      }

      // تحقق من رقم اللوحة
      const plate = await client.query(
        `SELECT id FROM vehicles WHERE plate_number = $1`,
        [data.plateNumber]
      );
      if (plate.rows.length > 0) {
        const err = new Error('رقم اللوحة مسجل مسبقًا');
        err.status = 409;
        err.code = 'PLATE_EXISTS';
        throw err;
      }

      const hash = await bcrypt.hash(data.password, 12);

      const u = await client.query(
        `INSERT INTO users (full_name, phone, password_hash, user_type, otp_verified, status)
         VALUES ($1, $2, $3, 'driver', FALSE, 'active')
         RETURNING id`,
        [data.fullName, data.phone, hash]
      );
      const userId = u.rows[0].id;

      await client.query(
        `INSERT INTO user_roles (user_id, role_id)
         SELECT $1, id FROM roles WHERE name = 'driver'
         ON CONFLICT DO NOTHING`,
        [userId]
      );

      const d = await client.query(
        `INSERT INTO drivers
         (user_id, full_name, phone, driver_type, approval_status, status, national_id)
         VALUES ($1, $2, $3, 'institution_driver', 'pending_approval', 'available', $4)
         RETURNING id`,
        [userId, data.fullName, data.phone, data.nationalId]
      );
      const driverId = d.rows[0].id;

      await client.query(
        `INSERT INTO vehicles
         (plate_number, vehicle_type, capacity_tons, owner_type, status, current_driver_id)
         VALUES ($1, $2, $3, 'company', 'available', $4)`,
        [
          data.plateNumber,
          data.vehicleType,
          getCapacityForVehicleType(data.vehicleType),
          driverId,
        ]
      );

      await client.query('COMMIT');
      const code = await createOtp(data.phone, 'register');
      return {
        userId,
        phone: data.phone,
        otpSent: true,
        devOtp: code,
        userType: 'driver',
      };
    }

    // ============ عميل ============
    if (!data.customerType) {
      const err = new Error('نوع العميل مطلوب');
      err.status = 400;
      throw err;
    }
    if (!data.governorate) {
      const err = new Error('المحافظة مطلوبة');
      err.status = 400;
      throw err;
    }

    const u = await client.query(
      `INSERT INTO users (full_name, phone, user_type, status)
       VALUES ($1, $2, 'customer', 'active')
       RETURNING id`,
      [data.fullName, data.phone]
    );
    const userId = u.rows[0].id;

    await client.query(
      `INSERT INTO customers (user_id, customer_type, governorate, area, default_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, data.customerType, data.governorate, data.area || null, data.address || null]
    );

    await client.query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT $1, id FROM roles WHERE name = 'customer'
       ON CONFLICT DO NOTHING`,
      [userId]
    );

    await client.query('COMMIT');
    const code = await createOtp(data.phone, 'register');
    return {
      userId,
      phone: data.phone,
      otpSent: true,
      devOtp: code,
      userType: 'customer',
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const verify = async (phone, code) => {
  const otp = await verifyOtpCode(phone, code, 'register');
  if (!otp) {
    const err = new Error('رمز التحقق غير صحيح أو منتهي');
    err.status = 400;
    err.code = 'INVALID_OTP';
    throw err;
  }

  await query(
    `UPDATE users SET otp_verified = TRUE, last_login_at = NOW() WHERE phone = $1`,
    [phone]
  );

  // إذا سائق — اعتمد الهاتف
  await query(
    `UPDATE drivers SET phone_verified_at = NOW() WHERE phone = $1 AND phone_verified_at IS NULL`,
    [phone]
  );

  const result = await query(
    `SELECT u.id, u.full_name, u.phone, u.user_type,
            c.customer_type,
            COALESCE(json_agg(r.name) FILTER (WHERE r.name IS NOT NULL), '[]') AS roles
     FROM users u
     LEFT JOIN customers c ON c.user_id = u.id
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN roles r ON r.id = ur.role_id
     WHERE u.phone = $1
     GROUP BY u.id, c.customer_type`,
    [phone]
  );

  const user = result.rows[0];
  const payload = { userId: user.id, userType: user.user_type };

  return {
    token: signAccess(payload),
    refreshToken: signRefresh(payload),
    user: {
      id: user.id,
      fullName: user.full_name,
      phone: user.phone,
      userType: user.user_type,
      customerType: user.customer_type,
      roles: user.roles,
    },
  };
};

const login = async (phone, password) => {
  const result = await query(
    `SELECT u.id, u.full_name, u.phone, u.user_type, u.password_hash, u.status,
            c.customer_type,
            COALESCE(json_agg(r.name) FILTER (WHERE r.name IS NOT NULL), '[]') AS roles
     FROM users u
     LEFT JOIN customers c ON c.user_id = u.id
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN roles r ON r.id = ur.role_id
     WHERE u.phone = $1
     GROUP BY u.id, c.customer_type`,
    [phone]
  );

  if (result.rows.length === 0 || !result.rows[0].password_hash) {
    const err = new Error('بيانات الدخول غير صحيحة');
    err.status = 401;
    throw err;
  }

  const user = result.rows[0];
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    const err = new Error('بيانات الدخول غير صحيحة');
    err.status = 401;
    throw err;
  }
  if (user.status !== 'active') {
    const err = new Error('الحساب غير نشط');
    err.status = 403;
    throw err;
  }

  await query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [user.id]);

  const payload = { userId: user.id, userType: user.user_type };
  return {
    token: signAccess(payload),
    refreshToken: signRefresh(payload),
    user: {
      id: user.id,
      fullName: user.full_name,
      phone: user.phone,
      userType: user.user_type,
      customerType: user.customer_type,
      roles: user.roles,
    },
  };
};

const refresh = async (refreshToken) => {
  const payload = verifyRefresh(refreshToken);
  const result = await query(
    `SELECT id, status, user_type FROM users WHERE id = $1`,
    [payload.userId]
  );
  if (result.rows.length === 0 || result.rows[0].status !== 'active') {
    const err = new Error('الحساب غير نشط');
    err.status = 401;
    throw err;
  }
  const user = result.rows[0];
  const newPayload = { userId: user.id, userType: user.user_type };
  return {
    token: signAccess(newPayload),
    refreshToken: signRefresh(newPayload),
  };
};

module.exports = { register, verify, login, refresh, createOtp };
