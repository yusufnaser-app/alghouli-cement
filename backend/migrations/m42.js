'use strict';
require('dotenv').config();
const { pool } = require('../src/config/db');

// m42 — الفاكس صنف واحد: يُحفظ الصنف في loading_faxes (اختياري للفواكس القديمة فقط).
// آمن لإعادة التشغيل: IF NOT EXISTS.
(async () => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    console.log('🚀 m42 — صنف الفاكس');
    await c.query(`ALTER TABLE loading_faxes ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id)`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_loading_faxes_product ON loading_faxes (product_id)`);
    await c.query('COMMIT');
    console.log('✅ m42 اكتمل');
  } catch (err) {
    await c.query('ROLLBACK');
    console.error('❌ m42 فشل:', err.message);
    process.exit(1);
  } finally {
    c.release();
    process.exit(0);
  }
})();
