require('dotenv').config();
const { pool } = require('../src/config/db');

(async () => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');

    await c.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS accounting_status VARCHAR(30) NOT NULL DEFAULT 'PENDING'`);
    await c.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS accounting_posted_at TIMESTAMP`);
    await c.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS accounting_note TEXT`);
    await c.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS final_subtotal DECIMAL(14,2)`);
    await c.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS final_shipping_amount DECIMAL(14,2)`);
    await c.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS final_total_amount DECIMAL(14,2)`);
    await c.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS final_remaining_amount DECIMAL(14,2)`);
    await c.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS final_loaded_quantity DECIMAL(14,2)`);
    await c.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS loaded_at TIMESTAMP`);

    await c.query(`
      CREATE TABLE IF NOT EXISTS order_accounting_postings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
        fax_id UUID REFERENCES loading_faxes(id) ON DELETE SET NULL,
        loaded_quantity DECIMAL(14,2) NOT NULL,
        customer_debit DECIMAL(14,2) NOT NULL DEFAULT 0,
        customer_payment_credit DECIMAL(14,2) NOT NULL DEFAULT 0,
        driver_transport_debit DECIMAL(14,2) NOT NULL DEFAULT 0,
        trader_transport_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
        posted_by UUID REFERENCES users(id),
        posted_at TIMESTAMP DEFAULT NOW(),
        notes TEXT
      )
    `);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_order_accounting_postings_fax ON order_accounting_postings(fax_id)`);

    await c.query(`
      CREATE TABLE IF NOT EXISTS factory_ledger (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        factory_id UUID NOT NULL REFERENCES product_sources(id),
        order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
        fax_id UUID REFERENCES loading_faxes(id) ON DELETE SET NULL,
        transaction_type VARCHAR(40) NOT NULL,
        quantity DECIMAL(14,2) NOT NULL,
        unit VARCHAR(20) NOT NULL DEFAULT 'bag',
        description TEXT,
        reference_code VARCHAR(100),
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_factory_ledger_factory_date ON factory_ledger(factory_id, created_at DESC)`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_factory_ledger_order ON factory_ledger(order_id)`);

    await c.query(`ALTER TABLE customer_ledger ADD COLUMN IF NOT EXISTS source_type VARCHAR(30)`);
    await c.query(`ALTER TABLE customer_ledger ADD COLUMN IF NOT EXISTS source_id UUID`);
    await c.query(`ALTER TABLE driver_ledger ADD COLUMN IF NOT EXISTS source_type VARCHAR(30)`);
    await c.query(`ALTER TABLE driver_ledger ADD COLUMN IF NOT EXISTS source_id UUID`);

    await c.query('COMMIT');
    console.log('✅ m27 — actual loading accounting + factory/customer/driver source links');
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('❌ m27:', e.message);
    process.exitCode = 1;
  } finally {
    c.release();
    await pool.end();
  }
})();
