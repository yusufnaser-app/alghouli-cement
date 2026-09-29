const test = require('node:test');
const assert = require('node:assert');
const { checkOne, checkAll, matches } = require('../src/modules/ceilings/ceilings.calc');

test('سقف بالكيس: لا يتجاوز ثم يتجاوز', () => {
  const c = { id: 1, name_ar: 'يومي', period: 'daily', max_bags: 5000, max_amount: null };
  assert.strictEqual(checkOne(c, { requestedBags: 3000, usedBags: 1000 }).exceeded, false);
  assert.strictEqual(checkOne(c, { requestedBags: 3000, usedBags: 2500 }).exceeded, true);
});

test('سقف بالقيمة مستقل عن سقف الكيس', () => {
  const c = { id: 1, name_ar: 'شهري', period: 'monthly', max_bags: null, max_amount: 1000000 };
  const r = checkOne(c, { requestedAmount: 900000, requestedBags: 999999, usedAmount: 200000, usedBags: 0 });
  assert.strictEqual(r.exceeded, true);
  assert.strictEqual(r.checks.length, 1); // max_bags غير مفعّل فلا يُفحص
});

test('القاعدة العامة (بلا عميل/مصنع/نوع) تنطبق على الجميع', () => {
  const rule = { id: 1, customer_id: null, source_id: null, category_id: null };
  assert.ok(matches(rule, { customerId: 'c1', sourceId: 's1', categoryId: 'k1' }));
  assert.ok(matches(rule, { customerId: 'c2', sourceId: 's2', categoryId: 'k2' }));
});

test('قاعدة مخصصة لعميل تنطبق عليه فقط', () => {
  const rule = { id: 1, customer_id: 'c1', source_id: null, category_id: null };
  assert.ok(matches(rule, { customerId: 'c1', sourceId: 's1', categoryId: 'k1' }));
  assert.ok(!matches(rule, { customerId: 'c2', sourceId: 's1', categoryId: 'k1' }));
});

test('checkAll: تجاوز أي قاعدة مطابقة واحدة يكفي لرفض الطلب', () => {
  const rules = [
    { id: 'general', customer_id: null, source_id: null, category_id: null, period: 'daily', max_bags: 100000, max_amount: null },
    { id: 'thisCustomer', customer_id: 'c1', source_id: null, category_id: null, period: 'daily', max_bags: 500, max_amount: null },
  ];
  const usage = { general: { usedBags: 0 }, thisCustomer: { usedBags: 400 } };
  const r = checkAll(rules, { customerId: 'c1', sourceId: 's1', categoryId: 'k1', requestedBags: 200 }, usage);
  assert.strictEqual(r.exceeded, true);
  assert.strictEqual(r.results.find((x) => x.ceiling_id === 'general').exceeded, false);
  assert.strictEqual(r.results.find((x) => x.ceiling_id === 'thisCustomer').exceeded, true);
});

test('checkAll: قاعدة عميل آخر لا تُطبَّق إطلاقًا', () => {
  const rules = [{ id: 1, customer_id: 'other', source_id: null, category_id: null, period: 'daily', max_bags: 1 }];
  const r = checkAll(rules, { customerId: 'c1', requestedBags: 999999 }, {});
  assert.strictEqual(r.results.length, 0);
  assert.strictEqual(r.exceeded, false);
});
