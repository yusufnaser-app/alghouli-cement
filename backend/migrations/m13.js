require('dotenv').config();
const { pool } = require('../src/config/db');
(async () => {
  const c = await pool.connect();
  try {
    await c.query(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS owner_trader_id UUID REFERENCES customers(id)`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_vehicles_owner_trader ON vehicles(owner_trader_id)`);
    console.log('✅ vehicles.owner_trader_id');
  } catch (e) { console.error('❌', e.message); }
  finally { c.release(); await pool.end(); }
})();
