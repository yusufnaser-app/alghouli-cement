const test = require('node:test');
const assert = require('node:assert');
const { install, clearModules } = require('./helpers');

// طابور وهمي في الذاكرة يحاكي UNIQUE(idempotency_key) و ON CONFLICT DO NOTHING
const makeFakePool = () => {
  const rows = new Map();
  let seq = 0;
  return {
    rows,
    query: async (sql, params = []) => {
      if (/INSERT INTO accounting_sync_queue/.test(sql)) {
        const key = params[5];
        if (rows.has(key)) return { rows: [] };
        const row = { id: `id-${++seq}`, operation: params[1], entity_type: params[2], entity_id: params[3],
          payload: params[4], idempotency_key: key, status: 'PENDING', retry_count: 0, max_retries: 5 };
        rows.set(key, row);
        return { rows: [row] };
      }
      if (/SELECT \* FROM accounting_sync_queue WHERE idempotency_key/.test(sql)) {
        return { rows: [rows.get(params[0])].filter(Boolean) };
      }
      if (/SET status = 'SYNCING'/.test(sql)) {
        for (const r of rows.values()) if (r.id === params[0]) r.status = 'SYNCING';
        return { rows: [] };
      }
      if (/SET status = \$1, retry_count = \$2/.test(sql)) {
        for (const r of rows.values()) if (r.id === params[3]) { r.status = params[0]; r.retry_count = params[1]; r.sync_error = params[2]; }
        return { rows: [] };
      }
      if (/SET status = 'SYNCED'/.test(sql)) {
        for (const r of rows.values()) if (r.id === params[1]) r.status = 'SYNCED';
        return { rows: [] };
      }
      throw new Error('استعلام غير متوقع: ' + sql.slice(0, 60));
    },
  };
};

const load = () => {
  const pool = makeFakePool();
  install({ pool, query: pool.query });
  clearModules('src/modules/accounting/accounting-integration.service.js');
  return { pool, svc: require('../src/modules/accounting/accounting-integration.service') };
};

const args = (key) => ({
  operation: 'POST_PAYMENT', entityType: 'payment', entityId: 'e1', payload: { amount: 500000 }, idempotencyKey: key,
});

test('منع التكرار: نفس idempotency_key مرتين = صف واحد فقط', async () => {
  const { pool, svc } = load();
  const a = await svc.enqueueSync(args('ALGH-PAY-2026-000781'));
  const b = await svc.enqueueSync(args('ALGH-PAY-2026-000781'));
  assert.strictEqual(pool.rows.size, 1);
  assert.strictEqual(a.id, b.id);
});

test('مفتاحان مختلفان = صفان', async () => {
  const { pool, svc } = load();
  await svc.enqueueSync(args('K1'));
  await svc.enqueueSync(args('K2'));
  assert.strictEqual(pool.rows.size, 2);
});

test('enqueueSync يرفض البيانات الناقصة (بلا مفتاح)', async () => {
  const { svc } = load();
  await assert.rejects(() => svc.enqueueSync({ ...args(''), idempotencyKey: '' }));
});

test('بدون ربط فعلي: العملية لا تصير SYNCED أبدًا ولا يُختلق مرجع محاسبي', async () => {
  const { pool, svc } = load();
  const item = await svc.enqueueSync(args('K3'));
  const res = await svc.processQueueItem(item);
  assert.strictEqual(res.success, false);
  const row = pool.rows.get('K3');
  assert.strictEqual(row.status, 'RETRYING');
  assert.strictEqual(row.retry_count, 1);
});

test('بعد تجاوز الحد الأقصى للمحاولات تصير FAILED', async () => {
  const { pool, svc } = load();
  const item = await svc.enqueueSync(args('K4'));
  for (let i = 0; i < 5; i++) await svc.processQueueItem(pool.rows.get('K4'));
  assert.strictEqual(pool.rows.get('K4').status, 'FAILED');
  assert.strictEqual(pool.rows.get('K4').retry_count, 5);
  assert.ok(item);
});
