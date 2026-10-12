'use strict';
const test = require('node:test');
const assert = require('node:assert');
const engine = require('../src/modules/accounting/accounting.engine');

const { calcOrderValue, toMinor, fromMinor, loadedInItemUnits, bagFactor, AccountingError } = engine;
const ton = (q, p, d = 0) => ({ quantity: String(q), unit: 'ton', unitPrice: String(p), discount: String(d) });
const bag = (q, p, d = 0) => ({ quantity: String(q), unit: 'bag', unitPrice: String(p), discount: String(d) });

test('G1-1) معامل الأكياس: الطن = 20، الكيس/فارغ = 1', () => {
  assert.strictEqual(bagFactor('ton'), 20);
  assert.strictEqual(bagFactor('TON'), 20);
  assert.strictEqual(bagFactor('bag'), 1);
  assert.strictEqual(bagFactor(undefined), 1);
});

test('G1-2) طلب بالكيس فقط: النتائج كما كانت (انحدار)', () => {
  const c = calcOrderValue({ items: [bag(100, 5000)], loadedQuantity: '50' });
  assert.strictEqual(c.cement_gross, toMinor(250000));
  assert.strictEqual(c.requested_quantity, fromMinor(toMinor(100)));
  assert.strictEqual(c.loaded_quantity, fromMinor(toMinor(50)));
});

test('G1-3) طلب سائب فقط: 5 طن بسعر 100000/طن، محمّل 100 كيس = 5 طن ⇒ 500000 (كان يرفض خطأً)', () => {
  const c = calcOrderValue({ items: [ton(5, 100000)], loadedQuantity: '100' });
  assert.strictEqual(c.cement_gross, toMinor(500000));
  assert.strictEqual(c.requested_quantity, fromMinor(toMinor(100)));   // الطلب بالأكياس: 5 طن = 100
});

test('G1-4) خليط: 2 طن@100000 + 50 كيس@5000، محمّل 90 كيس (الكل) ⇒ 200000 + 250000 = 450000', () => {
  const c = calcOrderValue({ items: [ton(2, 100000), bag(50, 5000)], loadedQuantity: '90' });
  assert.strictEqual(c.cement_gross, toMinor(450000));
});

test('G1-5) خليط نصف الكمية: محمّل 45 كيس ⇒ نصف القيمة 225000', () => {
  const c = calcOrderValue({ items: [ton(2, 100000), bag(50, 5000)], loadedQuantity: '45' });
  assert.strictEqual(c.cement_gross, toMinor(225000));
});

test('G1-6) تجاوز الكمية المطلوبة بالأكياس يُرفض (90 مطلوبة، 100 محمّلة)', () => {
  assert.throws(() => calcOrderValue({ items: [ton(2, 100000), bag(50, 5000)], loadedQuantity: '100' }),
    (e) => e instanceof AccountingError && e.code === 'LOADED_EXCEEDS_REQUESTED');
});

test('G1-7) الخصم يُوزَّع بنفس نسبة التحميل L/R', () => {
  const full = calcOrderValue({ items: [ton(5, 100000, 10000)], loadedQuantity: '100' });
  assert.strictEqual(full.discount, toMinor(10000));
  const half = calcOrderValue({ items: [ton(5, 100000, 10000)], loadedQuantity: '50' });
  assert.strictEqual(half.discount, toMinor(5000));
  assert.strictEqual(half.cement_gross, toMinor(250000));
});

test('G1-8) الكمية المحمّلة لكل بند بوحدته: 45 كيس من (2 طن + 50 كيس) = 1 طن + 25 كيس', () => {
  const per = loadedInItemUnits([{ quantity: '2', unit: 'ton' }, { quantity: '50', unit: 'bag' }], '45');
  assert.deepStrictEqual(per.map((x) => Number(x)), [1, 25]);
  // مجموعها بالأكياس = الكمية المحمّلة
  assert.strictEqual(Number(per[0]) * 20 + Number(per[1]), 45);
});

test('G1-9) توزيع الكمية بوحدة البند يتطابق مع المبلغ: مجموع (حصة × سعر) = القيمة الكلية', () => {
  const items = [ton(2, 100000), bag(50, 5000)];
  const per = loadedInItemUnits(items, '45');
  const viaShares = per.reduce((s, q, i) => s + Number(q) * Number(items[i].unitPrice), 0);
  const total = calcOrderValue({ items, loadedQuantity: '45' }).cement_gross;
  assert.strictEqual(Math.round(viaShares * 100), total);
});

test('G1-10) ملاحظة: مواقع الكود تمرّر الوحدة — فحص مصدري', () => {
  const fs = require('fs'); const path = require('path');
  const read = (r) => fs.readFileSync(path.join(__dirname, '..', r), 'utf8');
  const of = read('src/modules/accounting/order-fulfillment.service.js');
  assert.ok(/quantity: x\.quantity, unit: x\.unit, unitPrice/.test(of));
  assert.ok(!/reqTotal = items\.rows\.reduce\(\(s, x\) => s \+ toMinor\(x\.quantity\), 0\)/.test(of));
  assert.ok(/SELECT oi\.order_id, oi\.quantity, oi\.unit, oi\.unit_price/.test(read('src/modules/accounting/integrity.service.js')));
});
