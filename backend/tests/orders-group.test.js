const test = require('node:test');
const assert = require('node:assert');
const { install, clearModules } = require('./helpers');

const makeClient = (handlers) => {
  const log = [];
  return {
    log,
    release: () => {},
    query: async (sql, params = []) => {
      log.push(sql.trim().slice(0, 45));
      for (const [pattern, fn] of handlers) if (pattern.test(sql)) return fn(params);
      return { rows: [] };
    },
  };
};

let currentClient;
const load = () => {
  install({
    pool: { connect: async () => currentClient },
    // generateOrderNumber يستخدم query على مستوى pool مباشرة (ليس عبر client المعاملة)
    query: async (sql) => (/SELECT COUNT\(\*\) FROM orders WHERE order_number/.test(sql) ? { rows: [{ count: '0' }] } : { rows: [] }),
  });
  clearModules('src/modules/orders/orders.service.js', 'src/modules/ceilings/ceilings.service.js');
  return require('../src/modules/orders/orders.service');
};

const baseHandlers = () => [
  [/SELECT id, customer_type, governorate, area FROM customers WHERE user_id/, () => ({ rows: [{ id: 'c1', customer_type: 'trader', governorate: 'صنعاء', area: 'السبعين' }] })],
  [/SELECT p\.id, p\.source_id/, () => ({ rows: [{ id: 'p1', source_id: 's1', packaging_type: 'bagged', name_ar: 'عمران 42.5', unit: 'bag', available_qty: 100000 }] })],
  [/FROM order_ceilings WHERE is_active/, () => ({ rows: [] })],
  [/SELECT id FROM customer_addresses WHERE customer_id = \$1 AND is_default/, () => ({ rows: [{ id: 'addr1' }] })],
  [/SELECT COUNT\(\*\) FROM order_groups/, () => ({ rows: [{ count: '0' }] })],
  [/INSERT INTO order_groups/, () => ({ rows: [{ id: 'g1' }] })],
  [/pg_advisory_xact_lock/, () => ({ rows: [] })],
  [/MAX\(CAST\(SUBSTRING\(order_number/, () => ({ rows: [{ max_num: 0 }] })],
  [/INSERT INTO orders/, (p) => ({ rows: [{ id: `o-${p[5]}`, order_number: 'GHO-2026-000001', status: 'PENDING_PRICING', created_at: new Date() }] })],
];

test('الطلب الجماعي: عميل فرد (غير تاجر) يُرفض', async () => {
  currentClient = makeClient([
    [/SELECT id, customer_type/, () => ({ rows: [{ id: 'c1', customer_type: 'individual' }] })],
  ]);
  const svc = load();
  await assert.rejects(
    () => svc.createGroupOrder('u1', { productId: 'p1', trucks: [{ truckPlate: 'A', driverName: 'أحمد', quantity: 100 }, { truckPlate: 'B', driverName: 'محمد', quantity: 100 }] }),
    (e) => e.status === 403
  );
});

test('الطلب الجماعي: أقل من قاطرتين يُرفض', async () => {
  currentClient = makeClient(baseHandlers());
  const svc = load();
  await assert.rejects(
    () => svc.createGroupOrder('u1', { productId: 'p1', trucks: [{ truckPlate: 'A', driverName: 'أحمد', quantity: 100 }] }),
    (e) => e.status === 400
  );
});

test('الطلب الجماعي: ينشئ طلبًا مستقلًا لكل قاطرة ويربطها برقم مجموعة واحد', async () => {
  currentClient = makeClient(baseHandlers());
  const svc = load();
  const r = await svc.createGroupOrder('u1', {
    productId: 'p1',
    trucks: [
      { truckPlate: '12345', driverName: 'أحمد', quantity: 1000 },
      { truckPlate: '67890', driverName: 'محمد', quantity: 1000 },
      { truckPlate: '24680', driverName: 'علي', quantity: 500 },
    ],
  });
  assert.strictEqual(r.groupNumber, 'GR-2026-000001');
  assert.strictEqual(r.orders.length, 3);
  assert.ok(currentClient.log.includes('COMMIT'));
  assert.ok(!currentClient.log.includes('ROLLBACK'));
});

test('الطلب الجماعي: كمية غير صحيحة لقاطرة واحدة تُلغي المجموعة كاملة (ROLLBACK)', async () => {
  currentClient = makeClient(baseHandlers());
  const svc = load();
  await assert.rejects(() => svc.createGroupOrder('u1', {
    productId: 'p1',
    trucks: [
      { truckPlate: '12345', driverName: 'أحمد', quantity: 1000 },
      { truckPlate: '67890', driverName: 'محمد', quantity: -5 },
    ],
  }));
  assert.ok(currentClient.log.includes('ROLLBACK'));
});

test('الطلب الجماعي: مخزون غير كافٍ لإجمالي الكمية يُرفض قبل إنشاء أي طلب', async () => {
  currentClient = makeClient([
    ...baseHandlers().filter((h) => !/p\\\.id, p\\\.source_id/.test(h[0].source)),
    [/SELECT p\.id, p\.source_id/, () => ({ rows: [{ id: 'p1', source_id: 's1', packaging_type: 'bagged', name_ar: 'عمران', unit: 'bag', available_qty: 500 }] })],
  ]);
  const svc = load();
  await assert.rejects(() => svc.createGroupOrder('u1', {
    productId: 'p1',
    trucks: [{ truckPlate: 'A', driverName: 'أحمد', quantity: 300 }, { truckPlate: 'B', driverName: 'محمد', quantity: 300 }],
  }), (e) => e.code === 'INSUFFICIENT_STOCK');
});

test('getGroupOrder: يرفض مجموعة لا تخص العميل', async () => {
  const q = async (sql) => (/FROM order_groups WHERE id/.test(sql) ? { rows: [] } : { rows: [] });
  install({ pool: {}, query: q });
  clearModules('src/modules/orders/orders.service.js');
  const svc = require('../src/modules/orders/orders.service');
  await assert.rejects(() => svc.getGroupOrder('g1', 'c1'), (e) => e.status === 404);
});
