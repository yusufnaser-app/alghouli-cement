'use strict';
require('dotenv').config();
const { pool } = require('../src/config/db');

// m41 — طلب تلقائي لوجهة تاجر بلا طلب: يُسعَّر بسعر الوجهة ويُرحَّل بيعه عند التسليم.
// آمن لإعادة التشغيل: IF NOT EXISTS.
(async () => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    console.log('🚀 m41 — طلبات الوجهات التلقائية');
    await c.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS auto_for_destination BOOLEAN NOT NULL DEFAULT FALSE`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_orders_auto_destination ON orders (auto_for_destination) WHERE auto_for_destination = TRUE`);
    await c.query('COMMIT');
    console.log('✅ m41 اكتمل');
  } catch (err) {
    await c.query('ROLLBACK');
    console.error('❌ m41 فشل:', err.message);
    process.exit(1);
  } finally {
    c.release();
    process.exit(0);
  }
})();
