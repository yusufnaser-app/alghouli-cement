const test = require('node:test');
const assert = require('node:assert');
const E = require('../src/modules/accounting/accounting.engine');

const item = (q, p, d = 0) => ({ quantity: q, unitPrice: p, discount: d });
const calc = (o) => E.calcOrderValue({ currency: 'YER', ...o });
const m = E.fromMinor;

test('1) طلب بدون نقل: 1000 × 5,000 = 5,000,000', () => {
  const r = calc({ items: [item(1000, 5000)], loadedQuantity: 1000, transport: { mode: 'none' } });
  assert.strictEqual(m(r.customer_total), '5000000.00');
  assert.strictEqual(r.transport_total, 0);
});
test('2/4) سعر بدون نقل + أجور نقل على التاجر: يُضاف النقل فوق قيمة الأسمنت', () => {
  const r = calc({ items: [item(1000, 5000)], loadedQuantity: 1000, transport: { mode: 'separate', amount: 200000, unit: 'trip', beneficiary: 'trader' } });
  assert.strictEqual(m(r.customer_total), '5200000.00');
  assert.strictEqual(r.driver_transport, 0);
});
test('3) سعر شامل النقل: لا يُضاف النقل مرة ثانية', () => {
  const r = calc({ items: [item(1000, 5000)], loadedQuantity: 1000, transport: { mode: 'included', amount: 200000, unit: 'trip', beneficiary: 'trader' } });
  assert.strictEqual(m(r.customer_total), '5000000.00');
});
test('النقل على حساب السائق: يظهر في السائق فقط ولا يُضاف على العميل (لا Double Counting)', () => {
  const r = calc({ items: [item(1000, 5000)], loadedQuantity: 1000, transport: { mode: 'separate', amount: 200000, unit: 'trip', beneficiary: 'driver' } });
  assert.strictEqual(m(r.customer_total), '5000000.00');
  assert.strictEqual(m(r.driver_transport), '200000.00');
  assert.ok(!(r.customer_transport > 0 && r.driver_transport > 0));
});
test('5) خصم 100,000 على 5,000,000 = 4,900,000 ثم النقل', () => {
  const r = calc({ items: [item(1000, 5000, 100000)], loadedQuantity: 1000, transport: { mode: 'separate', amount: 200000, unit: 'trip', beneficiary: 'trader' } });
  assert.strictEqual(m(r.cement_net), '4900000.00');
  assert.strictEqual(m(r.customer_total), '5100000.00');
});
test('خصم أكبر من قيمة الأسمنت مرفوض', () => {
  assert.throws(() => calc({ items: [item(10, 100, 5000)], loadedQuantity: 10 }), /الخصم أكبر/);
});
test('6) مطلوب 100 ومحمّل 90: القيمة على 90 فقط', () => {
  const r = calc({ items: [item(100, 5000)], loadedQuantity: 90 });
  assert.strictEqual(m(r.customer_total), '450000.00');
  assert.strictEqual(r.loaded_quantity, '90.00');
  assert.strictEqual(r.requested_quantity, '100.00');
});
test('6ب) الخصم يتناسب مع الكمية المحملة (950/1000 من 100,000 = 95,000)', () => {
  const r = calc({ items: [item(1000, 5000, 100000)], loadedQuantity: 950 });
  assert.strictEqual(m(r.discount), '95000.00');
  assert.strictEqual(m(r.customer_total), '4655000.00');
});
test('النقل بالكيس يتناسب مع المحمّل، والنقل بالرحلة ثابت', () => {
  const bag = calc({ items: [item(1000, 5000)], loadedQuantity: 950, transport: { mode: 'separate', amount: 200000, unit: 'bag', beneficiary: 'trader' } });
  assert.strictEqual(m(bag.transport_total), '190000.00');
  const trip = calc({ items: [item(1000, 5000)], loadedQuantity: 950, transport: { mode: 'separate', amount: 200000, unit: 'trip', beneficiary: 'trader' } });
  assert.strictEqual(m(trip.transport_total), '200000.00');
});
test('الكمية المحملة أكبر من المطلوبة مرفوضة', () => {
  assert.throws(() => calc({ items: [item(100, 5000)], loadedQuantity: 101 }), /أكبر من كمية الطلب/);
});
test('لا أخطاء فاصلة عائمة: 0.1+0.2 و 1.005 و مبالغ كبيرة', () => {
  assert.strictEqual(E.toMinor('0.1') + E.toMinor('0.2'), 30);
  assert.strictEqual(m(E.toMinor('19.99') * 3), '59.97');
  const r = calc({ items: [item(3, '33.33')], loadedQuantity: 3 });
  assert.strictEqual(m(r.customer_total), '99.99');
});
test('11-13) العملات YER/USD/SAR مقبولة وغيرها مرفوضة، دون سعر صرف', () => {
  ['YER', 'USD', 'SAR'].forEach((c) => assert.strictEqual(E.assertCurrency(c), c));
  assert.throws(() => E.assertCurrency('EUR'), /غير مدعومة/);
  assert.throws(() => E.assertCurrency(''), /غير مدعومة/);
});

