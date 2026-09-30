require('dotenv').config();
const { pool } = require('../src/config/db');

(async () => {
  const c = await pool.connect();
  try {
    // الطلب الجماعي للتاجر (بند 27): مجموعة تربط عدة طلبات فردية (طلب لكل قاطرة)
    // تحت رقم واحد، كل طلب يمر بنفس دورة العمل العادية (تسعير ثم سداد) دون تكرار.
    await c.query(`
      CREATE TABLE IF NOT EXISTS order_groups (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        group_number VARCHAR(30) UNIQUE NOT NULL,
        customer_id UUID NOT NULL REFERENCES customers(id),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await c.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES order_groups(id)`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_orders_group ON orders(group_id)`);
    console.log('✅ order_groups + orders.group_id (الطلب الجماعي للتاجر)');
  } catch (e) {
    console.error('❌', e.message);
  } finally {
    c.release();
    await pool.end();
  }
})();
