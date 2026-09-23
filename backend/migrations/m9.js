require('dotenv').config();
const { pool } = require('../src/config/db');
(async () => {
  const c = await pool.connect();
  try {
    await c.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS business_name VARCHAR(200)`);
    await c.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS business_type VARCHAR(50)`);
    await c.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMP`);
    await c.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_lead BOOLEAN DEFAULT FALSE`);
    await c.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS lead_status VARCHAR(30)`);
    await c.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_order_at TIMESTAMP`);
    await c.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS total_orders INT DEFAULT 0`);
    await c.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS total_bags DECIMAL(14,2) DEFAULT 0`);
    await c.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS total_tons DECIMAL(14,2) DEFAULT 0`);
    console.log('✅ customers موسع');
  } catch (e) { console.error('❌', e.message); }
  finally { c.release(); await pool.end(); }
})();
