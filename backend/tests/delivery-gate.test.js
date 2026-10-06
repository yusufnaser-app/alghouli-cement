'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { install, clearModules } = require('./helpers');

const stub = (rel, exports) => {
  const p = require.resolve(path.join(__dirname, '..', rel));
  require.cache[p] = { id: p, filename: p, loaded: true, exports };
};
const tick = () => new Promise((r) => setImmediate(r));

// بيئة وهمية: حالة مشتركة + قفل صفوف FOR UPDATE يُحرَّر عند COMMIT/ROLLBACK (يحاكي PostgreSQL)
const setup = ({ dest = {}, fax = {}, pendingN = 0 } = {}) => {
  const st = {
    dest: { id: 'd1', fax_id: 'f1', status: 'PENDING', destination_type: 'trader', trader_id: 't1', quantity: '100', unit: 'bag', fulfills_order_id: null, ...dest },
    fax: { id: 'f1', status: 'READY_FOR_TRANSIT', is_managed: true, driver_id: 'dr1', order_id: null, ...fax },
    orders: 0, pendingN, sqls: [],
  };
  const locks = new Map();
  const acquire = (key, owner) => new Promise((resolve) => {
    const l = locks.get(key) || { owner: null, q: [] }; locks.set(key, l);
    if (l.owner === owner) return resolve();
    if (!l.owner) { l.owner = owner; return resolve(); }
    l.q.push({ owner, resolve });
  });
  const release = (owner) => {
    for (const l of locks.values()) if (l.owner === owner) { const n = l.q.shift(); if (n) { l.owner = n.owner; n.resolve(); } else l.owner = null; }
  };
  const logs = [];
  const mkClient = () => {
    const owner = Symbol('tx'); const log = []; logs.push(log);
    return {
      log, release() {},
      query: async (sql, params = []) => {
        const s = sql.replace(/\s+/g, ' ').trim(); st.sqls.push(s);
        log.push(s.split(' ')[0]);
        if (/^BEGIN/.test(s)) return { rows: [] };
        if (/^(COMMIT|ROLLBACK)/.test(s)) { release(owner); return { rows: [] }; }
        if (/pg_advisory_xact_lock/.test(s)) return { rows: [] };
        if (/MAX\(CAST/.test(s)) return { rows: [{ max_num: st.orders }] };
        if (/FROM delivery_destinations d JOIN loading_faxes f/.test(s)) {
          if (/FOR UPDATE OF d, f/.test(s)) await acquire('d:' + params[0], owner);
          return { rows: [{ ...st.dest, fax_number: 'FX-1', driver_id: st.fax.driver_id, fax_order_id: null, factory_id: 's1', fax_status: st.fax.status, fax_is_managed: st.fax.is_managed }] };
        }
        if (/SELECT f\.\*, o\.id AS order_id/.test(s)) {
          if (/FOR UPDATE OF f/.test(s)) await acquire('f:' + params[0], owner);
          return { rows: [{ ...st.fax, is_managed_by_institution: st.fax.is_managed, order_status: 'PREPARING' }] };
        }
        if (/SELECT id FROM drivers WHERE user_id/.test(s)) return { rows: [{ id: params[0] === 'u-ok' ? 'dr1' : 'dr9' }] };
        if (/INSERT INTO orders/.test(s)) { st.orders += 1; return { rows: [{ id: `o${st.orders}`, order_number: `GHO-2026-00000${st.orders}` }] }; }
        if (/UPDATE delivery_destinations/.test(s)) { st.dest.status = 'DELIVERED'; return { rows: [] }; }
        if (/COUNT\(\*\)::int AS count FROM delivery_destinations/.test(s)) return { rows: [{ count: 0 }] };
        if (/COUNT\(\*\)::int AS n FROM delivery_destinations/.test(s)) return { rows: [{ n: st.pendingN }] };
        if (/UPDATE loading_faxes SET status = 'DELIVERED'/.test(s)) st.fax.status = 'DELIVERED';
        return { rows: [] };
      },
    };
  };
  install({ pool: { connect: async () => mkClient() }, query: async () => ({ rows: [] }) });
  stub('src/services/fcm.service.js', { sendPushNotification: async () => {} });
  stub('src/services/sms.service.js', { queueSms: async () => {} });
  stub('src/modules/accounting/order-fulfillment.service.js', {});
  clearModules('src/modules/faxes/destination.service.js', 'src/modules/faxes/fax.service.js', 'src/modules/faxes/delivery-gate.js');
  return {
    st, logs,
    dest: require('../src/modules/faxes/destination.service'),
    fax: require('../src/modules/faxes/fax.service'),
  };
};

const rejectsWith = async (p, expected) => assert.rejects(p, expected);

// ── deliverDestination ──
test('1) فاكس مؤسسة في USED → FAX_NOT_READY_FOR_DELIVERY مع ROLLBACK', async () => {
  const e = setup({ fax: { status: 'USED' } });
  await rejectsWith(e.dest.deliverDestination('d1', 'u-ok'), { code: 'FAX_NOT_READY_FOR_DELIVERY', status: 400 });
  assert.ok(e.logs[0].includes('ROLLBACK')); assert.ok(!e.logs[0].includes('COMMIT')); assert.strictEqual(e.st.orders, 0);
});

test('2) وجهة DELIVERED → مرفوضة', async () => {
  const e = setup({ dest: { status: 'DELIVERED' } });
  await rejectsWith(e.dest.deliverDestination('d1', 'u-ok'), { code: 'DESTINATION_ALREADY_DELIVERED' });
});

test('3) وجهة CANCELLED → مرفوضة', async () => {
  const e = setup({ dest: { status: 'CANCELLED' } });
  await rejectsWith(e.dest.deliverDestination('d1', 'u-ok'), { code: 'DESTINATION_CANCELLED' });
});

test('4) فاكس DELIVERED → FAX_ALREADY_DELIVERED', async () => {
  const e = setup({ fax: { status: 'DELIVERED' } });
  await rejectsWith(e.dest.deliverDestination('d1', 'u-ok'), { code: 'FAX_ALREADY_DELIVERED' });
});

test('5) فاكس CANCELLED → FAX_CANCELLED', async () => {
  const e = setup({ fax: { status: 'CANCELLED' } });
  await rejectsWith(e.dest.deliverDestination('d1', 'u-ok'), { code: 'FAX_CANCELLED' });
});

test('6) فاكس مؤسسة READY_FOR_TRANSIT → يُقبل (COMMIT + طلب واحد)', async () => {
  const e = setup();
  const r = await e.dest.deliverDestination('d1', 'u-ok');
  assert.strictEqual(r.ok, true); assert.strictEqual(r.order_created, true);
  assert.ok(e.logs[0].includes('COMMIT')); assert.strictEqual(e.st.orders, 1);
});

test('7) فاكس تاجر (is_managed=false) في USED → يُقبل', async () => {
  const e = setup({ fax: { status: 'USED', is_managed: false } });
  const r = await e.dest.deliverDestination('d1', 'u-ok');
  assert.strictEqual(r.ok, true);
});

test('8) فاكس تاجر في READY_FOR_TRANSIT → مرفوض (المطلوب USED)', async () => {
  const e = setup({ fax: { status: 'READY_FOR_TRANSIT', is_managed: false } });
  await rejectsWith(e.dest.deliverDestination('d1', 'u-ok'), { code: 'FAX_NOT_READY_FOR_DELIVERY', message: /ليس مُحمَّلًا/ });
});

test('9) is_managed = NULL يُعامَل فاكس مؤسسة (USED مرفوض، READY_FOR_TRANSIT مقبول)', async () => {
  await rejectsWith(setup({ fax: { status: 'USED', is_managed: null } }).dest.deliverDestination('d1', 'u-ok'), { code: 'FAX_NOT_READY_FOR_DELIVERY' });
  const r = await setup({ fax: { status: 'READY_FOR_TRANSIT', is_managed: null } }).dest.deliverDestination('d1', 'u-ok');
  assert.strictEqual(r.ok, true);
});

test('10) سائق غير مالك → 403 قبل أي كشف لحالة الفاكس', async () => {
  const e = setup({ fax: { status: 'USED' } });
  await rejectsWith(e.dest.deliverDestination('d1', 'u-other'), { status: 403 });
});

test('11) استعلام الوجهة يقفل FOR UPDATE OF d, f', async () => {
  const e = setup();
  await e.dest.deliverDestination('d1', 'u-ok');
  assert.ok(e.st.sqls.some((s) => /FROM delivery_destinations d JOIN loading_faxes f/.test(s) && /FOR UPDATE OF d, f/.test(s)));
});

test('12) تسليم متزامن (نقرتان) لنفس الوجهة → طلب واحد فقط', async () => {
  const e = setup();
  const [a, b] = await Promise.allSettled([e.dest.deliverDestination('d1', 'u-ok'), e.dest.deliverDestination('d1', 'u-ok')]);
  const ok = [a, b].filter((x) => x.status === 'fulfilled');
  const bad = [a, b].filter((x) => x.status === 'rejected');
  assert.strictEqual(ok.length, 1); assert.strictEqual(bad.length, 1);
  assert.strictEqual(bad[0].reason.code, 'DESTINATION_ALREADY_DELIVERED');
  assert.strictEqual(e.st.orders, 1);
});

test('13) 20 نقرة متوازية → طلب واحد', async () => {
  const e = setup();
  const rs = await Promise.allSettled(Array.from({ length: 20 }, () => e.dest.deliverDestination('d1', 'u-ok')));
  assert.strictEqual(rs.filter((x) => x.status === 'fulfilled').length, 1);
  assert.strictEqual(e.st.orders, 1);
});

// ── driverMarkDelivered ──
test('14) driverMarkDelivered مع وجهات PENDING → PENDING_DESTINATIONS', async () => {
  const e = setup({ fax: { status: 'USED', is_managed: false }, pendingN: 2 });
  await rejectsWith(e.fax.driverMarkDelivered('f1', 'u-ok'), { code: 'PENDING_DESTINATIONS', message: /2/ });
  assert.ok(e.logs[0].includes('ROLLBACK'));
});

test('15) driverMarkDelivered على فاكس تاجر USED بلا وجهات معلّقة → ينجح', async () => {
  const e = setup({ fax: { status: 'USED', is_managed: false } });
  const r = await e.fax.driverMarkDelivered('f1', 'u-ok');
  assert.strictEqual(r.ok, true); assert.ok(e.logs[0].includes('COMMIT'));
});

test('16) driverMarkDelivered على فاكس مؤسسة في USED → FAX_NOT_READY_FOR_DELIVERY', async () => {
  const e = setup({ fax: { status: 'USED' } });
  await rejectsWith(e.fax.driverMarkDelivered('f1', 'u-ok'), { code: 'FAX_NOT_READY_FOR_DELIVERY' });
});

test('17) driverMarkDelivered على DELIVERED / CANCELLED → مرفوض', async () => {
  await rejectsWith(setup({ fax: { status: 'DELIVERED' } }).fax.driverMarkDelivered('f1', 'u-ok'), { code: 'FAX_ALREADY_DELIVERED' });
  await rejectsWith(setup({ fax: { status: 'CANCELLED' } }).fax.driverMarkDelivered('f1', 'u-ok'), { code: 'FAX_CANCELLED' });
});

test('18) driverMarkDelivered: سائق غير مالك → 403، والاستعلام يقفل FOR UPDATE OF f', async () => {
  const e = setup({ fax: { status: 'USED', is_managed: false } });
  await rejectsWith(e.fax.driverMarkDelivered('f1', 'u-other'), { status: 403 });
  assert.ok(e.st.sqls.some((s) => /SELECT f\.\*, o\.id AS order_id/.test(s) && /FOR UPDATE OF f/.test(s)));
});

test('19) إغلاق مزدوج متزامن للفاكس → واحد ينجح والثاني FAX_ALREADY_DELIVERED', async () => {
  const e = setup({ fax: { status: 'USED', is_managed: false } });
  const rs = await Promise.allSettled([e.fax.driverMarkDelivered('f1', 'u-ok'), e.fax.driverMarkDelivered('f1', 'u-ok')]);
  const ok = rs.filter((x) => x.status === 'fulfilled');
  const bad = rs.filter((x) => x.status === 'rejected');
  assert.strictEqual(ok.length, 1);
  assert.strictEqual(bad.length, 1);
  assert.strictEqual(bad[0].reason.code, 'FAX_ALREADY_DELIVERED');
});
