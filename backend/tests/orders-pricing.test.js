const test = require('node:test');
const assert = require('node:assert');
const { install, clearModules } = require('./helpers');

// عميل معاملة وهمي عام: يوجّه الاستعلامات حسب نمط نصي بسيط
const makeClient = (handlers) => {
  const log = [];
  return {
    log,
    release: () => {},
    query: async (sql, params = []) => {
      const head = sql.trim().split(/\s+/)[0];
      log.push(head === 'SAVEPOINT' || head === 'ROLLBACK' || head === 'RELEASE' ? sql.trim() : sql.trim().slice(0, 40));
      for (const [pattern, fn] of handlers) {
        if (pattern.test(sql)) return fn(params, sql);
      }
      return { rows: [] };
    },
  };
};

const load = () => {
  install({ pool: { connect: async () => currentClient }, query: async () => ({ rows: [] }) });
  clearModules('src/modules/orders/orders.service.js', 'src/modules/ceilings/ceilings.service.js', 'src/modules/customers/ledger.service.js');
  return require('../src/modules/orders/orders.service');
};

let currentClient;

test('setOrderPricing: يحسب الإجمالي = مجموع (سعر×كمية - خصم) + النقل، ويغيّر الحالة', async () => {
  currentClient = makeClient([
    [/SELECT \* FROM orders WHERE id = \$1 FOR UPDATE/, () => ({ rows: [{ id: 'o1', status: 'PENDING_PRICING', order_number: 'GHO-1', customer_id: 'c1' }] })],
    [/SELECT \* FROM order_items WHERE order_id/, () => ({ rows: [
      { id: 'i1', quantity: 100, source_id: 's1' },
      { id: 'i2', quantity: 50, source_id: 's1' },
    ] })],
    [/FROM order_ceilings WHERE is_active/, () => ({ rows: [] })],
    [/FROM customers c JOIN users u/, () => ({ rows: [{ user_id: 'u1' }] })],
  ]);
  const svc = load();
  const r = await svc.setOrderPricing('o1', 'staff1', {
    items: [
      { orderItemId: 'i1', unitPrice: 5500, discount: 0 },
      { orderItemId: 'i2', unitPrice: 5500, discount: 1000 },
    ],
    transportAmount: 15000,
  });
  // 100*5500 + (50*5500 - 1000) + 15000 = 550000 + 274000 + 15000
  assert.strictEqual(r.total_amount, 839000);
  assert.strictEqual(r.status, 'PENDING_PAYMENT_METHOD');
});

test('setOrderPricing: يرفض طلبًا ليس بحالة PENDING_PRICING', async () => {
  currentClient = makeClient([
    [/SELECT \* FROM orders WHERE id = \$1 FOR UPDATE/, () => ({ rows: [{ id: 'o1', status: 'PENDING_PAYMENT' }] })],
  ]);
  const svc = load();
  await assert.rejects(() => svc.setOrderPricing('o1', 'staff1', { items: [] }), (e) => e.status === 400);
});

test('setOrderPricing: سعر مفقود لعنصر يوقف العملية (ROLLBACK)', async () => {
  currentClient = makeClient([
    [/SELECT \* FROM orders WHERE id = \$1 FOR UPDATE/, () => ({ rows: [{ id: 'o1', status: 'PENDING_PRICING', customer_id: 'c1' }] })],
    [/SELECT \* FROM order_items WHERE order_id/, () => ({ rows: [{ id: 'i1', quantity: 10, source_id: 's1' }] })],
  ]);
  const svc = load();
  await assert.rejects(() => svc.setOrderPricing('o1', 'staff1', { items: [] }));
  assert.ok(currentClient.log.includes('ROLLBACK'));
});

test('setOrderPricing: فشل إشعار العميل لا يوقف التسعير', async () => {
  currentClient = makeClient([
    [/SELECT \* FROM orders WHERE id = \$1 FOR UPDATE/, () => ({ rows: [{ id: 'o1', status: 'PENDING_PRICING', order_number: 'GHO-1', customer_id: 'c1' }] })],
    [/SELECT \* FROM order_items WHERE order_id/, () => ({ rows: [{ id: 'i1', quantity: 10, source_id: 's1' }] })],
    [/FROM order_ceilings WHERE is_active/, () => ({ rows: [] })],
    [/FROM customers c JOIN users u/, () => { throw new Error('relation notifications does not exist'); }],
  ]);
  const svc = load();
  const r = await svc.setOrderPricing('o1', 'staff1', { items: [{ orderItemId: 'i1', unitPrice: 100 }] });
  assert.strictEqual(r.total_amount, 1000);
  assert.ok(currentClient.log.includes('ROLLBACK TO SAVEPOINT price_notify_sp'));
  assert.ok(!currentClient.log.includes('ROLLBACK')); // لم تُلغَ المعاملة كلها
});

