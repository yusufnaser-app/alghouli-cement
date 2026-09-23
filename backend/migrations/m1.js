require('dotenv').config();
const { pool } = require('../src/config/db');
(async () => {
  const c = await pool.connect();
  try {
    await c.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS factory_id UUID REFERENCES product_sources(id)`);
    await c.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS quantity_requested DECIMAL(14,2)`);
    await c.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS quantity_approved DECIMAL(14,2)`);
    await c.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS quantity_loaded DECIMAL(14,2)`);
    await c.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS quantity_delivered DECIMAL(14,2)`);
    await c.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS quantity_discrepancy DECIMAL(14,2)`);
    await c.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS loading_started_at TIMESTAMP`);
    await c.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS loading_completed_at TIMESTAMP`);
    await c.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS vehicle_entered_at TIMESTAMP`);
    await c.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS vehicle_exited_at TIMESTAMP`);
    console.log('✅ orders موسع');
  } catch (e) { console.error('❌', e.message); }
  finally { c.release(); await pool.end(); }
})();
