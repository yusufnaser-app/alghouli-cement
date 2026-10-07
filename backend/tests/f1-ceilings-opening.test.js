'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { install, clearModules } = require('./helpers');

const norm = (s) => s.replace(/\s+/g, ' ').trim();
const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

// عميل وهمي: handlers = [[regex, (sql,params)=>result]] بالترتيب؛ يسجّل كل شيء
const mk = (handlers = []) => {
  const log = [];
  return {
    log,
    query: async (sql, params = []) => {
      const s = norm(sql); log.push({ s, params });
      for (const [re, fn] of handlers) if (re.test(s)) return fn(s, params);
      return { rows: [], rowCount: 0 };
    },
    release() {},
  };
};
const loadCeil = (globalQuery) => {
  const calls = [];
  const gq = globalQuery || (async (sql, params) => { const s = norm(sql); calls.push({ s, params }); return { rows: /^INSERT/.test(s) ? [{ id: 'new' }] : [] }; });
  install({ pool: {}, query: gq });
  clearModules('src/modules/ceilings/ceilings.service.js');
  const svc = require('../src/modules/ceilings/ceilings.service');
  svc.__calls = calls;
  return svc;
};
const R = (over = {}) => ({ id: 'r1', name_ar: 'يومي', period: 'daily', customer_id: null, source_id: null, category_id: null,
  max_bags: null, max_amount: null, max_orders: null, max_vehicles: null, ...over });