test('choosePaymentMethod: نقدًا = paid_amount_now بكامل المبلغ وحالة PENDING_PAYMENT', async () => {
  currentClient = makeClient([
    [/SELECT id FROM customers WHERE user_id/, () => ({ rows: [{ id: 'c1' }] })],
    [/SELECT \* FROM orders WHERE id = \$1 AND customer_id/, () => ({ rows: [{ id: 'o1', status: 'PENDING_PAYMENT_METHOD', total_amount: '5000', order_number: 'GHO-1' }] })],
  ]);
  const svc = load();
  const r = await svc.choosePaymentMethod('o1', 'u1', { paymentTerms: 'cash' });
  assert.strictEqual(r.status, 'PENDING_PAYMENT');
  assert.strictEqual(r.paid_amount_now, 5000);
  assert.strictEqual(r.credit_amount, 0);
});

test('choosePaymentMethod: آجل يفحص الحد الائتماني ويرفض عند التجاوز', async () => {
  currentClient = makeClient([
    [/SELECT id FROM customers WHERE user_id/, () => ({ rows: [{ id: 'c1' }] })],
    [/SELECT \* FROM orders WHERE id = \$1 AND customer_id/, () => ({ rows: [{ id: 'o1', status: 'PENDING_PAYMENT_METHOD', total_amount: '100000' }] })],
    [/SELECT current_balance, credit_limit FROM customers/, () => ({ rows: [{ current_balance: 90000, credit_limit: 100000 }] })],
    [/SELECT COALESCE\(SUM\(credit_amount\)/, () => ({ rows: [{ total: 0 }] })],
  ]);
  const svc = load();
  await assert.rejects(() => svc.choosePaymentMethod('o1', 'u1', { paymentTerms: 'credit' }), (e) => e.code === 'CREDIT_LIMIT_EXCEEDED');
  assert.ok(currentClient.log.includes('ROLLBACK'));
});

test('choosePaymentMethod: جزئي يحسب المتبقي كائتمان', async () => {
  currentClient = makeClient([
    [/SELECT id FROM customers WHERE user_id/, () => ({ rows: [{ id: 'c1' }] })],
    [/SELECT \* FROM orders WHERE id = \$1 AND customer_id/, () => ({ rows: [{ id: 'o1', status: 'PENDING_PAYMENT_METHOD', total_amount: '10000', order_number: 'GHO-1' }] })],
    [/SELECT current_balance, credit_limit FROM customers/, () => ({ rows: [{ current_balance: 0, credit_limit: 0 }] })], // credit_limit=0 يعني غير محدود
    [/SELECT COALESCE\(SUM\(credit_amount\)/, () => ({ rows: [{ total: 0 }] })],
    [/SELECT current_balance FROM customers WHERE id = \$1 FOR UPDATE/, () => ({ rows: [{ current_balance: 0 }] })],
  ]);
  const svc = load();
  const r = await svc.choosePaymentMethod('o1', 'u1', { paymentTerms: 'partial', paidAmountNow: 4000 });
  assert.strictEqual(r.paid_amount_now, 4000);
  assert.strictEqual(r.credit_amount, 6000);
  assert.strictEqual(r.status, 'PENDING_ADMIN_APPROVAL');
});

test('choosePaymentMethod: يرفض مبلغًا جزئيًا أكبر من الإجمالي', async () => {
  currentClient = makeClient([
    [/SELECT id FROM customers WHERE user_id/, () => ({ rows: [{ id: 'c1' }] })],
    [/SELECT \* FROM orders WHERE id = \$1 AND customer_id/, () => ({ rows: [{ id: 'o1', status: 'PENDING_PAYMENT_METHOD', total_amount: '1000' }] })],
  ]);
  const svc = load();
  await assert.rejects(() => svc.choosePaymentMethod('o1', 'u1', { paymentTerms: 'partial', paidAmountNow: 5000 }), (e) => e.status === 400);
});

test('choosePaymentMethod: يرفض طلبًا ليس بحالة PENDING_PAYMENT_METHOD', async () => {
  currentClient = makeClient([
    [/SELECT id FROM customers WHERE user_id/, () => ({ rows: [{ id: 'c1' }] })],
    [/SELECT \* FROM orders WHERE id = \$1 AND customer_id/, () => ({ rows: [{ id: 'o1', status: 'PENDING_PRICING' }] })],
  ]);
  const svc = load();
  await assert.rejects(() => svc.choosePaymentMethod('o1', 'u1', { paymentTerms: 'cash' }), (e) => e.status === 400);
});
