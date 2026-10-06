'use strict';
require('dotenv').config();
const { pool } = require('../src/config/db');

// m36 — فهرس فريد على loading_faxes.fax_number (كان الوحيد بلا UNIQUE بين أرقام الفاكس/الطلب/الرحلة).
// آمن على الإنتاج: يفحص التكرار أولًا ويتوقف برسالة واضحة إن وُجد (لا يحذف ولا يعدّل بيانات).
// فهرس جزئي WHERE fax_number IS NOT NULL: الفاكسات القديمة بلا رقم (NULL) مسموحة وتبقى كما هي.
// orders.order_number و deliveries.trip_number عليهما UNIQUE أصلًا — نتحقق فقط ولا نضيف فهارس مكررة.
(async () => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    console.log('🚀 m36 — UNIQUE على loading_faxes.fax_number');

    const dups = await c.query(
      `SELECT fax_number, COUNT(*)::int AS cnt
       FROM loading_faxes
       WHERE fax_number IS NOT NULL
       GROUP BY fax_number HAVING COUNT(*) > 1
       ORDER BY fax_number`
    );
    if (dups.rows.length) {
      const list = dups.rows.map((r) => `${r.fax_number} ×${r.cnt}`).join(', ');
      throw new Error(`أرقام فاكس مكررة — نظّفها أولًا (node scripts/check-fax-duplicates.js): ${list}`);
    }

    await c.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_loading_faxes_fax_number
       ON loading_faxes (fax_number) WHERE fax_number IS NOT NULL`
    );

    // تحقق (للعرض فقط): وجود UNIQUE على رقم الطلب ورقم الرحلة
    const chk = await c.query(
      `SELECT tablename, indexname FROM pg_indexes
       WHERE schemaname = 'public'
         AND ((tablename = 'orders'     AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%order_number%')
           OR (tablename = 'deliveries' AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%trip_number%')
           OR (tablename = 'loading_faxes' AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%fax_number%'))
       ORDER BY tablename`
    );
    for (const r of chk.rows) console.log(`   ✓ ${r.tablename}: ${r.indexname}`);
    if (chk.rows.length < 3) console.log('   ⚠️  أحد الفهارس الفريدة الثلاثة غير ظاهر — راجع القائمة أعلاه');

    await c.query('COMMIT');
    console.log('✅ m36 اكتمل');
  } catch (err) {
    await c.query('ROLLBACK');
    console.error('❌ m36 فشل:', err.message);
    process.exit(1);
  } finally {
    c.release();
    process.exit(0);
  }
})();
