require('dotenv').config();
const { pool } = require('../src/config/db');

(async () => {
  const c = await pool.connect();
  try {
    // ⚠️ اكتشاف مهم: عدة أعمدة وجدول يستخدمهما orders.service.js فعليًا في كل طلب
    // (INSERT INTO orders والخطوة التالية مباشرة INSERT INTO order_status_history)
    // لا توجد لهما أي هجرة في هذا المستودع. عمليًا هذا يعني أن إنشاء أي طلب جديد
    // كان سيفشل بخطأ "column/relation does not exist" ما لم تكن أُضيفت يدويًا في
    // Supabase خارج git. هذه الهجرة آمنة تمامًا (IF NOT EXISTS) في الحالتين.

    await c.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_type VARCHAR(30)`);
    await c.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS trader_truck_plate VARCHAR(30)`);
    await c.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS trader_driver_name VARCHAR(150)`);
    await c.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS trader_driver_phone VARCHAR(20)`);
    await c.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS transport_unit VARCHAR(10)`);
    await c.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(20)`);
    await c.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_amount_now DECIMAL(14,2) DEFAULT 0`);
    await c.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS credit_amount DECIMAL(14,2) DEFAULT 0`);
    await c.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS credit_approved_by UUID REFERENCES users(id)`);
    await c.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS credit_rejection_reason TEXT`);
    console.log('✅ orders: أعمدة النقل/الدفع الآجل (كانت مفقودة)');

    await c.query(`
      CREATE TABLE IF NOT EXISTS order_status_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        from_status VARCHAR(30),
        to_status VARCHAR(30) NOT NULL,
        changed_by UUID REFERENCES users(id),
        reason TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_order_status_history_order ON order_status_history(order_id, created_at)`);
    console.log('✅ order_status_history (كان مفقودًا)');

    // === إعادة تصميم مسار التسعير (بند 10-23 من مواصفة الواجهة الجديدة) ===
    // العميل يرسل الطلب بدون سعر؛ الموظف يسعّر لاحقًا؛ ثم يختار العميل طريقة الدفع.
    await c.query(`ALTER TABLE orders ALTER COLUMN subtotal DROP NOT NULL`);
    await c.query(`ALTER TABLE orders ALTER COLUMN total_amount DROP NOT NULL`);
    await c.query(`ALTER TABLE order_items ALTER COLUMN unit_price DROP NOT NULL`);
    await c.query(`ALTER TABLE order_items ALTER COLUMN line_total DROP NOT NULL`);
    await c.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS priced_by UUID REFERENCES users(id)`);
    await c.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS priced_at TIMESTAMP`);
    console.log('✅ orders/order_items: السعر أصبح اختياريًا عند الإنشاء (يُحدَّد لاحقًا من الموظف)');
  } catch (e) {
    console.error('❌', e.message);
  } finally {
    c.release();
    await pool.end();
  }
})();
