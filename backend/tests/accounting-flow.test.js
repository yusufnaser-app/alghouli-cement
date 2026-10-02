const test = require('node:test');
const assert = require('node:assert');
const { install, clearModules } = require('./helpers');
const { makeDb } = require('./fake-db');

const MODS = ['src/modules/accounting/ledger.core.js', 'src/modules/accounting/order-fulfillment.service.js',
  'src/modules/payments/payments.service.js', 'src/modules/audit/audit.service.js'];

const seed = (over = {}) => ({
  customers: { C1: { id: 'C1' } }, drivers: { D1: { current_balance: '0.00' } },
  orders: { O1: { id: 'O1', order_number: 'ORD-1', customer_id: 'C1', status: 'PAYMENT_APPROVED', currency: 'YER', total_amount: '5000000.00',
    shipping_amount: '0', transport_beneficiary: null, accounting_status: 'PENDING', fax_requested: false, priced_by: 'U-SALES' } },
  items: [{ id: 'I1', order_id: 'O1', product_id: 'P1', source_id: 'S1', quantity: '1000.00', unit: 'bag', unit_price: '5000.00', discount: '0' }],
  faxes: { F1: { id: 'F1', order_id: 'O1', factory_id: 'S1', fax_number: 'FX-1', requested_quantity: '1000.00', status: 'USED', driver_id: null, is_managed_by_institution: true } },
  ...over,
});
const load = (s = seed()) => {
  const db = makeDb(s);
  install({ pool: db.pool, query: db.query });
  clearModules(...MODS);
  return { db, core: require('../src/modules/accounting/ledger.core'), ful: require('../src/modules/accounting/order-fulfillment.service'),
    pay: require('../src/modules/payments/payments.service') };
};
const withTx = async (db, fn) => { const c = await db.pool.connect(); await c.query('BEGIN'); try { const r = await fn(c); await c.query('COMMIT'); return r; } catch (e) { await c.query('ROLLBACK'); throw e; } };
const debitSum = (db, cur) => db.state.ledger.filter((l) => l.currency === cur).reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0);