// ─── كشف الحساب ───
const e = (id, cur, d, c, date, type = 'actual_sale', extra = {}) => ({ id, currency: cur, debit: d, credit: c, entry_date: date, transaction_type: type, seq: Number(id.replace(/\D/g, '')), reference_code: `R${id}`, ...extra });

test('14) عميل بثلاث عملات: ثلاثة أرصدة منفصلة (YER 2,000,000 / USD 1,500 / SAR 800)', () => {
  const st = E.buildStatement([
    e('1', 'YER', '2000000', 0, '2026-01-01'), e('2', 'USD', '1500', 0, '2026-01-02'), e('3', 'SAR', '800', 0, '2026-01-03'),
  ]);
  assert.deepStrictEqual(st.sections.map((s) => [s.currency, s.closing_balance]), [['YER', '2000000.00'], ['USD', '1500.00'], ['SAR', '800.00']]);
  const b = E.computeBalances([e('1', 'YER', '2000000', 0, '2026-01-01'), e('2', 'USD', '1500', 0, '2026-01-02')]);
  assert.deepStrictEqual(b, { YER: 200000000, USD: 150000 });
});
test('24) رصيد افتتاحي + حركات: الختامي = الافتتاحي + المدين − الدائن', () => {
  const st = E.buildStatement([
    e('1', 'YER', '1000000', 0, '2026-01-01', 'opening_balance'),
    e('2', 'YER', '500000', 0, '2026-02-01'), e('3', 'YER', 0, '300000', '2026-02-05', 'payment'),
  ]);
  const s = st.sections[0];
  assert.strictEqual(s.opening_balance, '1000000.00');
  assert.strictEqual(s.total_debit, '500000.00');
  assert.strictEqual(s.total_credit, '300000.00');
  assert.strictEqual(s.closing_balance, '1200000.00');
  assert.deepStrictEqual(s.rows.map((r) => r.balance), ['1500000.00', '1200000.00']);
});
test('الفترة: الحركات قبل الفترة تدخل في الافتتاحي، وما بعدها يُستبعد', () => {
  const st = E.buildStatement([
    e('1', 'YER', '100', 0, '2026-01-10'), e('2', 'YER', '50', 0, '2026-02-10'), e('3', 'YER', 0, '30', '2026-03-10', 'payment'),
  ], { from: '2026-02-01', to: '2026-02-28' });
  const s = st.sections[0];
  assert.strictEqual(s.opening_balance, '100.00');
  assert.strictEqual(s.rows.length, 1);
  assert.strictEqual(s.closing_balance, '150.00');
});
test('25) عميل بدون حركات: لا أقسام، no_movements=true', () => {
  const st = E.buildStatement([]);
  assert.strictEqual(st.no_movements, true);
  assert.deepStrictEqual(st.sections, []);
});
test('26) رصيد مدين / 27) رصيد دائن', () => {
  assert.strictEqual(E.buildStatement([e('1', 'YER', '500', 0, '2026-01-01')]).sections[0].closing_side, 'مدين');
  const cr = E.buildStatement([e('1', 'YER', 0, '700', '2026-01-01', 'payment')]).sections[0];
  assert.strictEqual(cr.closing_balance, '-700.00');
  assert.strictEqual(cr.closing_side, 'دائن');
});
test('8) دفع جزئي: مطلوب 1,000,000 مدفوع 700,000 → متبقٍ 300,000 مدين', () => {
  const s = E.buildStatement([e('1', 'YER', '1000000', 0, '2026-01-01'), e('2', 'YER', 0, '700000', '2026-01-02', 'payment')]).sections[0];
  assert.strictEqual(s.closing_balance, '300000.00');
});
test('9) دفع زائد: 1,200,000 على 1,000,000 → 200,000 رصيد دائن (لا يضيع الفرق)', () => {
  const s = E.buildStatement([e('1', 'YER', '1000000', 0, '2026-01-01'), e('2', 'YER', 0, '1200000', '2026-01-02', 'payment')]).sections[0];
  assert.strictEqual(s.closing_balance, '-200000.00');
  assert.strictEqual(s.closing_side, 'دائن');
});
test('10) دفعتان لنفس الطلب تُجمعان', () => {
  const s = E.buildStatement([e('1', 'YER', '1000000', 0, '2026-01-01'), e('2', 'YER', 0, '400000', '2026-01-02', 'payment'), e('3', 'YER', 0, '600000', '2026-01-03', 'payment')]).sections[0];
  assert.strictEqual(s.closing_balance, '0.00');
  assert.strictEqual(s.closing_side, 'متوازن');
});

