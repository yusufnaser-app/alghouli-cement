/**
 * مطابقة أرصدة السائقين مع سجل driver_ledger.
 * السبب: كانت السلف والخصومات تُضاف للرصيد بدل أن تُخصم منه (أُصلح في الكود).
 * القيود القديمة في قاعدتكم ما زالت بالاتجاه الخاطئ، وهذا السكربت يُظهر الفروق.
 *
 * الصيغة: الرصيد = مستحقات النقل − الدفعات − السلف − الخصومات
 *
 * الاستخدام:
 *   node scripts/reconcile-driver-balances.js          # عرض فقط (لا يغيّر شيئًا)
 *   node scripts/reconcile-driver-balances.js --apply  # تحديث drivers.current_balance
 * ملاحظة: لا يعدّل balance_after في الصفوف التاريخية؛ فقط الرصيد الحالي.
 * خذ نسخة احتياطية (Supabase) قبل --apply، وراجع الفروق مع المحاسب أولًا.
 */
require('dotenv').config();
const { pool } = require('../src/config/db');

(async () => {
  const apply = process.argv.includes('--apply');
  try {
    const other = await pool.query(
      `SELECT transaction_type, COUNT(*) FROM driver_ledger
       WHERE transaction_type NOT IN ('transport_due','payment','advance','deduction')
       GROUP BY 1`
    );
    if (other.rows.length) {
      console.log('⚠️ أنواع قيود أخرى غير محسوبة في الصيغة:', other.rows);
    }

    const r = await pool.query(`
      SELECT d.id, d.full_name, d.current_balance,
        COALESCE(SUM(CASE WHEN l.transaction_type='transport_due' THEN l.debit  END),0)
      - COALESCE(SUM(CASE WHEN l.transaction_type='payment'       THEN l.credit END),0)
      - COALESCE(SUM(CASE WHEN l.transaction_type='advance'       THEN l.debit  END),0)
      - COALESCE(SUM(CASE WHEN l.transaction_type='deduction'     THEN l.debit  END),0) AS expected
      FROM drivers d LEFT JOIN driver_ledger l ON l.driver_id = d.id
      GROUP BY d.id, d.full_name, d.current_balance
      ORDER BY d.full_name`);

    let diffs = 0;
    for (const row of r.rows) {
      const cur = parseFloat(row.current_balance || 0);
      const exp = parseFloat(row.expected || 0);
      if (Math.abs(cur - exp) > 0.01) {
        diffs++;
        console.log(`• ${row.full_name}: الحالي ${cur} ← الصحيح ${exp} (فرق ${cur - exp})`);
        if (apply) {
          await pool.query(`UPDATE drivers SET current_balance = $1 WHERE id = $2`, [exp, row.id]);
        }
      }
    }
    console.log(diffs === 0 ? '✅ كل الأرصدة مطابقة' :
      apply ? `✅ تم تحديث ${diffs} سائق` : `ℹ️ ${diffs} سائق بفروق — أعد التشغيل مع --apply بعد المراجعة`);
  } catch (e) {
    console.error('❌', e.message);
  } finally {
    await pool.end();
  }
})();