test('نواة الدفتر: قيد مدين ثم دائن، الرصيد لكل عملة منفصل', async () => {
  const { db, core } = load();
  await withTx(db, async (c) => {
    await core.postCustomerEntry(c, { customerId: 'C1', currency: 'YER', debit: '2000000', transactionType: 'actual_sale', referenceCode: 'A', idempotencyKey: 'k1' });
    await core.postCustomerEntry(c, { customerId: 'C1', currency: 'USD', debit: '1500', transactionType: 'actual_sale', referenceCode: 'B', idempotencyKey: 'k2' });
    await core.postCustomerEntry(c, { customerId: 'C1', currency: 'SAR', debit: '800', transactionType: 'actual_sale', referenceCode: 'C', idempotencyKey: 'k3' });
    await core.postCustomerEntry(c, { customerId: 'C1', currency: 'USD', credit: '500', transactionType: 'payment', referenceCode: 'D', idempotencyKey: 'k4' });
  });
  assert.deepStrictEqual(await core.getBalances(db.pool, 'C1'), { YER: '2000000.00', USD: '1000.00', SAR: '800.00' });
});
test('رفض: مبلغ سالب / صفر / الاثنان معًا / بدون مرجع / عملة غير مدعومة', async () => {
  const { db, core } = load();
  const base = { customerId: 'C1', currency: 'YER', transactionType: 'x', referenceCode: 'R' };
  for (const bad of [{ debit: '-5' }, { debit: 0, credit: 0 }, { debit: 5, credit: 5 }, { debit: 5, currency: 'EUR' }, { debit: 5, referenceCode: null }]) {
    await assert.rejects(withTx(db, (c) => core.postCustomerEntry(c, { ...base, ...bad })));
  }
  assert.strictEqual(db.state.ledger.length, 0);
});
test('21) نفس المفتاح مرتين = قيد واحد (idempotent) حتى مع طلبين متزامنين', async () => {
  const { db, core } = load();
  const p = { customerId: 'C1', currency: 'YER', credit: '700000', transactionType: 'payment', referenceCode: 'PAY-1', idempotencyKey: 'payment:P1:approve' };
  await Promise.all([withTx(db, (c) => core.postCustomerEntry(c, p)), withTx(db, (c) => core.postCustomerEntry(c, p))]);
  assert.strictEqual(db.state.ledger.length, 1);
  assert.strictEqual(await core.readBalance(db.pool, 'C1', 'YER'), -70000000);
});
test('عكس القيد: قيد معاكس يحتفظ بالأصل والسبب، والعكس المزدوج لا يُنتج قيدين', async () => {
  const { db, core } = load();
  const o = await withTx(db, (c) => core.postCustomerEntry(c, { customerId: 'C1', currency: 'YER', debit: '1000', transactionType: 'actual_sale', referenceCode: 'S', idempotencyKey: 's1' }));
  await withTx(db, (c) => core.reverseCustomerEntry(c, o.entry.id, { reason: 'خطأ إدخال', userId: 'U1' }));
  await withTx(db, (c) => core.reverseCustomerEntry(c, o.entry.id, { reason: 'خطأ إدخال', userId: 'U1' })); // ثانية
  const rows = db.state.ledger;
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[1].reversal_of_id, o.entry.id);
  assert.strictEqual(rows[1].reason, 'خطأ إدخال');
  assert.strictEqual(debitSum(db, 'YER'), 0);
  await assert.rejects(withTx(db, (c) => core.reverseCustomerEntry(c, o.entry.id, { reason: '' })), /سبب/);
});
test('لا يمكن تنفيذ قيد خارج Transaction (client غير صالح)', async () => {
  const { core } = load();
  await assert.rejects(core.postCustomerEntry(null, { customerId: 'C1', currency: 'YER', debit: 1, transactionType: 'x', referenceCode: 'r' }), /Transaction/);
});

