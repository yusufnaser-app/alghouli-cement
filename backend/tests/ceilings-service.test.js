const test = require('node:test');
const assert = require('node:assert');
const { install, clearModules } = require('./helpers');

const makeClient = (rulesRows, usageRows) => ({
  query: async (sql) => {
    if (/FROM order_ceilings WHERE is_active/.test(sql)) return { rows: rulesRows };
    if (/SUM\(oi\.quantity\)/.test(sql)) return { rows: [usageRows.shift() || { bags: 0, amount: 0 }] };
    return { rows: [] };
  },
});

const load = () => {
  install({ pool: {}, query: async () => ({ rows: [] }) });
  clearModules('src/modules/ceilings/ceilings.service.js');
  return require('../src/modules/ceilings/ceilings.service');
};

test('لا سقوف فعّالة ← لا تجاوز أبدًا (سلوك افتراضي آمن)', async () => {
  const { checkOrderCeilings } = load();
  const client = makeClient([], []);
  const r = await checkOrderCeilings(client, { customerId: 'c1', sourceId: 's1', requestedBags: 999999 });
  assert.strictEqual(r.exceeded, false);
});

test('سقف يومي بالكيس على مصنع معيّن: يتجاوز عند تراكم الاستهلاك', async () => {
  const { checkOrderCeilings } = load();
  const rule = { id: 'r1', name_ar: 'يومي عمران', period: 'daily', customer_id: null, source_id: 's1', category_id: null, max_bags: 1000, max_amount: null };
  const client = makeClient([rule], [{ bags: 800, amount: 0 }]);
  const r = await checkOrderCeilings(client, { customerId: 'c1', sourceId: 's1', requestedBags: 300 });
  assert.strictEqual(r.exceeded, true);
  assert.strictEqual(r.results[0].checks[0].after, 1100);
});

test('سقف مصنع آخر لا يُطبَّق على طلب من مصنع مختلف', async () => {
  const { checkOrderCeilings } = load();
  const rule = { id: 'r1', name_ar: 'يومي عمران', period: 'daily', customer_id: null, source_id: 'AMR', category_id: null, max_bags: 10, max_amount: null };
  const client = makeClient([rule], []);
  const r = await checkOrderCeilings(client, { customerId: 'c1', sourceId: 'BAJ', requestedBags: 999999 });
  assert.strictEqual(r.exceeded, false);
});

test('requestOverride: يُدرج طلب الموافقة الاستثنائية', async () => {
  const { requestOverride } = load();
  let inserted = null;
  const client = { query: async (sql, params) => { inserted = { sql, params }; return { rows: [{ id: 'ov1', status: 'PENDING' }] }; } };
  const r = await requestOverride(client, { customerId: 'c1', ceilingId: 'r1', requestedBags: 500, reason: 'عميل مهم' });
  assert.strictEqual(r.id, 'ov1');
  assert.strictEqual(inserted.params[0], 'c1');
});
