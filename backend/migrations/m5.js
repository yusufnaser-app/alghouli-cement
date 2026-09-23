require('dotenv').config();
const { pool } = require('../src/config/db');
(async () => {
  const c = await pool.connect();
  try {
    await c.query(`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS driver_type VARCHAR(30) DEFAULT 'transport_driver'`);
    await c.query(`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS approval_status VARCHAR(30) DEFAULT 'active'`);
    await c.query(`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS current_balance DECIMAL(14,2) DEFAULT 0`);
    await c.query(`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS id_number_hash VARCHAR(255)`);
    await c.query(`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMP`);
    await c.query(`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS national_id VARCHAR(50)`);
    await c.query(`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS address TEXT`);
    console.log('✅ drivers موسع');
  } catch (e) { console.error('❌', e.message); }
  finally { c.release(); await pool.end(); }
})();
