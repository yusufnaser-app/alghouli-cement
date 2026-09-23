require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../src/config/db');

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const phone = '967771111111';
    const password = 'Driver@123';
    const fullName = 'سالم أحمد (سائق تجريبي)';

    // 1. ابحث عن المستخدم أو أنشئه
    let userId;
    const existing = await client.query(`SELECT id FROM users WHERE phone = $1`, [phone]);
    const hash = await bcrypt.hash(password, 12);

    if (existing.rows.length > 0) {
      userId = existing.rows[0].id;
      await client.query(
        `UPDATE users SET password_hash = $1, user_type = 'driver', otp_verified = TRUE, status = 'active' WHERE id = $2`,
        [hash, userId]
      );
      console.log('👤 المستخدم موجود — تم تحديث كلمة المرور');
    } else {
      const u = await client.query(
        `INSERT INTO users (full_name, phone, password_hash, user_type, otp_verified, status)
         VALUES ($1, $2, $3, 'driver', TRUE, 'active') RETURNING id`,
        [fullName, phone, hash]
      );
      userId = u.rows[0].id;
      console.log('👤 تم إنشاء مستخدم جديد');
    }

    // 2. اربطه بدور driver (إن لم يكن مربوطًا)
    const r = await client.query(`SELECT id FROM roles WHERE name = 'driver'`);
    if (r.rows.length > 0) {
      await client.query(
        `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [userId, r.rows[0].id]
      );
    }

    // 3. ابحث عن صف driver أو أنشئه
    const d = await client.query(`SELECT id FROM drivers WHERE user_id = $1 OR phone = $2`, [userId, phone]);
    if (d.rows.length > 0) {
      await client.query(
        `UPDATE drivers SET user_id = $1, driver_type = 'institution_driver', approval_status = 'active', status = 'available' WHERE id = $2`,
        [userId, d.rows[0].id]
      );
      console.log('🚛 السائق موجود — تم تحديث حالته');
    } else {
      await client.query(
        `INSERT INTO drivers (user_id, full_name, phone, driver_type, approval_status, status)
         VALUES ($1, $2, $3, 'institution_driver', 'active', 'available')`,
        [userId, fullName, phone]
      );
      console.log('🚛 تم إنشاء سائق جديد');
    }

    await client.query('COMMIT');
    console.log('');
    console.log('✅ جاهز للدخول:');
    console.log('   📱 الهاتف: ' + phone);
    console.log('   🔑 كلمة المرور: ' + password);
    console.log('');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌', e.message);
  } finally {
    client.release();
    await pool.end();
  }
}
main();
