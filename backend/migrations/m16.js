require('dotenv').config();
const { pool } = require('../src/config/db');
(async () => {
  const c = await pool.connect();
  try {
    await c.query(`ALTER TABLE loading_faxes ADD COLUMN IF NOT EXISTS delivery_address TEXT`);
    await c.query(`ALTER TABLE loading_faxes ADD COLUMN IF NOT EXISTS delivery_governorate VARCHAR(100)`);
    await c.query(`ALTER TABLE loading_faxes ADD COLUMN IF NOT EXISTS delivery_area VARCHAR(100)`);
    console.log('✅ m16');
  } catch (e) { console.error('❌', e.message); }
  finally { c.release(); await pool.end(); }
})();
