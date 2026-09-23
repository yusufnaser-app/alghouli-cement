require('dotenv').config();
const { pool } = require('../src/config/db');
(async () => {
  const c = await pool.connect();
  try {
    // ربط السائق بمالك (تاجر)
    await c.query(`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS owner_trader_id UUID REFERENCES customers(id)`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_drivers_owner ON drivers(owner_trader_id)`);

    // معلومات في الفاكس
    await c.query(`ALTER TABLE loading_faxes ADD COLUMN IF NOT EXISTS requested_by_user_id UUID REFERENCES users(id)`);
    await c.query(`ALTER TABLE loading_faxes ADD COLUMN IF NOT EXISTS trader_id UUID REFERENCES customers(id)`);
    await c.query(`ALTER TABLE loading_faxes ADD COLUMN IF NOT EXISTS driver_type_snapshot VARCHAR(30)`);
    await c.query(`ALTER TABLE loading_faxes ADD COLUMN IF NOT EXISTS is_managed_by_institution BOOLEAN DEFAULT TRUE`);

    // تحديث السائقين الحاليين
    await c.query(`UPDATE drivers SET driver_type = 'institution_driver' WHERE driver_type IS NULL`);

    console.log('✅ m12 تم');
  } catch (e) { console.error('❌', e.message); }
  finally { c.release(); await pool.end(); }
})();