// ───────── الترحيل ─────────
test('الترحيل: كمية محملة 950 من 1000 → مدين 4,750,000 (وليس 5,000,000) + مصنع + مخزون + تدقيق', async () => {
  const { db, ful } = load();
  const r = await withTx(db, (c) => ful.postActualLoading(c, 'F1', 950, 'U-LOAD'));
  assert.strictEqual(r.already_posted, false);
  assert.strictEqual(r.final_total_amount, '4750000.00');
  assert.strictEqual(r.discrepancy, '-50.00');
  assert.strictEqual(db.state.ledger.length, 1);
  assert.strictEqual(db.state.ledger[0].debit, '4750000.00');
  assert.strictEqual(db.state.ledger[0].credit, '0.00');
  assert.strictEqual(db.state.factory[0].quantity, '950.00');
  assert.strictEqual(db.state.postings.O1.loaded_quantity, '950.00');
  assert.ok(db.state.audit.some((a) => a.action === 'ORDER_POSTED'));
});
test('20/22) إعادة الترحيل/اعتماد التحميل مرتين: قيد واحد فقط وبلا تغيير في الرصيد', async () => {
  const { db, ful, core } = load();
  await withTx(db, (c) => ful.postActualLoading(c, 'F1', 950, 'U'));
  const again = await withTx(db, (c) => ful.postActualLoading(c, 'F1', 950, 'U'));
  const third = await withTx(db, (c) => ful.postActualLoading(c, 'F1', 1000, 'U')); // محاولة بكمية مختلفة لا تضيف شيئًا
  assert.strictEqual(again.already_posted, true);
  assert.strictEqual(third.already_posted, true);
  assert.strictEqual(db.state.ledger.length, 1);
  assert.strictEqual(db.state.factory.length, 1);
  assert.strictEqual(await core.readBalance(db.pool, 'C1', 'YER'), 475000000);
});
test('الترحيل المتزامن (ضغطتان سريعتان): قيد بيع واحد', async () => {
  const { db, ful } = load();
  await Promise.all([withTx(db, (c) => ful.postActualLoading(c, 'F1', 1000, 'U')), withTx(db, (c) => ful.postActualLoading(c, 'F1', 1000, 'U'))]);
  assert.strictEqual(db.state.ledger.filter((l) => l.transaction_type === 'actual_sale').length, 1);
});
test('الكمية المحملة أكبر من المطلوبة ترفض ولا يبقى أي أثر (Rollback)', async () => {
  const { db, ful } = load();
  await assert.rejects(withTx(db, (c) => ful.postActualLoading(c, 'F1', 1001, 'U')), /أكبر من كمية الطلب/);
  assert.strictEqual(db.state.ledger.length, 0);
  assert.strictEqual(db.state.orders.O1.status, 'PAYMENT_APPROVED');
});
test('الطلب غير المسعّر لا يُرحَّل', async () => {
  const s = seed(); s.items[0].unit_price = null;
  const { db, ful } = load(s);
  await assert.rejects(withTx(db, (c) => ful.postActualLoading(c, 'F1', 100, 'U')), /غير مسعّر/);
});
test('الطلب الملغى لا يُرحَّل', async () => {
  const s = seed(); s.orders.O1.status = 'CANCELLED';
  const { db, ful } = load(s);
  await assert.rejects(withTx(db, (c) => ful.postActualLoading(c, 'F1', 100, 'U')), /ملغى/);
});
test('فشل جزء من العملية بعد القيد = Rollback كامل (لا Loaded بدون قيد ولا قيد بدون Loaded)', async () => {
  const { db, ful } = load();
  const real = db.state;
  await assert.rejects(withTx(db, async (c) => {
    await ful.postActualLoading(c, 'F1', 950, 'U');
    throw new Error('فشل لاحق في نفس المعاملة');
  }), /فشل لاحق/);
  assert.strictEqual(db.state.ledger.length, 0);
  assert.strictEqual(Object.keys(db.state.postings).length, 0);
  assert.strictEqual(db.state.orders.O1.status, 'PAYMENT_APPROVED');
  assert.ok(real);
});
test('النقل على السائق: قيد سائق واحد ولا إضافة على العميل؛ وإعادة الترحيل لا تكرره', async () => {
  const s = seed(); s.orders.O1.shipping_amount = '200000'; s.orders.O1.transport_beneficiary = 'driver'; s.orders.O1.transport_mode = 'separate';
  s.faxes.F1.driver_id = 'D1'; s.orders.O1.transport_unit = 'trip'; s.faxes.F1.transport_rate_unit = 'trip';
  const { db, ful } = load(s);
  await withTx(db, (c) => ful.postActualLoading(c, 'F1', 1000, 'U'));
  await withTx(db, (c) => ful.postActualLoading(c, 'F1', 1000, 'U'));
  assert.strictEqual(db.state.ledger[0].debit, '5000000.00');
  assert.strictEqual(db.state.driverLedger.length, 1);
  assert.strictEqual(db.state.driverLedger[0].debit, '200000.00');
  assert.strictEqual(db.state.drivers.D1.current_balance, '200000.00');
});
test('نقل سبق قيده عند خط السير لا يُكرَّر عند الترحيل (يُسوّى بالفرق)', async () => {
  const s = seed(); s.orders.O1.transport_beneficiary = 'driver'; s.orders.O1.transport_mode = 'separate'; s.faxes.F1.driver_id = 'D1';
  s.faxes.F1.transport_total = '200000.00'; s.faxes.F1.transport_rate_unit = 'trip';
  s.driverLedger = [{ id: 'D0', driver_id: 'D1', order_id: 'O1', transaction_type: 'transport_due', debit: '200000.00', credit: '0.00' }];
  s.drivers.D1.current_balance = '200000.00';
  const { db, ful } = load(s);
  await withTx(db, (c) => ful.postActualLoading(c, 'F1', 1000, 'U'));
  assert.strictEqual(db.state.driverLedger.length, 1); // لا قيد ثانٍ
  assert.strictEqual(db.state.drivers.D1.current_balance, '200000.00');
});

