'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { run } = require('../scripts/cleanup-historical-data');

const norm = (s) => s.replace(/\s+/g, ' ').trim();

// عميل وهمي: يطابق نصوص الاستعلامات ويسجّل ما نُفِّذ
const mk = (data = {}) => {
  const d = {
    i2: [], i4: [], i6: { fax_number: 'FX-2026-00001', capacity: '1700', dest_bags: '3400' }, i7: [],
    counts: { i2: 1, i4: 1, i6: 1, i7: 0 }, after: null, updateRowCount: 1, ...data,
  };
  let callsCounts = 0;
  const log = [];
  return {
    log,
    query: async (sql, params = []) => {
      const s = norm(sql); log.push(s);
      if (/^(BEGIN|COMMIT|ROLLBACK)/.test(s)) return { rows: [] };
      if (/^SELECT COUNT\(/.test(s)) {
        // أربعة استعلامات إحصاء لكل نداء counts(): الأول=قبل، الثاني=بعد
        const key = /f\.status <> 'CANCELLED' AND o\.fax_id/.test(s) ? 'i2'
          : /COUNT\(DISTINCT f\.id\)/.test(s) ? 'i4' : /GROUP BY f\.id/.test(s) ? 'i6' : 'i7';
        if (key === 'i2') callsCounts++;
        const src = callsCounts > 1 && d.after ? d.after : d.counts;
        return { rows: [{ n: src[key] }] };
      }
      if (/^SELECT o\.id AS order_id/.test(s)) return { rows: d.i2 };
      if (/^SELECT d\.id, d\.fax_id, f\.fax_number/.test(s)) return { rows: d.i4 };
      if (/^SELECT f\.fax_number, COALESCE\(f\.loaded_quantity/.test(s)) return { rows: [d.i6] };
      if (/^SELECT id, fax_number, status FROM loading_faxes WHERE status IN/.test(s)) return { rows: d.i7 };
      if (/^SELECT pg_advisory_xact_lock/.test(s)) return { rows: [] };
      if (/^SELECT COALESCE\(MAX\(CAST/.test(s)) return { rows: [{ max_num: 5 }] };
      if (/^UPDATE /.test(s)) return { rowCount: d.updateRowCount, rows: [] };
      return { rows: [], rowCount: 1 };
    },
  };
};
const writes = (c) => c.log.filter((s) => /^(UPDATE|INSERT|DELETE)/.test(s));

const I2_FIX = { order_id: 'o8', order_number: 'GHO-2026-000008', order_status: 'DELIVERED', current_fax_id: null, fax_id: 'f5', fax_number: 'FX-2026-00005', fax_status: 'DELIVERED' };
const DEST = (over = {}) => ({ id: 'd1', fax_id: 'f1', fax_number: 'FX-2026-00001', destination_type: 'trader', trader_id: 't1', warehouse_id: null,
  quantity: '850', unit: 'bag', fulfills_order_id: null, linked_order_status: null, has_delivered_twin: true, ...over });

test('dry-run: READ ONLY، لا أي كتابة، ROLLBACK، وخطة بإجراء لكل صف', async () => {
  const c = mk({ i2: [I2_FIX], i4: [DEST(), DEST({ id: 'd2' })] });
  const r = await run(c, { apply: false });
  assert.strictEqual(c.log[0], 'BEGIN READ ONLY');
  assert.strictEqual(c.log[c.log.length - 1], 'ROLLBACK');
  assert.strictEqual(writes(c).length, 0);
  assert.ok(!c.log.some((s) => /FOR UPDATE/.test(s)));           // READ ONLY لا يقبل FOR UPDATE
  assert.deepStrictEqual(r.plan.i2.map((x) => x.action), ['FIX']);
  assert.deepStrictEqual(r.plan.i4.map((x) => x.action), ['CANCEL', 'CANCEL']);
  assert.strictEqual(r.applied, false);
});

test('I6 المتوقع: بعد إلغاء وجهتين 850+850 من 3400 → 1700 = السعة ✅', async () => {
  const c = mk({ i4: [DEST(), DEST({ id: 'd2' })] });
  const r = await run(c, { apply: false });
  assert.deepStrictEqual([r.plan.i6[0].before, r.plan.i6[0].expected_after, r.plan.i6[0].resolves], [3400, 1700, true]);
});

test('I6 لا يُحل إن كانت المُسلَّمة نفسها تتجاوز السعة (يُبلَّغ ولا يُخفى)', async () => {
  const c = mk({ i4: [DEST({ quantity: '100' })] });   // يُلغى 100 فقط → 3300 > 1700
  const r = await run(c, { apply: false });
  assert.strictEqual(r.plan.i6[0].resolves, false);
});

test('طن ×20 في حساب I6 المتوقع', async () => {
  const c = mk({ i4: [DEST({ quantity: '85', unit: 'ton' })] });  // 85 طن = 1700 كيس
  const r = await run(c, { apply: false });
  assert.strictEqual(r.plan.i6[0].expected_after, 1700);
});

test('I2: orders.fax_id غير فارغ يشير لفاكس آخر → MANUAL ولا يُكتب', async () => {
  const c = mk({ i2: [{ ...I2_FIX, current_fax_id: 'other' }], after: { i2: 1, i4: 1, i6: 1, i7: 0 } });
  const r = await run(c, { apply: true });
  assert.strictEqual(r.plan.i2[0].action, 'MANUAL');
  assert.strictEqual(writes(c).filter((s) => /^UPDATE orders/.test(s)).length, 0);
});

test('I4: وجهة مرتبطة بطلب مفتوح → MANUAL (لا تُلغى)؛ طلب DELIVERED أو بلا ربط → CANCEL', async () => {
  const c = mk({ i4: [DEST({ id: 'a', fulfills_order_id: 'o1', linked_order_status: 'PREPARING' }),
    DEST({ id: 'b', fulfills_order_id: 'o2', linked_order_status: 'DELIVERED' }), DEST({ id: 'c' })] });
  const r = await run(c, { apply: false });
  assert.deepStrictEqual(r.plan.i4.map((x) => x.action), ['MANUAL', 'CANCEL', 'CANCEL']);
});

test('--apply: UPDATE بحارس (fax_id IS NULL / status PENDING) + حدث data.cleanup لكل تغيير + COMMIT، ولا DELETE', async () => {
  const c = mk({ i2: [I2_FIX], i4: [DEST(), DEST({ id: 'd2' })], after: { i2: 0, i4: 0, i6: 0, i7: 0 } });
  const r = await run(c, { apply: true });
  assert.strictEqual(c.log[0], 'BEGIN');
  assert.strictEqual(c.log[c.log.length - 1], 'COMMIT');
  const w = writes(c);
  assert.strictEqual(w.filter((s) => /^UPDATE orders SET fax_id = \$1, updated_at = NOW\(\) WHERE id = \$2 AND fax_id IS NULL$/.test(s)).length, 1);
  assert.strictEqual(w.filter((s) => /^UPDATE delivery_destinations SET status = 'CANCELLED', updated_at = NOW\(\) WHERE id = \$1 AND status = 'PENDING'$/.test(s)).length, 2);
  assert.strictEqual(w.filter((s) => /^INSERT INTO automation_events/.test(s)).length, 3);
  assert.ok(!w.some((s) => /^DELETE/.test(s)));
  assert.ok(c.log.some((s) => /FOR UPDATE OF o/.test(s)) && c.log.some((s) => /FOR UPDATE OF d/.test(s)));
  assert.deepStrictEqual(r.after, { i2: 0, i4: 0, i6: 0, i7: 0 });
  assert.strictEqual(r.applied, true);
});

test('--apply: تغيّر الصف (rowCount ≠ 1) → ROLLBACK وخطأ، لا COMMIT', async () => {
  const c = mk({ i2: [I2_FIX], updateRowCount: 0 });
  await assert.rejects(run(c, { apply: true }), /أُلغيت المعاملة/);
  assert.strictEqual(c.log[c.log.length - 1], 'ROLLBACK');
  assert.ok(!c.log.includes('COMMIT'));
});

test('--apply: ساء أي مؤشر بعد التنفيذ → ROLLBACK', async () => {
  const c = mk({ i2: [I2_FIX], after: { i2: 2, i4: 1, i6: 1, i7: 0 } });
  await assert.rejects(run(c, { apply: true }), /ساء/);
  assert.ok(!c.log.includes('COMMIT'));
});

test('--number-active: يولّد رقمًا بالمولّد الآمن للنشطة فقط ويكتبه بحارس fax_number IS NULL', async () => {
  const c = mk({ i7: [{ id: 'f9', fax_number: null, status: 'USED' }], counts: { i2: 0, i4: 0, i6: 0, i7: 1 }, after: { i2: 0, i4: 0, i6: 0, i7: 0 } });
  await run(c, { apply: true, numberActive: true });
  const up = c.log.filter((s) => /^UPDATE loading_faxes SET fax_number/.test(s));
  assert.strictEqual(up.length, 1);
  assert.match(up[0], /WHERE id = \$2 AND fax_number IS NULL$/);
  assert.ok(c.log.some((s) => /pg_advisory_xact_lock/.test(s)));
});

test('بدون --number-active: لا ترقيم (I7 يُترك كما اتفقنا)', async () => {
  const c = mk({ i7: [{ id: 'f9', fax_number: null, status: 'USED' }] });
  const r = await run(c, { apply: false, numberActive: false });
  assert.strictEqual(r.plan.i7.length, 0);
});
