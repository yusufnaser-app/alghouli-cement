require('dotenv').config();
const { pool } = require('../src/config/db');
(async () => {
  const c = await pool.connect();
  try {
    await c.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS fcm_token TEXT`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_users_fcm ON users(fcm_token)`);
    console.log('✅ m17 — fcm_token');
  } catch (e) { console.error('❌', e.message); }
  finally { c.release(); await pool.end(); }
})();
