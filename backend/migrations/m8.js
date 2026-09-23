require('dotenv').config();
const { pool } = require('../src/config/db');
(async () => {
  const c = await pool.connect();
  try {
    await c.query(`
      CREATE TABLE IF NOT EXISTS factory_purchases (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        purchase_number VARCHAR(50) UNIQUE NOT NULL,
        factory_id UUID NOT NULL REFERENCES product_sources(id),
        product_id UUID REFERENCES products(id),
        category_code VARCHAR(30),
        packaging_type VARCHAR(20),
        quantity_bags DECIMAL(14,2) DEFAULT 0,
        quantity_tons DECIMAL(14,2) DEFAULT 0,
        unit_price DECIMAL(14,2),
        total_amount DECIMAL(14,2),
        document_number VARCHAR(100),
        purchase_date DATE NOT NULL,
        driver_id UUID REFERENCES drivers(id),
        vehicle_id UUID REFERENCES vehicles(id),
        status VARCHAR(30) DEFAULT 'received',
        notes TEXT,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_purchases_factory ON factory_purchases(factory_id, purchase_date DESC)`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_purchases_date ON factory_purchases(purchase_date DESC)`);
    console.log('✅ factory_purchases');
  } catch (e) { console.error('❌', e.message); }
  finally { c.release(); await pool.end(); }
})();
