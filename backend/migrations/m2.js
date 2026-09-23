require('dotenv').config();
const { pool } = require('../src/config/db');
(async () => {
  const c = await pool.connect();
  try {
    await c.query(`
      CREATE TABLE IF NOT EXISTS loading_faxes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
        driver_id UUID REFERENCES drivers(id),
        vehicle_id UUID REFERENCES vehicles(id),
        factory_id UUID REFERENCES product_sources(id),
        requested_quantity DECIMAL(14,2),
        approved_quantity DECIMAL(14,2),
        fax_number VARCHAR(50),
        status VARCHAR(30) NOT NULL DEFAULT 'REQUESTED',
        requested_at TIMESTAMP DEFAULT NOW(),
        approved_at TIMESTAMP,
        issued_at TIMESTAMP,
        used_at TIMESTAMP,
        cancelled_at TIMESTAMP,
        notes TEXT,
        created_by UUID REFERENCES users(id),
        updated_by UUID REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_fax_order ON loading_faxes(order_id)`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_fax_status ON loading_faxes(status)`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_fax_driver ON loading_faxes(driver_id)`);
    console.log('✅ loading_faxes');
  } catch (e) { console.error('❌', e.message); }
  finally { c.release(); await pool.end(); }
})();
