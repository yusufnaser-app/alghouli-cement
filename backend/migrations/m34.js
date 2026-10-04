'use strict';
require('dotenv').config();
const { pool } = require('../src/config/db');

// m34 — ربط وجهة الفاكس بطلب موجود ومدفوع (التكليف التلقائي).
// fulfills_order_id مستقل عن order_id: الأخير يُعبَّأ بالطلب الذي يُنشأ تلقائيًا عند التسليم.
(async () => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    console.log('🚀 m34 — delivery_destinations.fulfills_order_id');
    await c.query(`ALTER TABLE delivery_destinations ADD COLUMN IF NOT EXISTS fulfills_order_id UUID REFERENCES orders(id)`);
    // طلب واحد لا يُكلَّف إلا لوجهة معلقة/مسلّمة واحدة (منع التكرار)
    await c.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_dest_fulfills_order
                   ON delivery_destinations (fulfills_order_id) WHERE fulfills_order_id IS NOT NULL`);
    await c.query('COMMIT');
    console.log('✅ m34 اكتمل');
  } catch (err) {
    await c.query('ROLLBACK');
    console.error('❌ m34 فشل:', err.message);
    process.exit(1);
  } finally {
    c.release();
    process.exit(0);
  }
})();
