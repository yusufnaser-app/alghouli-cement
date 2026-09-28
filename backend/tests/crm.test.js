const test = require('node:test');
const assert = require('node:assert');
const { buildConfig, classify, pickBigCustomers, DEFAULTS } = require('../src/modules/crm/crm.calc');

const NOW = new Date('2026-09-28T00:00:00Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();
const cfg = { ...DEFAULTS };
const base = { id: 'c1', customer_type: 'individual', created_at: daysAgo(400), orders_count: 5,
  last_order_at: daysAgo(5), recent_count: 2, baseline_count: 6 };

test('الإعدادات: قيم افتراضية، وتُقرأ من settings عند وجودها، وتتجاهل القيم التالفة', () => {
  assert.deepStrictEqual(buildConfig([]), DEFAULTS);
  assert.strictEqual(buildConfig([{ key: 'crm_inactive_days', value: '120' }]).inactive_days, 120);
  assert.strictEqual(buildConfig([{ key: 'crm_inactive_days', value: 'abc' }]).inactive_days, 90);
  assert.strictEqual(buildConfig([{ key: 'crm_inactive_days', value: '-5' }]).inactive_days, 90);
});

test('عميل جديد ونشط', () => {
  const r = classify({ ...base, created_at: daysAgo(10), orders_count: 1, last_order_at: daysAgo(3) }, cfg, new Set(), NOW);
  assert.ok(r.segments.includes('new') && r.segments.includes('active'));
});

test('غير نشط: آخر طلب قبل أكثر من 90 يومًا', () => {
  const r = classify({ ...base, last_order_at: daysAgo(120), recent_count: 0, baseline_count: 3 }, cfg, new Set(), NOW);
  assert.ok(r.segments.includes('inactive'));
  assert.ok(!r.segments.includes('low_activity'));
  assert.strictEqual(r.days_since_last_order, 120);
});

test('عميل قديم بلا أي طلب = غير نشط، لكن الجديد بلا طلب ليس كذلك', () => {
  const old = classify({ ...base, orders_count: 0, last_order_at: null, recent_count: 0, baseline_count: 0 }, cfg, new Set(), NOW);
  assert.ok(old.segments.includes('inactive'));
  const fresh = classify({ ...base, created_at: daysAgo(5), orders_count: 0, last_order_at: null, recent_count: 0, baseline_count: 0 }, cfg, new Set(), NOW);
  assert.ok(!fresh.segments.includes('inactive'));
});

test('انخفاض النشاط: كان 2 طلب/شهر والآن 0 (لكنه ما زال ضمن 90 يومًا)', () => {
  const r = classify({ ...base, last_order_at: daysAgo(40), recent_count: 0, baseline_count: 12 }, cfg, new Set(), NOW);
  assert.ok(r.segments.includes('low_activity'));
  assert.strictEqual(r.baseline_monthly_orders, 2);
});

test('لا انخفاض إن كان النشاط الحالي طبيعيًا أو المعدل السابق أقل من طلب شهريًا', () => {
  assert.ok(!classify({ ...base, recent_count: 2, baseline_count: 12 }, cfg, new Set(), NOW).segments.includes('low_activity'));
  assert.ok(!classify({ ...base, recent_count: 0, baseline_count: 3 }, cfg, new Set(), NOW).segments.includes('low_activity'));
});

test('العملاء الكبار: أعلى N بإجمالي 365 يومًا، ويُستثنى من مشترياته صفر', () => {
  const rows = [{ id: 'a', total_365: '500' }, { id: 'b', total_365: '900' }, { id: 'c', total_365: '0' }, { id: 'd', total_365: '100' }];
  const big = pickBigCustomers(rows, 2);
  assert.deepStrictEqual([...big].sort(), ['a', 'b']);
  assert.ok(classify({ ...base, id: 'a' }, cfg, big, NOW).segments.includes('big'));
});

test('نوع العميل يظهر كتصنيف (تاجر/موزع/مقاول)', () => {
  assert.ok(classify({ ...base, customer_type: 'trader' }, cfg, new Set(), NOW).segments.includes('trader'));
  assert.ok(!classify({ ...base, customer_type: 'individual' }, cfg, new Set(), NOW).segments.includes('trader'));
});
