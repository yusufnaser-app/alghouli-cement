require('dotenv').config();
const { pool } = require('../src/config/db');
(async () => {
  const c = await pool.connect();
  try {
    await c.query(`ALTER TABLE loading_faxes ADD COLUMN IF NOT EXISTS loading_confirmed_by UUID REFERENCES users(id)`);
    await c.query(`ALTER TABLE loading_faxes ADD COLUMN IF NOT EXISTS loading_confirmed_at TIMESTAMP`);
    await c.query(`ALTER TABLE loading_faxes ADD COLUMN IF NOT EXISTS loaded_quantity DECIMAL(14,2)`);
    await c.query(`ALTER TABLE loading_faxes ADD COLUMN IF NOT EXISTS quantity_discrepancy DECIMAL(14,2)`);
    await c.query(`ALTER TABLE loading_faxes ADD COLUMN IF NOT EXISTS delivered_quantity DECIMAL(14,2)`);
    await c.query(`ALTER TABLE loading_faxes ADD COLUMN IF NOT EXISTS delivery_confirmed_at TIMESTAMP`);
    await c.query(`ALTER TABLE loading_faxes ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMP DEFAULT NOW()`);
    console.log('✅ m15');
  } catch (e) { console.error('❌', e.message); }
  finally { c.release(); await pool.end(); }
})();
