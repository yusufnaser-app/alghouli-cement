const test = require('node:test');
const assert = require('node:assert');
const { calcIncentive, rulesFor, periodRange, bagsToTons } = require('../src/modules/incentives/incentives.calc');

test('حافز لكل كيس', () => {
  const r = calcIncentive({ bags: 980 }, { unit: 'bag', rate_per_unit: '10' });
  assert.strictEqual(r.quantity, 980);
  assert.strictEqual(r.amount, 9800);
});

test('حافز لكل طن: 1000 كيس × 50 كجم = 50 طنًا', () => {
  assert.strictEqual(bagsToTons(1000), 50);
  const r = calcIncentive({ bags: 1000 }, { unit: 'ton', rate_per_unit: 200 });
  assert.strictEqual(r.quantity, 50);
  assert.strictEqual(r.amount, 10000);
});

test('كمية صفر أو قيمة غير رقمية لا تنتج NaN', () => {
  assert.strictEqual(calcIncentive({ bags: 0 }, { unit: 'bag', rate_per_unit: 5 }).amount, 0);
  assert.strictEqual(calcIncentive({ bags: 'abc' }, { unit: 'bag', rate_per_unit: 5 }).amount, 0);
  assert.strictEqual(calcIncentive({ bags: 10 }, { unit: 'bag', rate_per_unit: undefined }).amount, 0);
});

test('التقريب إلى خانتين عشريتين', () => {
  assert.strictEqual(calcIncentive({ bags: 3 }, { unit: 'bag', rate_per_unit: 0.335 }).amount, 1.01);
});

test('القاعدة بدون نوع سائق تنطبق على الجميع، والمحددة على نوعها فقط', () => {
  const rules = [{ id: 1, driver_type: null }, { id: 2, driver_type: 'institution_driver' }, { id: 3, driver_type: 'trader_driver' }];
  assert.deepStrictEqual(rulesFor('institution_driver', rules).map((r) => r.id), [1, 2]);
  assert.deepStrictEqual(rulesFor('trader_driver', rules).map((r) => r.id), [1, 3]);
});

test('حدود الفترة: شهري وسنوي (ديسمبر ينتهي في يناير التالي)', () => {
  const m = periodRange('monthly', 2026, 12);
  assert.strictEqual(m.start.toISOString(), '2026-12-01T00:00:00.000Z');
  assert.strictEqual(m.end.toISOString(), '2027-01-01T00:00:00.000Z');
  const y = periodRange('yearly', 2026);
  assert.strictEqual(y.end.toISOString(), '2027-01-01T00:00:00.000Z');
  assert.throws(() => periodRange('monthly', 2026, 13));
});
