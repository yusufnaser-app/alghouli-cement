require('dotenv').config();
const { pool } = require('../src/config/db');
(async () => {
  const c = await pool.connect();
  try {
    await c.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_normalized VARCHAR(20)`);
    await c.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMP`);
    await c.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status VARCHAR(30) DEFAULT 'active'`);
    await c.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_ip VARCHAR(45)`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_users_phone_norm ON users(phone_normalized)`);
    console.log('✅ users موسع');
  } catch (e) { console.error('❌', e.message); }
  finally { c.release(); await pool.end(); }
})();