const rulesAnd = (rules, usage = {}, action = 'reject', extra = []) => mk([
  [/^SELECT ceiling_action FROM customers/, () => ({ rows: [{ ceiling_action: action }] })],
  [/^SELECT \* FROM order_ceilings WHERE is_active/, () => ({ rows: rules })],
  [/^SELECT COALESCE\(SUM\(oi\.quantity/, () => ({ rows: [{ bags: usage.bags || 0, amount: usage.amount || 0, orders_count: usage.orders || 0 }] })],
  [/^SELECT DISTINCT COALESCE\(x\.trader_vehicle_id/, () => ({ rows: (usage.vehicles || []).map((v) => ({ vid: v })) })],
  ...extra,
]);
const ctx = (over = {}) => ({ customerId: 'c1', entries: [{ sourceId: 's1', requestedBags: 300, requestedAmount: 0 }], requestedOrders: 1, requestedVehicleIds: [], ...over });

// ───── الحساب ─────
test('F1-1) checkOne: حدّا الطلبات والقاطرات + available/excess', () => {
  clearModules('src/modules/ceilings/ceilings.calc.js');
  const { checkOne } = require('../src/modules/ceilings/ceilings.calc');
  const r = checkOne(R({ max_orders: 3, max_vehicles: 2 }), { requestedOrders: 2, usedOrders: 2, requestedVehicles: 1, usedVehicles: 2 });
  const o = r.checks.find((c) => c.type === 'orders'); const v = r.checks.find((c) => c.type === 'vehicles');
  assert.deepStrictEqual([o.after, o.exceeded, o.available, o.excess], [4, true, 1, 1]);
  assert.deepStrictEqual([v.after, v.exceeded, v.available, v.excess], [3, true, 0, 1]);
  assert.strictEqual(r.exceeded, true);
});

test('F1-2) داخل الحد → WITHIN_LIMIT ولا استثناء', async () => {
  const svc = loadCeil();
  const r = await svc.enforceOrderCeilings(rulesAnd([R({ max_bags: 1000 })], { bags: 100 }), ctx());
  assert.deepStrictEqual([r.status, r.overrideIds], ['WITHIN_LIMIT', []]);
});

test('F1-3) تجاوز + reject → CEILING_EXCEEDED/400 مع المتاح والتجاوز', async () => {
  const svc = loadCeil();
  await assert.rejects(svc.enforceOrderCeilings(rulesAnd([R({ max_bags: 1000 })], { bags: 800 }), ctx()), (e) => {
    const c = e.data[0].checks[0];
    return e.code === 'CEILING_EXCEEDED' && e.status === 400 && e.ceiling_status === 'LIMIT_EXCEEDED'
      && c.available === 200 && c.excess === 100 && c.used === 800;
  });
});

test('F1-4) حد عدد الطلبات اليومي (يُحسب مرة واحدة حتى مع أكثر من مصنع) والقاطرات الجديدة فقط', async () => {
  const svc = loadCeil();
  const entries = [{ sourceId: 's1', requestedBags: 10 }, { sourceId: 's2', requestedBags: 10 }];
  await assert.rejects(svc.enforceOrderCeilings(rulesAnd([R({ max_orders: 3 })], { orders: 3 }), ctx({ entries })),
    (e) => e.data.length === 1 && e.data[0].checks[0].type === 'orders' && e.data[0].checks[0].after === 4);
  // قاطرات: مستخدمة A,B والطلب يحمل B,C → الجديدة 1 فقط → 3 > 2
  await assert.rejects(svc.enforceOrderCeilings(rulesAnd([R({ max_vehicles: 2 })], { vehicles: ['A', 'B'] }), ctx({ requestedVehicleIds: ['B', 'C'] })),
    (e) => { const c = e.data[0].checks[0]; return c.type === 'vehicles' && c.after === 3 && c.used === 2; });
  // نفس القاطرة المستخدمة → لا تُحسب جديدة → داخل الحد
  const ok = await svc.enforceOrderCeilings(rulesAnd([R({ max_vehicles: 2 })], { vehicles: ['A', 'B'] }), ctx({ requestedVehicleIds: ['B'] }));
  assert.strictEqual(ok.status, 'WITHIN_LIMIT');
});

test('F1-5) request_approval بلا طلب سابق → PENDING_EXCEPTION_APPROVAL/409، والطلب التلقائي يُكتب بعد ROLLBACK بالاتصال العام', async () => {
  const svc = loadCeil();
  const client = rulesAnd([R({ max_bags: 1000 })], { bags: 800 }, 'request_approval');
  let err;
  try { await svc.enforceOrderCeilings(client, ctx()); } catch (e) { err = e; }
  assert.strictEqual(err.code, 'PENDING_EXCEPTION_APPROVAL');
  assert.strictEqual(err.status, 409);
  assert.ok(!client.log.some((l) => /^INSERT INTO ceiling_overrides/.test(l.s)), 'لا كتابة داخل المعاملة (ستتراجع)');
  await svc.runAfterRollback(err);
  const ins = svc.__calls.filter((c) => /^INSERT INTO ceiling_overrides/.test(c.s));
  assert.strictEqual(ins.length, 1);
  assert.strictEqual(ins[0].params[0], 'c1');
  assert.strictEqual(ins[0].params[2], 300);   // requested_bags
});

test('F1-6) طلب PENDING قائم → PENDING_EXCEPTION_APPROVAL بلا طلب جديد', async () => {
  const svc = loadCeil();
  const client = rulesAnd([R({ max_bags: 1000 })], { bags: 800 }, 'request_approval', [
    [/^SELECT id FROM ceiling_overrides WHERE customer_id = \$1 AND status = 'PENDING'/, () => ({ rows: [{ id: 'p1' }] })]]);
  let err; try { await svc.enforceOrderCeilings(client, ctx()); } catch (e) { err = e; }
  assert.strictEqual(err.code, 'PENDING_EXCEPTION_APPROVAL');
  assert.strictEqual(err.afterRollback, undefined);
});

test('F1-7) رفض الإدارة في الفترة الحالية → REJECTED_EXCEPTION', async () => {
  const svc = loadCeil();
  const client = rulesAnd([R({ max_bags: 1000 })], { bags: 800 }, 'request_approval', [
    [/status = 'REJECTED' AND decided_at >= \$2/, () => ({ rows: [{ id: 'x1' }] })]]);
  await assert.rejects(svc.enforceOrderCeilings(client, ctx()), { code: 'REJECTED_EXCEPTION', status: 409 });
});

test('F1-8) استثناء معتمد غير مستهلك يغطي التجاوز → APPROVED_EXCEPTION (مع قفل الصف)', async () => {
  const svc = loadCeil();
  const ov = { id: 'o1', ceiling_id: 'r1', requested_bags: '500', requested_amount: null };
  const client = rulesAnd([R({ max_bags: 1000 })], { bags: 800 }, 'reject', [
    [/^SELECT \* FROM ceiling_overrides WHERE customer_id = \$1 AND status = 'APPROVED' AND used_at IS NULL/, () => ({ rows: [ov] })]]);
  const r = await svc.enforceOrderCeilings(client, ctx());
  assert.deepStrictEqual([r.status, r.overrideIds], ['APPROVED_EXCEPTION', ['o1']]);
  assert.ok(client.log.some((l) => /status = 'APPROVED' AND used_at IS NULL.*FOR UPDATE$/.test(l.s)));
});

test('F1-9) استثناء معتمد بكمية أقل من المطلوبة لا يغطي → يعود لإجراء الحساب', async () => {
  const svc = loadCeil();
  const ov = { id: 'o1', ceiling_id: 'r1', requested_bags: '100', requested_amount: null };   // الطلب 300
  const client = rulesAnd([R({ max_bags: 1000 })], { bags: 800 }, 'reject', [
    [/^SELECT \* FROM ceiling_overrides WHERE customer_id = \$1 AND status = 'APPROVED'/, () => ({ rows: [ov] })]]);
  await assert.rejects(svc.enforceOrderCeilings(client, ctx()), { code: 'CEILING_EXCEEDED' });
});

test('F1-10) فشل الفحص نفسه → CEILING_CHECK_FAILED/503 (فشل مغلق، لا تمرير)', async () => {
  const svc = loadCeil();
  const client = mk([[/order_ceilings/, () => { throw new Error('relation does not exist'); }]]);
  client.query = (orig => async (s, p) => (/FROM order_ceilings/.test(s) ? Promise.reject(new Error('boom')) : orig(s, p)))(client.query);
  const orig = console.error; console.error = () => {};
  try { await assert.rejects(svc.enforceOrderCeilings(client, ctx()), { code: 'CEILING_CHECK_FAILED', status: 503 }); }
  finally { console.error = orig; }
});

test('F1-11) consumeOverrides: يستهلك بحارس + تدقيق + ceiling_status؛ استهلاك مسبق → OVERRIDE_ALREADY_USED', async () => {
  const svc = loadCeil();
  const good = mk([[/^UPDATE ceiling_overrides SET used_at = NOW\(\)/, () => ({ rows: [{ id: 'o1' }] })]]);
  await svc.consumeOverrides(good, ['o1'], 'ord1', 'u1');
  assert.ok(good.log.some((l) => /WHERE id = ANY\(\$1::uuid\[\]\) AND status = 'APPROVED' AND used_at IS NULL RETURNING id/.test(l.s)));
  assert.ok(good.log.some((l) => /^UPDATE orders SET ceiling_status = 'APPROVED_EXCEPTION'/.test(l.s)));
  assert.ok(good.log.some((l) => /^INSERT INTO audit_logs/.test(l.s) && l.params[1] === 'CEILING_EXCEPTION_USED'));
  const used = mk([[/^UPDATE ceiling_overrides SET used_at/, () => ({ rows: [] })]]);
  await assert.rejects(svc.consumeOverrides(used, ['o1'], 'ord1', 'u1'), { code: 'OVERRIDE_ALREADY_USED' });
  await svc.consumeOverrides(mk(), [], 'ord1', 'u1');  // لا شيء → لا خطأ
});

// ───── التدقيق ─────
const loadCeilTx = (client) => {
  install({ pool: { connect: async () => client }, query: async () => ({ rows: [] }) });
  clearModules('src/modules/ceilings/ceilings.service.js');
  return require('../src/modules/ceilings/ceilings.service');
};
const auditOf = (c, action) => c.log.find((l) => /^INSERT INTO audit_logs/.test(l.s) && l.params[1] === action);

test('F1-12) createRule/updateRule/setCustomerCeilingAction/decideOverride تكتب audit_logs داخل المعاملة مع القيم القديمة/الجديدة والسبب', async () => {
  const oldRow = { id: 'r1', max_bags: '1000' }; const newRow = { id: 'r1', max_bags: '2000' };
  let c = mk([[/^INSERT INTO order_ceilings/, () => ({ rows: [{ id: 'r1', max_bags: '1000' }] })]]);
  await loadCeilTx(c).createRule({ nameAr: 'x', period: 'daily', maxBags: 1000, reason: 'سبب إنشاء' }, 'u1');
  assert.deepStrictEqual(c.log.map((l) => l.s).filter((s) => /^(BEGIN|COMMIT)/.test(s)), ['BEGIN', 'COMMIT']);
  assert.strictEqual(auditOf(c, 'CEILING_RULE_CREATED').params[6], 'سبب إنشاء');

  c = mk([[/^SELECT \* FROM order_ceilings WHERE id = \$1 FOR UPDATE/, () => ({ rows: [oldRow] })], [/^UPDATE order_ceilings/, () => ({ rows: [newRow] })]]);
  await loadCeilTx(c).updateRule('r1', { maxBags: 2000, reason: 'رفع السقف' }, 'u1');
  const a = auditOf(c, 'CEILING_RULE_UPDATED');
  assert.deepStrictEqual([JSON.parse(a.params[4]).max_bags, JSON.parse(a.params[5]).max_bags, a.params[6]], ['1000', '2000', 'رفع السقف']);

  c = mk([[/^SELECT id, ceiling_action FROM customers/, () => ({ rows: [{ id: 'c1', ceiling_action: 'reject' }] })]]);
  await loadCeilTx(c).setCustomerCeilingAction('c1', 'request_approval', 'u1', { reason: 'تاجر موثوق' });
  const b = auditOf(c, 'CEILING_ACTION_CHANGED');
  assert.deepStrictEqual([JSON.parse(b.params[4]).ceiling_action, JSON.parse(b.params[5]).ceiling_action], ['reject', 'request_approval']);

  c = mk([[/^UPDATE ceiling_overrides SET status/, () => ({ rows: [{ id: 'o1', status: 'APPROVED', customer_id: 'c1', ceiling_id: null }] })]]);
  await loadCeilTx(c).decideOverride('o1', true, 'u1', { reason: 'موافق' });
  assert.ok(auditOf(c, 'CEILING_OVERRIDE_APPROVED'));
});

test('F1-13) updateRule: سقف غير موجود → 404 وROLLBACK بلا كتابة تدقيق', async () => {
  const c = mk([[/^SELECT \* FROM order_ceilings WHERE id/, () => ({ rows: [] })]]);
  await assert.rejects(loadCeilTx(c).updateRule('zz', { maxBags: 5 }, 'u1'), { status: 404 });
  assert.ok(c.log.some((l) => l.s === 'ROLLBACK'));
  assert.ok(!auditOf(c, 'CEILING_RULE_UPDATED'));
});

// ───── رصيد السائق الافتتاحي ─────
const loadDriver = (client) => {
  install({ pool: { connect: async () => client, query: async () => ({ rows: [] }) }, query: async () => ({ rows: [] }) });
  clearModules('src/modules/drivers/driver-ledger.service.js', 'src/modules/accounting/ledger.core.js',
    'src/modules/accounting/accounting-integration.service.js', 'src/modules/audit/audit.service.js');
  return require('../src/modules/drivers/driver-ledger.service');
};
const driverClient = ({ type = 'institution_driver', owner = null, dup = false } = {}) => mk([
  [/^SELECT id, driver_type, owner_trader_id FROM drivers/, () => ({ rows: [{ id: 'd1', driver_type: type, owner_trader_id: owner }] })],
  [/^SELECT current_balance FROM drivers/, () => ({ rows: [{ current_balance: '0.00' }] })],
  [/^SELECT \* FROM driver_ledger WHERE idempotency_key/, () => ({ rows: dup ? [{ id: 'e0' }] : [] })],
  [/^INSERT INTO driver_ledger/, (s, p) => ({ rows: [{ id: 'e1', debit: p[4], credit: p[5] }] })],
  [/^INSERT INTO accounting_sync_queue/, () => ({ rows: [{ id: 'q1', status: 'PENDING' }] })],
]);

test('F1-14) رصيد سائق مؤسسة: debit + opening_balance + تدقيق + طابور PENDING بنفس المعاملة', async () => {
  const c = driverClient(); const svc = loadDriver(c);
  const r = await svc.setDriverOpeningBalance('d1', { amount: '50000', side: 'owed_to_driver', currency: 'YER', notes: 'افتتاح' }, 'u1');
  assert.strictEqual(r.sync_status, 'PENDING');
  const ins = c.log.find((l) => /^INSERT INTO driver_ledger/.test(l.s));
  assert.strictEqual(ins.params[2], 'opening_balance');
  assert.strictEqual(ins.params[4], '50000.00'); assert.strictEqual(ins.params[5], '0.00');
  assert.strictEqual(ins.params[12], 'opening:driver:d1:YER');
  assert.ok(auditOf(c, 'DRIVER_OPENING_BALANCE_SET'));
  const q = c.log.find((l) => /^INSERT INTO accounting_sync_queue/.test(l.s));
  assert.strictEqual(q.params[5], 'sync:opening:driver:d1:YER');
  assert.deepStrictEqual([c.log[0].s, c.log[c.log.length - 1].s], ['BEGIN', 'COMMIT']);
});

test('F1-15) owed_by_driver → credit (الرصيد ينقص)', async () => {
  const c = driverClient(); const svc = loadDriver(c);
  await svc.setDriverOpeningBalance('d1', { amount: 1000, side: 'owed_by_driver' }, 'u1');
  const ins = c.log.find((l) => /^INSERT INTO driver_ledger/.test(l.s));
  assert.deepStrictEqual([ins.params[4], ins.params[5]], ['0.00', '1000.00']);
});

test('F1-16) سائق تاجر (trader_driver أو له owner_trader_id) → 422 NOT_INSTITUTION_DRIVER بلا قيد', async () => {
  for (const o of [{ type: 'trader_driver' }, { owner: 't1' }]) {
    const c = driverClient(o);
    await assert.rejects(loadDriver(c).setDriverOpeningBalance('d1', { amount: 10, side: 'owed_to_driver' }, 'u1'), { code: 'NOT_INSTITUTION_DRIVER', status: 422 });
    assert.ok(!c.log.some((l) => /^INSERT INTO driver_ledger/.test(l.s)));
    assert.ok(c.log.some((l) => l.s === 'ROLLBACK'));
  }
});

test('F1-17) عملة غير الريال أو جانب/مبلغ غير صالح → رفض قبل أي قيد', async () => {
  const svc = loadDriver(driverClient());
  await assert.rejects(svc.setDriverOpeningBalance('d1', { amount: 10, side: 'owed_to_driver', currency: 'USD' }, 'u1'), { code: 'DRIVER_CURRENCY_YER_ONLY' });
  await assert.rejects(svc.setDriverOpeningBalance('d1', { amount: 10, side: 'debit' }, 'u1'), { code: 'INVALID_SIDE' });
  await assert.rejects(svc.setDriverOpeningBalance('d1', { amount: 0, side: 'owed_to_driver' }, 'u1'), { code: 'INVALID_AMOUNT' });
});

test('F1-18) رصيد افتتاحي ثانٍ لنفس السائق → 409 OPENING_EXISTS وROLLBACK بلا طابور', async () => {
  const c = driverClient({ dup: true }); const svc = loadDriver(c);
  await assert.rejects(svc.setDriverOpeningBalance('d1', { amount: 10, side: 'owed_to_driver' }, 'u1'), { code: 'OPENING_EXISTS', status: 409 });
  assert.ok(!c.log.some((l) => /^INSERT INTO accounting_sync_queue/.test(l.s)));
  assert.ok(!c.log.includes('COMMIT') && c.log.some((l) => l.s === 'ROLLBACK'));
});

test('F1-19) enqueueSync يستعمل client المعاملة إن مُرِّر (ذرّية) وidempotent', async () => {
  install({ pool: { query: async () => { throw new Error('يجب عدم استعمال pool'); } }, query: async () => ({ rows: [] }) });
  clearModules('src/modules/accounting/accounting-integration.service.js');
  const { enqueueSync } = require('../src/modules/accounting/accounting-integration.service');
  const c = mk([[/^INSERT INTO accounting_sync_queue/, () => ({ rows: [] })], [/^SELECT \* FROM accounting_sync_queue WHERE idempotency_key/, () => ({ rows: [{ id: 'old' }] })]]);
  const r = await enqueueSync({ client: c, operation: 'X', entityType: 'e', entityId: 'id', payload: {}, idempotencyKey: 'k' });
  assert.strictEqual(r.id, 'old');
  assert.strictEqual(c.log.length, 2);
});

// ───── ربط الطلبات ─────
test('F1-20) orders.service: الفحص إلزامي في الإنشاء الفردي والجماعي، بلا ابتلاع، مع استهلاك الاستثناء وrunAfterRollback', () => {
  const s = read('src/modules/orders/orders.service.js');
  assert.strictEqual((s.match(/ceilingsService\.enforceOrderCeilings\(/g) || []).length, 2);
  assert.strictEqual((s.match(/ceilingsService\.consumeOverrides\(/g) || []).length, 2);
  assert.strictEqual((s.match(/ceilingsService\.runAfterRollback\(err\)/g) || []).length, 2);
  assert.ok(!/تم تجاوز الفحص|\(تم تجاوزه\)/.test(s), 'لا ابتلاع لأخطاء الفحص');
  assert.ok(/ceilingsService\.failClosed\(ceilErr\)/.test(s));   // التسعير: فشل الفحص ⇒ رفض
  assert.ok(/it\.unit === 'ton' \? 20 : 1/.test(s));              // الطن = 20 كيسًا في فحص الإنشاء
});

test('F1-21) رصيد العميل الافتتاحي يُدرج PENDING في الطابور داخل نفس المعاملة', () => {
  const s = read('src/modules/customers/ledger.service.js');
  assert.ok(/enqueueSync\(\{\s*client, operation: 'POST_OPENING_BALANCE'/.test(s));
  assert.ok(/sync:opening:customer:/.test(s));
});

test('F1-22) m38: IF NOT EXISTS + فهرس السائق الجزئي + استبدال CHECK القديم + ceiling_action بقيد', () => {
  const s = read('migrations/m38.js');
  assert.ok(/ceiling_action VARCHAR\(20\) NOT NULL DEFAULT 'reject'/.test(s) && /request_approval/.test(s));
  assert.ok(/uq_driver_ledger_opening[\s\S]*WHERE transaction_type = 'opening_balance'/.test(s));
  assert.ok(/chk_order_ceilings_has_limit/.test(s) && /max_orders/.test(s) && /max_vehicles/.test(s));
  assert.ok(/used_at TIMESTAMP/.test(s));
  for (const stmt of s.match(/ALTER TABLE [^`]*ADD COLUMN[^`]*/g) || []) assert.ok(/IF NOT EXISTS/.test(stmt), stmt.slice(0, 60));
});

test('F1-23) المسارات: رصيد السائق بصلاحية ledger.create، وإجراء تجاوز السقف للأدمن فقط', () => {
  assert.ok(/router\.post\('\/:driverId\/opening-balance', requirePermission\('ledger\.create'\)/.test(read('src/modules/drivers/driver-ledger.routes.js')));
  assert.ok(/router\.patch\('\/customers\/:customerId\/action', requireRoles\('admin'\)/.test(read('src/modules/ceilings/ceilings.routes.js')));
});