// ─── التسويات بعد الترحيل ───
test('16) تعديل السعر 5,000→5,500 بعد الترحيل: التسوية = الفرق فقط (+500,000) وليس 5,500,000', () => {
  const prev = calc({ items: [item(1000, 5000)], loadedQuantity: 1000 });
  const next = calc({ items: [item(1000, 5500)], loadedQuantity: 1000 });
  const d = E.diffPosting(prev, next);
  assert.strictEqual(m(d.customer_delta), '500000.00');
  assert.deepStrictEqual(E.signedToEntry(d.customer_delta), { debit: 50000000, credit: 0 });
  const s = E.buildStatement([e('1', 'YER', '5000000', 0, '2026-01-01'), e('2', 'YER', '500000', 0, '2026-01-02', 'adjustment')]).sections[0];
  assert.strictEqual(s.closing_balance, '5500000.00');
});
test('17) تعديل الكمية 1000→950: قيد دائن بالفرق 250,000 فقط', () => {
  const prev = calc({ items: [item(1000, 5000)], loadedQuantity: 1000 });
  const next = calc({ items: [item(1000, 5000)], loadedQuantity: 950 });
  const d = E.diffPosting(prev, next);
  assert.strictEqual(m(d.customer_delta), '-250000.00');
  assert.deepStrictEqual(E.signedToEntry(d.customer_delta), { debit: 0, credit: 25000000 });
});
test('18) تعديل النقل 200,000→250,000: الفرق 50,000 فقط (على التاجر)', () => {
  const t = (a) => ({ mode: 'separate', amount: a, unit: 'trip', beneficiary: 'trader' });
  const d = E.diffPosting(calc({ items: [item(1000, 5000)], loadedQuantity: 1000, transport: t(200000) }), calc({ items: [item(1000, 5000)], loadedQuantity: 1000, transport: t(250000) }));
  assert.strictEqual(m(d.customer_delta), '50000.00');
  const dd = E.diffPosting(calc({ items: [item(1000, 5000)], loadedQuantity: 1000, transport: { ...t(200000), beneficiary: 'driver' } }), calc({ items: [item(1000, 5000)], loadedQuantity: 1000, transport: { ...t(250000), beneficiary: 'driver' } }));
  assert.strictEqual(m(dd.driver_delta), '50000.00');
  assert.strictEqual(dd.customer_delta, 0);
});

// ─── إعادة البناء والفحص ───
test('إعادة بناء الرصيد: يعرض الفرق ولا يخفيه', () => {
  const entries = [e('1', 'YER', '1000', 0, '2026-01-01'), e('2', 'YER', 0, '400', '2026-01-02', 'payment')];
  const ok = E.rebuildAndCompare(entries, { YER: '600.00' });
  assert.strictEqual(ok[0].matches, true);
  const bad = E.rebuildAndCompare(entries, { YER: '1000.00' })[0];
  assert.strictEqual(bad.matches, false);
  assert.strictEqual(bad.difference, '400.00');
  assert.ok(bad.last_entry && bad.probable_cause);
});

