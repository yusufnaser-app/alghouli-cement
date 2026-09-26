require('dotenv').config();
const { pool } = require('../src/config/db');
(async () => {
  const c = await pool.connect();
  try {
    await c.query(`ALTER TABLE loading_faxes ADD COLUMN IF NOT EXISTS transport_payer VARCHAR(20) DEFAULT 'institution'`);
    await c.query(`ALTER TABLE loading_faxes ADD COLUMN IF NOT EXISTS transport_payer_trader_id UUID REFERENCES customers(id)`);
    await c.query(`ALTER TABLE loading_faxes ADD COLUMN IF NOT EXISTS transport_payer_note TEXT`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_faxes_payer ON loading_faxes(transport_payer)`);
    console.log('✅ m18 — transport_payer');
  } catch (e) { console.error('❌', e.message); }
  finally { c.release(); await pool.end(); }
})();
