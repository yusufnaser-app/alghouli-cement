require('dotenv').config();
const { pool } = require('../src/config/db');

(async () => {
  const c = await pool.connect();
  try {
    // حوافز المصانع للمؤسسة: على الكميات المسحوبة من كل مصنع (شهرية/سنوية، لكل كيس/لكل طن).
    // لا قيم ثابتة في الكود؛ الإدارة تضيف القواعد. source_id فارغ = تنطبق على كل المصانع.
    await c.query(`
      CREATE TABLE IF NOT EXISTS incentive_rules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name_ar VARCHAR(150) NOT NULL,
        period VARCHAR(10) NOT NULL CHECK (period IN ('monthly', 'yearly')),
        unit VARCHAR(10) NOT NULL CHECK (unit IN ('bag', 'ton')),
        rate_per_unit NUMERIC(14,2) NOT NULL CHECK (rate_per_unit >= 0),
        source_id UUID REFERENCES product_sources(id),
        valid_from DATE,
        valid_to DATE,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    // للذين شغّلوا النسخة السابقة من m20 (كانت مربوطة بنوع السائق بالخطأ)
    await c.query(`ALTER TABLE incentive_rules ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES product_sources(id)`);
    await c.query(`ALTER TABLE incentive_rules DROP COLUMN IF EXISTS driver_type`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_incentive_rules_active ON incentive_rules(is_active, period)`);
    console.log('✅ incentive_rules (حوافز المصانع)');
  } catch (e) {
    console.error('❌', e.message);
  } finally {
    c.release();
    await pool.end();
  }
})();
