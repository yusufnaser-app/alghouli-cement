'use strict';
/**
 * اختبار تزامن حقيقي على PostgreSQL: عدد من المعاملات المتوازية تولّد رقمًا وتُدرجه → يجب أن تكون كلها فريدة.
 * ⚠️ ليس قراءة فقط: ينشئ جدولًا مؤقتًا باسم zz_numgen_test (بمفتاح UNIQUE) ثم يحذفه في النهاية.
 *    لا يلمس أي جدول إنتاجي. يستخدم القفل نفسه المستعمل في الإنتاج بمفتاح مستقل (zz-test-lock).
 * الاستخدام: node scripts/test-number-concurrency.js [عدد=100] [دفعة=10]
 *   - الدفعة: عدد المعاملات المتزامنة في كل موجة (لا يتجاوز pool.max).
 */
require('dotenv').config();
const { pool } = require('../src/config/db');
const { nextNumber } = require('../src/utils/number-generator');

const N = parseInt(process.argv[2], 10) || 100;
const BATCH = parseInt(process.argv[3], 10) || 10;
const CFG = { lockKey: 'zz-test-lock', table: 'zz_numgen_test', column: 'num', prefix: 'ZZ', pad: 5 };

(async () => {
  const setup = await pool.connect();
  let ok = false;
  try {
    await setup.query('DROP TABLE IF EXISTS zz_numgen_test');
    await setup.query('CREATE TABLE zz_numgen_test (id SERIAL PRIMARY KEY, num VARCHAR(30) UNIQUE NOT NULL)');
    setup.release();

    const one = async () => {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const num = await nextNumber(c, CFG);
        await new Promise((r) => setTimeout(r, 5)); // نافذة سباق متعمّدة
        await c.query('INSERT INTO zz_numgen_test (num) VALUES ($1)', [num]);
        await c.query('COMMIT');
        return { num };
      } catch (e) {
        try { await c.query('ROLLBACK'); } catch (_) { /* ignore */ }
        return { error: e.message };
      } finally { c.release(); }
    };

    // ✅ 100 معاملة على دفعات من BATCH → لا نتجاوز pool.max
    console.log(`🚀 إجمالي: ${N} | دفعة: ${BATCH} | موجات: ${Math.ceil(N / BATCH)}`);
    const results = [];
    for (let i = 0; i < N; i += BATCH) {
      const size = Math.min(BATCH, N - i);
      const batch = Array.from({ length: size }, one);
      const batchResults = await Promise.all(batch);
      results.push(...batchResults);
      process.stdout.write(`  موجة ${Math.floor(i / BATCH) + 1}/${Math.ceil(N / BATCH)} ✓\n`);
    }

    const errors = results.filter((r) => r.error);
    const nums = results.filter((r) => r.num).map((r) => r.num);
    const unique = new Set(nums).size;
    console.log(`\nمعاملات: ${N} | نجحت: ${nums.length} | فريدة: ${unique} | أخطاء: ${errors.length}`);
    if (errors.length) console.log('أول خطأ:', errors[0].error);

    const last = [...nums].sort().at(-1);
    console.log(`آخر رقم: ${last}`);

    const expectedLast = `ZZ-${new Date().getFullYear()}-${String(N).padStart(5, '0')}`;
    console.log(`المتوقع: ${expectedLast}`);

    ok = errors.length === 0 && unique === N && last === expectedLast;
    console.log(ok ? '✅ نجح: كل الأرقام فريدة ومتسلسلة بلا فجوات' : '❌ فشل');
  } catch (e) {
    console.error('❌ خطأ:', e.message);
  } finally {
    try { await pool.query('DROP TABLE IF EXISTS zz_numgen_test'); } catch (_) { /* ignore */ }
    await pool.end();
    process.exitCode = ok ? 0 : 1;
  }
})();