const codes = (r) => r.map((x) => x.code);
test('الفحص التلقائي يكتشف: مكرر، بدون مرجع، طلب يتيم، عملة خاطئة، دفعة غير معتمدة، دفعة بلا قيد، ازدواج نقل، رصيد افتتاحي مكرر', () => {
  const base = { customer_id: 'C1', order_id: 'O1' };
  const ledger = [
    { ...e('1', 'YER', '100', 0, '2026-01-01'), ...base, source_id: 'O1', source_type: 'order_fulfillment' },
    { ...e('2', 'YER', '100', 0, '2026-01-01'), ...base, source_id: 'O1', source_type: 'order_fulfillment' }, // مكرر
    { ...e('3', 'YER', '10', 0, '2026-01-01', 'actual_sale'), customer_id: 'C1', order_id: 'GONE', reference_code: null }, // يتيم + بلا مرجع
    { ...e('4', 'EUR', '10', 0, '2026-01-01'), ...base, source_id: 'x' }, // عملة خاطئة
    { ...e('5', 'YER', 0, '50', '2026-01-01', 'payment'), ...base, source_type: 'payment', source_id: 'P1' }, // دفعة مرفوضة تؤثر
    { ...e('6', 'YER', '9', 0, '2026-01-01', 'opening_balance'), customer_id: 'C1' },
    { ...e('7', 'YER', '9', 0, '2026-01-02', 'opening_balance'), customer_id: 'C1' },
    { ...e('8', 'YER', 0, '5', '2026-01-02', 'payment'), ...base, source_id: 'z' }, // إشارة
    { ...e('9', 'YER', '5', 0, '2026-01-02', 'payment'), ...base, source_id: 'w' }, // دفعة بإشارة مدينة
  ];
  const r = E.runIntegrityChecks({
    ledger, orders: [{ id: 'O1', status: 'LOADED', currency: 'YER', accounting_status: 'POSTED' }],
    payments: [{ id: 'P1', order_id: 'O1', status: 'rejected', payment_currency: 'YER', amount_transferred: '50' }, { id: 'P2', order_id: 'O1', status: 'approved', payment_currency: 'USD', amount_transferred: '5' }],
    postings: [{ order_id: 'O1', loaded_quantity: '10', customer_debit: '100', driver_transport_debit: '5', trader_transport_amount: '5' }, { order_id: 'O1', loaded_quantity: '10', customer_debit: '100' }],
    faxes: [{ order_id: 'O1', status: 'USED', loaded_quantity: '12' }], driverLedger: [], balances: { C1: { YER: '1.00' } },
  });
  const c = codes(r);
  ['DUPLICATE_ENTRY', 'MISSING_REFERENCE', 'ORPHAN_ORDER', 'BAD_CURRENCY', 'UNAPPROVED_PAYMENT_AFFECTS_BALANCE', 'APPROVED_PAYMENT_WITHOUT_ENTRY',
    'DUPLICATE_OPENING_BALANCE', 'WRONG_SIGN', 'ORDER_POSTED_MULTIPLE_TIMES', 'TRANSPORT_DOUBLE_COUNTED', 'QUANTITY_MISMATCH', 'BALANCE_MISMATCH']
    .forEach((k) => assert.ok(c.includes(k), `لم يُكتشف ${k}: ${[...new Set(c)].join(',')}`));
});
test('الفحص: طلب ملغى لا يزال يؤثر + تحميل بلا ترحيل + حساب سليم لا يُنتج تحذيرات', () => {
  const r = E.runIntegrityChecks({
    ledger: [{ ...e('1', 'YER', '100', 0, '2026-01-01'), customer_id: 'C1', order_id: 'O1', source_id: 'O1', source_type: 'order_fulfillment' }],
    orders: [{ id: 'O1', status: 'CANCELLED', currency: 'YER', accounting_status: 'POSTED' }, { id: 'O2', status: 'LOADED', currency: 'YER', accounting_status: 'PENDING' }],
    payments: [], postings: [], faxes: [{ order_id: 'O2', status: 'USED', loaded_quantity: '5' }], driverLedger: [], balances: { C1: { YER: '100.00' } },
  });
  assert.ok(codes(r).includes('CANCELLED_ORDER_STILL_AFFECTS'));
  assert.ok(codes(r).includes('LOADED_NOT_POSTED'));
  const clean = E.runIntegrityChecks({
    ledger: [{ ...e('1', 'YER', '100', 0, '2026-01-01'), customer_id: 'C1', order_id: 'O1', source_id: 'O1', source_type: 'order_fulfillment', balance_after: '100.00' }],
    orders: [{ id: 'O1', status: 'LOADED', currency: 'YER', accounting_status: 'POSTED' }], payments: [],
    postings: [{ order_id: 'O1', loaded_quantity: '1', customer_debit: '100.00' }], faxes: [{ order_id: 'O1', status: 'USED', loaded_quantity: '1' }],
    driverLedger: [], balances: { C1: { YER: '100.00' } },
  });
  assert.deepStrictEqual(codes(clean), []);
});
