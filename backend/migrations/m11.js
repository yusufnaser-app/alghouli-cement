require('dotenv').config();
const { pool } = require('../src/config/db');
(async () => {
  const c = await pool.connect();
  try {
    // loading_faxes — جعل order_id اختياري + حقول جديدة
    await c.query(`ALTER TABLE loading_faxes ALTER COLUMN order_id DROP NOT NULL`);
    await c.query(`ALTER TABLE loading_faxes ADD COLUMN IF NOT EXISTS route TEXT`);
    await c.query(`ALTER TABLE loading_faxes ADD COLUMN IF NOT EXISTS route_set_by UUID REFERENCES users(id)`);
    await c.query(`ALTER TABLE loading_faxes ADD COLUMN IF NOT EXISTS route_set_at TIMESTAMP`);
    await c.query(`ALTER TABLE loading_faxes ADD COLUMN IF NOT EXISTS transport_rate DECIMAL(14,2)`);
    await c.query(`ALTER TABLE loading_faxes ADD COLUMN IF NOT EXISTS transport_rate_unit VARCHAR(10)`);
    await c.query(`ALTER TABLE loading_faxes ADD COLUMN IF NOT EXISTS transport_total DECIMAL(14,2)`);
    await c.query(`ALTER TABLE loading_faxes ADD COLUMN IF NOT EXISTS transport_base_on VARCHAR(30) DEFAULT 'approved_quantity'`);
    await c.query(`ALTER TABLE loading_faxes ADD COLUMN IF NOT EXISTS transport_set_by UUID REFERENCES users(id)`);
    await c.query(`ALTER TABLE loading_faxes ADD COLUMN IF NOT EXISTS transport_set_at TIMESTAMP`);
    await c.query(`ALTER TABLE loading_faxes ADD COLUMN IF NOT EXISTS transport_previous_rate DECIMAL(14,2)`);
    await c.query(`ALTER TABLE loading_faxes ADD COLUMN IF NOT EXISTS transport_edit_reason TEXT`);
    await c.query(`ALTER TABLE loading_faxes ADD COLUMN IF NOT EXISTS factory_entered_at TIMESTAMP`);
    await c.query(`ALTER TABLE loading_faxes ADD COLUMN IF NOT EXISTS factory_exited_at TIMESTAMP`);
    console.log('✅ loading_faxes محدّث');
  } catch (e) { console.error('❌', e.message); }
  finally { c.release(); await pool.end(); }
})();
