require('dotenv').config();
const { pool } = require('../src/config/db');
(async () => {
  const c = await pool.connect();
  try {
    await c.query(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS operating_status VARCHAR(30) DEFAULT 'available'`);
    await c.query(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS current_order_id UUID REFERENCES orders(id)`);
    await c.query(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS current_driver_id UUID REFERENCES drivers(id)`);
    await c.query(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS entered_factory_at TIMESTAMP`);
    await c.query(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS exited_factory_at TIMESTAMP`);
    console.log('✅ vehicles موسع');
  } catch (e) { console.error('❌', e.message); }
  finally { c.release(); await pool.end(); }
})();
