'use strict';
require('dotenv').config();
const { pool } = require('../src/config/db');

// m37 — فاكس نشط واحد لكل طلب: UNIQUE جزئي على loading_faxes(order_id) لغير الملغى.
// لماذا order_id وليس عمودًا جديدًا؟ العمود موجود أصلًا ويحمل نفس المعنى (الفاكس الذي ينفّذ هذا الطلب)،
// ووجهة الفاكس تحمل fulfills_order_id أصلًا (m35 + uq_dest_fulfills_order). عمود ثالث = مصدر حقيقة مكرر.
// الملغى مستثنى: إلغاء فاكس ثم إنشاء بديل لنفس الطلب مسموح.
// آمن: يفحص التكرار أولًا ويتوقف برسالة واضحة (لا يحذف ولا يعدّل).
(async () => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    console.log('🚀 m37 — UNIQUE جزئي: فاكس نشط واحد لكل طلب');

    const dups = await c.query(
      `SELECT order_id::text AS order_id, COUNT(*)::int AS cnt,
              array_agg(COALESCE(fax_number, id::text) ORDER BY requested_at) AS faxes
       FROM loading_faxes
       WHERE order_id IS NOT NULL AND status <> 'CANCELLED'
       GROUP BY order_id HAVING COUNT(*) > 1
       ORDER BY order_id`
    );
    if (dups.rows.length) {
      const list = dups.rows.map((r) => `${r.order_id} ×${r.cnt} [${r.faxes.join(', ')}]`).join('; ');
      throw new Error(`طلبات لها أكثر من فاكس نشط — ألغِ الزائد أولًا (node scripts/check-pending-trader-orders.js): ${list}`);
    }

    await c.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_loading_faxes_order_active
       ON loading_faxes (order_id)
       WHERE order_id IS NOT NULL AND status <> 'CANCELLED'`
    );

    await c.query('COMMIT');
    console.log('✅ m37 اكتمل');
  } catch (err) {
    await c.query('ROLLBACK');
    console.error('❌ m37 فشل:', err.message);
    process.exit(1);
  } finally {
    c.release();
    process.exit(0);
  }
})();
