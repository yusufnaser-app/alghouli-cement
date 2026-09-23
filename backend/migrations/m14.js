require('dotenv').config();
const { pool } = require('../src/config/db');
(async () => {
  const c = await pool.connect();
  try {
    await c.query(`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS national_id VARCHAR(50)`);
    await c.query(`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS address TEXT`);
    await c.query(`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS photo_url VARCHAR(500)`);
    await c.query(`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS license_number VARCHAR(50)`);
    await c.query(`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS license_expiry DATE`);
    console.log('✅ m14 تم');
  } catch (e) { console.error('❌', e.message); }
  finally { c.release(); await pool.end(); }
})();
