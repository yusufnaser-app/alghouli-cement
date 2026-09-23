require('dotenv').config();
const { pool } = require('../src/config/db');
(async () => {
  const c = await pool.connect();
  try {
    await c.query(`
      CREATE TABLE IF NOT EXISTS driver_ledger (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
        order_id UUID REFERENCES orders(id),
        delivery_id UUID REFERENCES deliveries(id),
        transaction_type VARCHAR(30) NOT NULL,
        description TEXT,
        debit DECIMAL(14,2) DEFAULT 0,
        credit DECIMAL(14,2) DEFAULT 0,
        balance_after DECIMAL(14,2) DEFAULT 0,
        reference_code VARCHAR(100),
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_driver_ledger ON driver_ledger(driver_id, created_at DESC)`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_driver_ledger_type ON driver_ledger(transaction_type)`);
    console.log('✅ driver_ledger');
  } catch (e) { console.error('❌', e.message); }
  finally { c.release(); await pool.end(); }
})();
