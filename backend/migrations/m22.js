require('dotenv').config();
const { pool } = require('../src/config/db');

(async () => {
  const c = await pool.connect();
  try {
    // سقوف الطلبات (بند 28): قابلة للإدارة، بلا قيم ثابتة في الكود.
    // customer_id/source_id/category_id فارغة = تنطبق على الكل (عام). الأخص يُطبَّق دائمًا مع العام معًا (الأصغر يفوز).
    await c.query(`
      CREATE TABLE IF NOT EXISTS order_ceilings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name_ar VARCHAR(150) NOT NULL,
        period VARCHAR(10) NOT NULL CHECK (period IN ('daily', 'monthly')),
        customer_id UUID REFERENCES customers(id),
        source_id UUID REFERENCES product_sources(id),
        category_id UUID REFERENCES product_categories(id),
        max_bags NUMERIC(14,2),
        max_amount NUMERIC(14,2),
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        CHECK (max_bags IS NOT NULL OR max_amount IS NOT NULL)
      )
    `);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_ceilings_active ON order_ceilings(is_active, period)`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_ceilings_customer ON order_ceilings(customer_id)`);

    // طلبات الموافقة الاستثنائية عند تجاوز السقف
    await c.query(`
      CREATE TABLE IF NOT EXISTS ceiling_overrides (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id UUID NOT NULL REFERENCES customers(id),
        ceiling_id UUID REFERENCES order_ceilings(id),
        requested_bags NUMERIC(14,2),
        requested_amount NUMERIC(14,2),
        reason TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
        decided_by UUID REFERENCES users(id),
        decided_at TIMESTAMP,
        order_id UUID REFERENCES orders(id),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_ceiling_overrides_status ON ceiling_overrides(status)`);
    console.log('✅ order_ceilings + ceiling_overrides');
  } catch (e) {
    console.error('❌', e.message);
  } finally {
    c.release();
    await pool.end();
  }
})();