// ───────── الدفعات ─────────
const paySeed = (over = {}) => {
  const s = seed({ payments: { P1: { id: 'P1', order_id: 'O1', status: 'under_review', amount_transferred: '700000.00', payment_currency: 'YER', reference_code: 'PAY-2026-000001' } } });
  s.orders.O1.status = 'PENDING_PAYMENT_REVIEW';
  return Object.assign(s, over);
};
test('7/8) اعتماد دفعة جزئية 700,000 من 1,000,000: قيد دائن واحد والمتبقي 300,000', async () => {
  const s = paySeed(); s.orders.O1.total_amount = '1000000.00';
  const { db, pay, core } = load(s);
  const r = await pay.approvePayment('P1', 'U-ACC', { roles: ['accountant'] });
  assert.strictEqual(r.status, 'approved');
  assert.strictEqual(r.order_paid, '700000.00');
  assert.strictEqual(r.order_remaining, '300000.00');
  assert.strictEqual(db.state.ledger.length, 1);
  assert.strictEqual(db.state.ledger[0].credit, '700000.00');
  assert.strictEqual(db.state.ledger[0].source_type, 'payment');
  assert.strictEqual(db.state.ledger[0].order_id, 'O1'); // الارتباط بالطلب محفوظ
  assert.strictEqual(await core.readBalance(db.pool, 'C1', 'YER'), -70000000);
  assert.ok(db.state.audit.some((a) => a.action === 'PAYMENT_APPROVED'));
});
test('21) الضغط مرتين على اعتماد الدفع: الثانية ترفض ولا يُخصم المبلغ مرتين', async () => {
  const { db, pay, core } = load(paySeed());
  await pay.approvePayment('P1', 'U-ACC', { roles: ['accountant'] });
  await assert.rejects(pay.approvePayment('P1', 'U-ACC', { roles: ['accountant'] }), /معتمدة مسبقًا/);
  assert.strictEqual(db.state.ledger.length, 1);
  assert.strictEqual(await core.readBalance(db.pool, 'C1', 'YER'), -70000000);
});
test('اعتماد دفعة مرفوضة/ملغاة غير ممكن ولا يؤثر على الرصيد', async () => {
  for (const st of ['rejected', 'cancelled', 'reversed']) {
    const s = paySeed(); s.payments.P1.status = st;
    const { db, pay } = load(s);
    await assert.rejects(pay.approvePayment('P1', 'U-ACC', { roles: ['accountant'] }), /لا يمكن اعتماد/);
    assert.strictEqual(db.state.ledger.length, 0);
  }
});
test('9) دفع زائد 1,200,000 على 1,000,000: رصيد دائن 200,000 بعد الترحيل (لا يضيع الفرق)', async () => {
  const s = paySeed(); s.payments.P1.amount_transferred = '1200000.00'; s.orders.O1.total_amount = '1000000.00';
  s.items[0].quantity = '1000.00'; s.items[0].unit_price = '1000.00';
  const { db, pay, ful, core } = load(s);
  await pay.approvePayment('P1', 'U-ACC', { roles: ['accountant'] });
  await withTx(db, (c) => ful.postActualLoading(c, 'F1', 1000, 'U'));
  assert.strictEqual(await core.readBalance(db.pool, 'C1', 'YER'), -20000000);
});
test('10) دفعتان لنفس الطلب: كل واحدة بقيدها والمجموع صحيح', async () => {
  const s = paySeed(); s.orders.O1.total_amount = '1000000.00';
  s.payments.P2 = { id: 'P2', order_id: 'O1', status: 'under_review', amount_transferred: '300000.00', payment_currency: 'YER', reference_code: 'PAY-2026-000002' };
  const { db, pay, core } = load(s);
  await pay.approvePayment('P1', 'U-ACC', { roles: ['accountant'] });
  s.orders.O1.status = 'PAYMENT_APPROVED';
  const r2 = await pay.approvePayment('P2', 'U-ACC', { roles: ['accountant'] });
  assert.strictEqual(r2.order_paid, '1000000.00');
  assert.strictEqual(db.state.ledger.length, 2);
  assert.strictEqual(await core.readBalance(db.pool, 'C1', 'YER'), -100000000);
});
test('11-14) دفعات بالعملات الثلاث لا تختلط', async () => {
  const s = paySeed();
  s.payments.P2 = { id: 'P2', order_id: 'O1', status: 'under_review', amount_transferred: '1500.00', payment_currency: 'USD', reference_code: 'PAY-2026-000002' };
  s.payments.P3 = { id: 'P3', order_id: 'O1', status: 'under_review', amount_transferred: '800.00', payment_currency: 'SAR', reference_code: 'PAY-2026-000003' };
  const { db, pay, core } = load(s);
  for (const id of ['P1', 'P2', 'P3']) { db.state.orders.O1.status = 'PENDING_PAYMENT_REVIEW'; await pay.approvePayment(id, 'U-ACC', { roles: ['accountant'] }); }
  assert.deepStrictEqual(await core.getBalances(db.pool, 'C1'), { YER: '-700000.00', USD: '-1500.00', SAR: '-800.00' });
  // المدفوع على الطلب (YER) لا يتأثر بالدولار/الريال السعودي
  assert.strictEqual(db.state.orders.O1.paid_amount, '700000.00');
});
test('15) إلغاء (عكس) دفعة معتمدة: قيد معاكس يحفظ الأثر، الدفعة reversed، والعكس المزدوج آمن', async () => {
  const { db, pay, core } = load(paySeed());
  await pay.approvePayment('P1', 'U-ACC', { roles: ['accountant'] });
  await pay.reversePayment('P1', 'U-ACC', 'إيصال غير صحيح');
  const again = await pay.reversePayment('P1', 'U-ACC', 'إيصال غير صحيح');
  assert.strictEqual(again.already_reversed, true);
  assert.strictEqual(db.state.ledger.length, 2);
  assert.strictEqual(db.state.ledger[1].reversal_of_id, db.state.ledger[0].id);
  assert.strictEqual(await core.readBalance(db.pool, 'C1', 'YER'), 0);
  assert.strictEqual(db.state.payments.P1.status, 'reversed');
  assert.ok(db.state.audit.some((a) => a.action === 'PAYMENT_REVERSED' && a.reason === 'إيصال غير صحيح'));
  await assert.rejects(pay.reversePayment('P1', 'U', ''), /سبب/);
});
test('عكس دفعة غير معتمدة مرفوض', async () => {
  const { pay } = load(paySeed());
  await assert.rejects(pay.reversePayment('P1', 'U', 'سبب'), /المعتمدة فقط/);
});
test('فصل المهام: من سعّر الطلب لا يعتمد دفعته (إلا admin)', async () => {
  const { db, pay } = load(paySeed());
  await assert.rejects(pay.approvePayment('P1', 'U-SALES', { roles: ['sales'] }), /فصل المهام/);
  assert.strictEqual(db.state.ledger.length, 0);
  const ok = await pay.approvePayment('P1', 'U-SALES', { roles: ['admin'] });
  assert.strictEqual(ok.status, 'approved');
});
test('دفعة محمّلة بعد الترحيل: الدفعة لا تعيد حالة الطلب إلى الوراء', async () => {
  const s = paySeed(); s.orders.O1.status = 'LOADED';
  const { db, pay } = load(s);
  const r = await pay.approvePayment('P1', 'U-ACC', { roles: ['accountant'] });
  assert.strictEqual(r.order_status, 'LOADED');
  assert.strictEqual(db.state.orders.O1.status, 'LOADED');
  assert.strictEqual(db.state.ledger.length, 1);
});
