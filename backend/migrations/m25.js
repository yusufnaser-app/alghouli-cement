require('dotenv').config();
const { pool } = require('../src/config/db');

(async () => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');

    await c.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS fax_requested BOOLEAN NOT NULL DEFAULT FALSE`);
    await c.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS trader_driver_id UUID REFERENCES drivers(id)`);
    await c.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS trader_vehicle_id UUID REFERENCES vehicles(id)`);
    await c.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS transport_beneficiary VARCHAR(20)`);
    await c.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS transport_beneficiary_trader_id UUID REFERENCES customers(id)`);
    await c.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS fax_id UUID REFERENCES loading_faxes(id)`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_orders_fax_requested ON orders(fax_requested, status)`);

    await c.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_url TEXT`);
    await c.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_path TEXT`);

    await c.query(`
      INSERT INTO payment_methods (code, name_ar, type, status)
      VALUES
        ('network_transfer', 'تحويل عبر شبكة الصرافة', 'transfer', 'active'),
        ('e_wallet', 'محفظة إلكترونية', 'wallet', 'active'),
        ('on_account', 'تحت الحساب', 'credit', 'active')
      ON CONFLICT (code) DO UPDATE SET
        name_ar = EXCLUDED.name_ar,
        type = EXCLUDED.type,
        status = 'active'
    `);


    await c.query('COMMIT');
    console.log('✅ m25 — trader order fulfillment + payment methods');
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('❌ m25:', e.message);
    process.exitCode = 1;
  } finally {
    c.release();
    await pool.end();
  }
})();
