require('dotenv').config();
const { pool } = require('../src/config/db');

(async () => {
  const c = await pool.connect();
  try {
    // قواعد الحوافز — لا توجد أي قيم ثابتة في الكود؛ الإدارة تضيف/تعدّل القواعد
    await c.query(`
      CREATE TABLE IF NOT EXISTS incentive_rules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name_ar VARCHAR(150) NOT NULL,
        period VARCHAR(10) NOT NULL CHECK (period IN ('monthly', 'yearly')),
        unit VARCHAR(10) NOT NULL CHECK (unit IN ('bag', 'ton')),
        rate_per_unit NUMERIC(14,2) NOT NULL CHECK (rate_per_unit >= 0),
        driver_type VARCHAR(30),
        valid_from DATE,
        valid_to DATE,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_incentive_rules_active ON incentive_rules(is_active, period)`);
    console.log('✅ incentive_rules');
  } catch (e) {
    console.error('❌', e.message);
  } finally {
    c.release();
    await pool.end();
  }
})();
