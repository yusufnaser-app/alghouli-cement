'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { install, clearModules } = require('./helpers');

const stub = (rel, exports) => {
  const p = require.resolve(path.join(__dirname, '..', rel));
  require.cache[p] = { id: p, filename: p, loaded: true, exports };
};
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

const load = ({ smsFails = false } = {}) => {
  install({ pool: {}, query: async () => ({ rows: [] }) });
  stub('src/services/fcm.service.js', { sendPushNotification: async () => {} });
  stub('src/services/sms.service.js', { queueSms: async () => { if (smsFails) throw new Error('sms down'); } });
  stub('src/modules/accounting/order-fulfillment.service.js', {});
  clearModules('src/modules/faxes/order-fax.js', 'src/modules/faxes/fax.service.js', 'src/modules/faxes/destination.service.js');
  return {
    orderFax: require('../src/modules/faxes/order-fax'),
    fax: require('../src/modules/faxes/fax.service'),
    dest: require('../src/modules/faxes/destination.service'),
  };
};

// ───────── عميل وهمي لـ createOrderFax ─────────
const orderRow = (o = {}) => ({
  id: 'o1', customer_id: 'c1', transport_beneficiary: null, factory_id: null, customer_user_id: 'cu1',
  c_gov: 'صنعاء', c_area: 'الحصبة', default_address: 'شارع الستين', customer_name: 'التاجر', customer_phone: '777',
  a_gov: 'ذمار', a_area: 'المدينة', address_text: 'يُحدد', quantity: '100', unit: 'bag', source_id: 'fac1', ...o,
});
const mkClient = ({ order = orderRow(), existing = null, assigned = false, driver = true, vehicle = true, insertErr = null } = {}) => {
  const log = [];
  return {
    log,
    query: async (sql, params = []) => {
      const s = norm(sql); log.push({ s, params });
      if (/^SELECT o\.id, o\.customer_id, o\.transport_beneficiary/.test(s)) return { rows: order ? [order] : [] };
      if (/^SELECT id, fax_number, status FROM loading_faxes WHERE order_id/.test(s)) return { rows: existing ? [existing] : [] };
      if (/^SELECT id, fax_id FROM delivery_destinations WHERE fulfills_order_id/.test(s)) return { rows: assigned ? [{ id: 'dx', fax_id: 'fx9' }] : [] };
      if (/^SELECT d\.id, d\.driver_type, d\.user_id/.test(s)) return { rows: driver ? [{ id: params[0], driver_type: null, user_id: 'du1', phone: '711' }] : [] };
      if (/^SELECT id FROM vehicles/.test(s)) return { rows: vehicle ? [{ id: params[0] }] : [] };
      if (/^SELECT pg_advisory_xact_lock/.test(s)) return { rows: [] };
      if (/^SELECT COALESCE\(MAX\(CAST/.test(s)) return { rows: [{ max_num: 4 }] };
      if (/^INSERT INTO loading_faxes/.test(s)) {
        if (insertErr) throw insertErr;
        return { rows: [{ id: 'fx1', fax_number: 'FX-2026-00005', status: 'ISSUED' }] };
      }
      if (/^INSERT INTO delivery_destinations/.test(s)) return { rows: [{ id: 'dd1' }] };
      if (/^SELECT name_ar FROM product_sources/.test(s)) return { rows: [{ name_ar: 'مصنع النهضة' }] };
      if (/^UPDATE orders SET status = 'PREPARING'/.test(s)) return { rows: [{ id: 'o1' }] };
      return { rows: [] };
    },
  };
};
const base = { orderId: 'o1', driverId: 'dr1', vehicleId: 'v1', createdBy: 'u1', managed: false, advanceOrder: true };
const find = (c, re) => c.log.filter((l) => re.test(l.s));

test('B-1) فاكس التاجر: ISSUED مباشرة + وجهة واحدة مرتبطة بالطلب + الطلب → PREPARING', async () => {
  const { orderFax } = load(); const c = mkClient();
  const r = await orderFax.createOrderFax(c, base);
  assert.strictEqual(r.created, true);
  assert.strictEqual(r.fax.status, 'ISSUED');
  const ins = find(c, /^INSERT INTO loading_faxes/)[0];
  assert.match(ins.s, /'ISSUED'/);
  assert.strictEqual(ins.params[0], 'o1');
  assert.strictEqual(ins.params[9], false);               // is_managed_by_institution
  assert.strictEqual(ins.params[12], 'FX-2026-00005');    // الرقم الموحَّد
  const dd = find(c, /^INSERT INTO delivery_destinations/);
  assert.strictEqual(dd.length, 1);
  assert.strictEqual(dd[0].params[dd[0].params.length - 1], 'o1');  // fulfills_order_id
  assert.strictEqual(dd[0].params[1], 'c1');                          // trader_id
  assert.ok(find(c, /^UPDATE orders SET fax_id/).length === 1);
  assert.ok(find(c, /^UPDATE orders SET status = 'PREPARING'/).length === 1);
  assert.ok(find(c, /^INSERT INTO order_status_history/).length === 1);
});

test('B-2) عنوان الوجهة: محافظة/منطقة العنوان، ونص "يُحدد" يُستبدل بالعنوان الافتراضي', async () => {
  const { orderFax } = load(); const c = mkClient();
  await orderFax.createOrderFax(c, base);
  const dd = find(c, /^INSERT INTO delivery_destinations/)[0].params;
  assert.deepStrictEqual([dd[5], dd[6], dd[7]], ['ذمار', 'المدينة', 'شارع الستين']);
  const fx = find(c, /^INSERT INTO loading_faxes/)[0].params;
  assert.deepStrictEqual([fx[13], fx[14], fx[15]], ['ذمار', 'المدينة', 'شارع الستين']);
});

test('B-3) فاكس نشط قائم → يُعاد نفسه ولا INSERT ولا قفل رقم', async () => {
  const { orderFax } = load(); const c = mkClient({ existing: { id: 'fx0', fax_number: 'FX-1', status: 'READY_FOR_TRANSIT' } });
  const r = await orderFax.createOrderFax(c, base);
  assert.deepStrictEqual([r.created, r.fax.id], [false, 'fx0']);
  assert.strictEqual(find(c, /^INSERT INTO/).length, 0);
  assert.strictEqual(find(c, /advisory/).length, 0);
});

test('B-4) بلا سائق/قاطرة → FAX_NOT_READY + حدث fax.blocked_missing_driver + لا فاكس', async () => {
  const { orderFax } = load();
  for (const patch of [{ driverId: null }, { vehicleId: null }]) {
    const c = mkClient();
    await assert.rejects(orderFax.createOrderFax(c, { ...base, ...patch }), (e) => e.code === 'FAX_NOT_READY' && e.status === 409 && e.reason === 'MISSING_DRIVER_OR_VEHICLE');
    const ev = find(c, /^INSERT INTO automation_events/);
    assert.strictEqual(ev.length, 1);
    assert.strictEqual(ev[0].params[0], 'fax.blocked_missing_driver');
    assert.strictEqual(find(c, /^INSERT INTO loading_faxes/).length, 0);
  }
});

test('B-5) بيانات ناقصة (مصنع/كمية) → FAX_NOT_READY + fax.blocked_incomplete_order', async () => {
  const { orderFax } = load();
  for (const o of [orderRow({ source_id: null, factory_id: null }), orderRow({ quantity: '0' }), orderRow({ quantity: null })]) {
    const c = mkClient({ order: o });
    await assert.rejects(orderFax.createOrderFax(c, base), { code: 'FAX_NOT_READY' });
    assert.strictEqual(find(c, /^INSERT INTO automation_events/)[0].params[0], 'fax.blocked_incomplete_order');
    assert.strictEqual(find(c, /^INSERT INTO loading_faxes/).length, 0);
  }
});

test('B-6) طلب بالطن: كمية الفاكس بالأكياس (×20) والوجهة بوحدة الطلب', async () => {
  const { orderFax } = load(); const c = mkClient({ order: orderRow({ quantity: '5', unit: 'ton' }) });
  await orderFax.createOrderFax(c, base);
  assert.strictEqual(find(c, /^INSERT INTO loading_faxes/)[0].params[4], 100);
  const dd = find(c, /^INSERT INTO delivery_destinations/)[0].params;
  assert.deepStrictEqual([dd[2], dd[3]], [5, 'ton']);
});

test('B-7) الطلب مكلَّف أصلًا كوجهة رحلة → 409 ORDER_ALREADY_ASSIGNED', async () => {
  const { orderFax } = load(); const c = mkClient({ assigned: true });
  await assert.rejects(orderFax.createOrderFax(c, base), { code: 'ORDER_ALREADY_ASSIGNED', status: 409 });
  assert.strictEqual(find(c, /^INSERT INTO loading_faxes/).length, 0);
});

test('B-8) مسار المؤسسة (managed, بلا advanceOrder): لا انتقال PREPARING، is_managed=true', async () => {
  const { orderFax } = load(); const c = mkClient();
  await orderFax.createOrderFax(c, { ...base, managed: true, advanceOrder: false });
  assert.strictEqual(find(c, /^UPDATE orders SET status = 'PREPARING'/).length, 0);
  const p = find(c, /^INSERT LOADING/i).length ? null : find(c, /^INSERT INTO loading_faxes/)[0].params;
  assert.strictEqual(p[9], true);
  assert.strictEqual(p[8], 'institution_driver');   // الافتراضي لسائق بلا نوع
});

test('B-9) تحمّل التاجر للأجرة يُنسخ إلى الفاكس', async () => {
  const { orderFax } = load(); const c = mkClient({ order: orderRow({ transport_beneficiary: 'trader' }) });
  await orderFax.createOrderFax(c, base);
  const p = find(c, /^INSERT INTO loading_faxes/)[0].params;
  assert.deepStrictEqual([p[10], p[11]], ['trader', 'c1']);
});

test('B-10) خرق الفهرس الجزئي → 409 FAX_ALREADY_EXISTS_FOR_ORDER (لا 500)', async () => {
  const { orderFax } = load();
  const e = Object.assign(new Error('dup'), { code: '23505', constraint: 'uq_loading_faxes_order_active' });
  await assert.rejects(orderFax.createOrderFax(mkClient({ insertErr: e }), base), { code: 'FAX_ALREADY_EXISTS_FOR_ORDER', status: 409 });
  // خرق فهرس آخر لا يُحوَّل
  const other = Object.assign(new Error('x'), { code: '23505', constraint: 'uq_loading_faxes_fax_number' });
  await assert.rejects(orderFax.createOrderFax(mkClient({ insertErr: other }), base), (er) => er === other);
});

test('B-11) فشل SMS لا يُفشل الإنشاء (SAVEPOINT + ROLLBACK TO)', async () => {
  const { orderFax } = load({ smsFails: true }); const c = mkClient();
  const r = await orderFax.createOrderFax(c, base);
  assert.strictEqual(r.created, true);
  assert.ok(c.log.some((l) => l.s === 'ROLLBACK TO SAVEPOINT order_fax_sms'));
});

test('B-12) ترتيب INSERT = ترتيب VALUES: أعمدة loading_faxes وdestinations = عدد القيم والمعاملات', () => {
  const src = read('src/modules/faxes/order-fax.js');
  for (const table of ['loading_faxes', 'delivery_destinations']) {
    const m = src.match(new RegExp(`INSERT INTO ${table}\\s*\\(([^)]*)\\)\\s*VALUES \\(([\\s\\S]*?)\\)\\s*RETURNING`));
    assert.ok(m, table);
    const cols = m[1].split(',').map((x) => x.trim()).filter(Boolean);
    const vals = m[2].replace(/NOW\(\)/g, 'NOW').split(',').map((x) => x.trim()).filter(Boolean);
    assert.strictEqual(cols.length, vals.length, table);
    const maxParam = Math.max(...vals.filter((v) => /^\$\d+$/.test(v)).map((v) => Number(v.slice(1))));
    assert.ok(maxParam >= 12, table);
  }
});

// ───────── createFaxFromOrder يستعمل الدالة الموحدة ─────────
const mkTraderOrderClient = (over = {}) => {
  const inner = mkClient();
  const row = { id: 'o1', fax_requested: true, delivery_type: 'trader_pickup', trader_driver_id: 'dr1', trader_vehicle_id: 'v1',
    customer_id: 'c1', customer_user_id: 'cu1', quantity: '100', ...over };
  return {
    log: inner.log,
    query: async (sql, params = []) => {
      const s = norm(sql);
      if (/^SELECT o\.\*, c\.id AS customer_id/.test(s)) { inner.log.push({ s, params }); return { rows: [row] }; }
      if (/^SELECT id, driver_type, owner_trader_id FROM drivers/.test(s)) { inner.log.push({ s, params }); return { rows: [{ id: 'dr1', driver_type: 'trader_driver', owner_trader_id: 'c1' }] }; }
      if (/^SELECT id, plate_number, current_driver_id FROM vehicles/.test(s)) { inner.log.push({ s, params }); return { rows: [{ id: 'v1', current_driver_id: 'dr1' }] }; }
      if (/FROM loading_faxes WHERE order_id = \$1 AND status IN/.test(s) && /^SELECT id, fax_number, status FROM loading_faxes WHERE order_id = \$1 AND status IN \('REQUESTED','APPROVED','ISSUED','USED','READY_FOR_TRANSIT'\) LIMIT 1$/.test(s) && !over.__helperSeesExisting) {
        inner.log.push({ s, params }); return { rows: [] };
      }
      return inner.query(sql, params);
    },
  };
};

test('B-13) createFaxFromOrder (تاجر): يقفل الطلب FOR UPDATE OF o ويُصدر ISSUED عبر الدالة الموحدة', async () => {
  const { fax } = load(); const c = mkTraderOrderClient();
  const r = await fax.createFaxFromOrder(c, 'o1', 'admin');
  assert.strictEqual(r.status, 'ISSUED');
  assert.match(c.log[0].s, /FOR UPDATE OF o$/);
  assert.strictEqual(c.log.filter((l) => /^INSERT INTO loading_faxes/.test(l.s)).length, 1);
  assert.strictEqual(c.log.filter((l) => /^INSERT INTO delivery_destinations/.test(l.s)).length, 1);
});

test('B-14) createFaxFromOrder: سائق غير تابع للتاجر → 403 (لا إنشاء)', async () => {
  const { fax } = load(); const c = mkTraderOrderClient();
  const q = c.query;
  c.query = async (sql, params) => /^SELECT id, driver_type, owner_trader_id FROM drivers/.test(norm(sql))
    ? { rows: [{ id: 'dr1', driver_type: 'trader_driver', owner_trader_id: 'OTHER' }] } : q(sql, params);
  await assert.rejects(fax.createFaxFromOrder(c, 'o1', 'admin'), { status: 403 });
  assert.strictEqual(c.log.filter((l) => /^INSERT INTO loading_faxes/.test(l.s)).length, 0);
});

test('B-15) createFaxFromOrder: بلا سائق → FAX_NOT_READY + حدث صريح', async () => {
  const { fax } = load(); const c = mkTraderOrderClient({ trader_driver_id: null });
  await assert.rejects(fax.createFaxFromOrder(c, 'o1', 'admin'), { code: 'FAX_NOT_READY' });
  const ev = c.log.filter((l) => /^INSERT INTO automation_events/.test(l.s));
  assert.strictEqual(ev[0].params[0], 'fax.blocked_missing_driver');
});

test('B-16) deliveries.assign يستعمل الدالة الموحدة ولا INSERT يدوي لفاكس', () => {
  const s = read('src/modules/deliveries/deliveries.service.js');
  assert.match(s, /createOrderFax\(client,/);
  assert.ok(!/INSERT INTO loading_faxes/.test(s));
  assert.ok(!/generateFaxNumber/.test(s));
});

test('B-17) errorHandler: خرق uq_loading_faxes_order_active → 409 FAX_ALREADY_EXISTS_FOR_ORDER', () => {
  clearModules('src/middlewares/errorHandler.js');
  const handler = require('../src/middlewares/errorHandler');
  let out; const res = { status(c) { out = { status: c }; return this; }, json(b) { out.body = b; return this; } };
  const orig = console.error; console.error = () => {};
  try { handler(Object.assign(new Error('x'), { code: '23505', constraint: 'uq_loading_faxes_order_active' }), {}, res, () => {}); }
  finally { console.error = orig; }
  assert.strictEqual(out.status, 409);
});

// ───────── A5 المصغّرة ─────────
// قفل صف وهمي: يحاكي FOR UPDATE (المعاملة الثانية تنتظر COMMIT/ROLLBACK الأولى)
const mkLock = () => { let tail = Promise.resolve(); return { acquire: () => { let release; const next = new Promise((r) => { release = r; }); const wait = tail; tail = tail.then(() => next); return wait.then(() => release); } }; };

const destState = (over = {}) => ({
  dest: { id: 'dd1', status: 'PENDING', fax_id: 'fx1', fax_number: 'FX-1', driver_id: 'dr1', fax_status: 'USED', fax_is_managed: false,
    fulfills_order_id: 'o1', destination_type: 'trader', trader_id: 'c1', quantity: '100', unit: 'bag', factory_id: 'fac1', ...over },
  order: { id: 'o1', status: 'LOADED' }, orderUpdates: 0, faxClosed: 0, pendingOthers: 0, lock: mkLock(),
});
const destPool = (st) => ({
  connect: async () => {
    let release = null;
    const done = () => { if (release) { release(); release = null; } };
    return {
      release() { done(); },
      query: async (sql, params = []) => {
        const s = norm(sql);
        if (/^BEGIN/.test(s)) return { rows: [] };
        if (/^(COMMIT|ROLLBACK)/.test(s)) { done(); return { rows: [] }; }
        if (/^SELECT d\.\*, f\.fax_number/.test(s)) { release = await st.lock.acquire(); return { rows: [{ ...st.dest }] }; }
        if (/^SELECT id FROM drivers WHERE user_id/.test(s)) return { rows: [{ id: 'dr1' }] };
        if (/^UPDATE orders SET status = 'DELIVERED'/.test(s)) {
          const allowed = [...s.match(/status IN \(([^)]*)\)/)[1].matchAll(/'(\w+)'/g)].map((m) => m[1]);
          if (allowed.includes(st.order.status)) { st.order.status = 'DELIVERED'; st.orderUpdates++; }
          return { rows: [] };
        }
        if (/^UPDATE delivery_destinations SET status = 'DELIVERED'/.test(s)) { st.dest.status = 'DELIVERED'; return { rows: [] }; }
        if (/FROM delivery_destinations WHERE fax_id = \$1 AND status = 'PENDING'/.test(s)) return { rows: [{ count: st.dest.status === 'PENDING' ? 1 + st.pendingOthers : st.pendingOthers }] };
        if (/^UPDATE loading_faxes SET status = 'DELIVERED'/.test(s)) { st.faxClosed++; st.dest.fax_status = 'DELIVERED'; return { rows: [] }; }
        return { rows: [] };
      },
    };
  },
  query: async () => ({ rows: [] }),
});
const loadDest = (st) => {
  const pl = destPool(st); install({ pool: pl, query: pl.query });
  stub('src/services/fcm.service.js', { sendPushNotification: async () => {} });
  clearModules('src/modules/faxes/destination.service.js');
  return require('../src/modules/faxes/destination.service');
};

test('A5-1) تسليم وجهة طلب التاجر والطلب LOADED → الطلب DELIVERED والفاكس DELIVERED (بلا طلب جديد)', async () => {
  const st = destState(); const svc = loadDest(st);
  const r = await svc.deliverDestination('dd1', 'drvUser');
  assert.deepStrictEqual([r.ok, r.order_created, r.all_delivered], [true, false, true]);
  assert.strictEqual(st.order.status, 'DELIVERED');
  assert.strictEqual(st.faxClosed, 1);
});

test('A5-2) نقرتان متزامنتان على نفس الوجهة: واحدة تنجح والثانية DESTINATION_ALREADY_DELIVERED', async () => {
  const st = destState(); const svc = loadDest(st);
  const res = await Promise.allSettled([svc.deliverDestination('dd1', 'u'), svc.deliverDestination('dd1', 'u')]);
  const ok = res.filter((r) => r.status === 'fulfilled');
  const bad = res.filter((r) => r.status === 'rejected');
  assert.strictEqual(ok.length, 1);
  assert.strictEqual(bad.length, 1);
  assert.strictEqual(bad[0].reason.code, 'DESTINATION_ALREADY_DELIVERED');
  assert.strictEqual(st.orderUpdates, 1);
  assert.strictEqual(st.faxClosed, 1);
});

test('A5-3) فاكس مؤسسة لم يصل READY_FOR_TRANSIT → التسليم مرفوض ولا كتابة', async () => {
  const st = destState({ fax_is_managed: true, fax_status: 'USED' }); const svc = loadDest(st);
  await assert.rejects(svc.deliverDestination('dd1', 'u'), { code: 'FAX_NOT_READY_FOR_DELIVERY' });
  assert.strictEqual(st.dest.status, 'PENDING');
  assert.strictEqual(st.orderUpdates, 0);
});

// driverMarkDelivered
const markState = (over = {}) => ({
  fax: { id: 'fx1', status: 'USED', is_managed_by_institution: false, order_id: 'o1', driver_id: 'dr1', order_status: 'LOADED', ...over },
  ownPending: 1, otherPending: 0, autoClosed: 0, faxClosed: 0, orderClosed: 0,
});
const markPool = (st) => ({
  connect: async () => ({
    release() {},
    query: async (sql, params = []) => {
      const s = norm(sql);
      if (/^(BEGIN|COMMIT|ROLLBACK)/.test(s)) return { rows: [] };
      if (/^SELECT f\.\*, o\.id AS order_id/.test(s)) return { rows: [{ ...st.fax }] };
      if (/^SELECT id FROM drivers WHERE user_id/.test(s)) return { rows: [{ id: 'dr1' }] };
      if (/^UPDATE delivery_destinations/.test(s) && /fulfills_order_id = \$3/.test(s)) { st.autoClosed += st.ownPending; st.ownPending = 0; return { rows: [] }; }
      if (/^SELECT COUNT\(\*\)::int AS n FROM delivery_destinations/.test(s)) return { rows: [{ n: st.ownPending + st.otherPending }] };
      if (/^UPDATE loading_faxes/.test(s)) { st.faxClosed++; return { rows: [] }; }
      if (/^UPDATE orders SET status = 'DELIVERED'/.test(s)) { st.orderClosed++; return { rows: [] }; }
      return { rows: [] };
    },
  }),
  query: async () => ({ rows: [] }),
});
const loadMark = (st) => {
  const pl = markPool(st); install({ pool: pl, query: pl.query });
  stub('src/services/fcm.service.js', { sendPushNotification: async () => {} });
  stub('src/services/sms.service.js', { queueSms: async () => {} });
  stub('src/modules/accounting/order-fulfillment.service.js', {});
  clearModules('src/modules/faxes/order-fax.js', 'src/modules/faxes/fax.service.js');
  return require('../src/modules/faxes/fax.service');
};

test('A5-4) driverMarkDelivered (فاكس تاجر USED): يُغلق وجهة طلبه تلقائيًا ثم الفاكس والطلب', async () => {
  const st = markState(); const svc = loadMark(st);
  const r = await svc.driverMarkDelivered('fx1', 'drvUser');
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual([st.autoClosed, st.faxClosed, st.orderClosed], [1, 1, 1]);
});

test('A5-5) driverMarkDelivered (فاكس تاجر) مع وجهة أخرى PENDING → PENDING_DESTINATIONS ولا إغلاق', async () => {
  const st = markState(); st.otherPending = 1; const svc = loadMark(st);
  await assert.rejects(svc.driverMarkDelivered('fx1', 'drvUser'), { code: 'PENDING_DESTINATIONS' });
  assert.deepStrictEqual([st.faxClosed, st.orderClosed], [0, 0]);
});

test('A5-6) driverMarkDelivered (فاكس مؤسسة READY_FOR_TRANSIT) مع وجهات PENDING → مرفوض بلا إغلاق تلقائي', async () => {
  const st = markState({ is_managed_by_institution: true, status: 'READY_FOR_TRANSIT' }); const svc = loadMark(st);
  await assert.rejects(svc.driverMarkDelivered('fx1', 'drvUser'), { code: 'PENDING_DESTINATIONS' });
  assert.deepStrictEqual([st.autoClosed, st.faxClosed, st.orderClosed], [0, 0, 0]);
});

test('A5-7) driverMarkDelivered: فاكس تاجر لم يُحمَّل (ISSUED) → FAX_NOT_READY_FOR_DELIVERY', async () => {
  const st = markState({ status: 'ISSUED' }); const svc = loadMark(st);
  await assert.rejects(svc.driverMarkDelivered('fx1', 'drvUser'), { code: 'FAX_NOT_READY_FOR_DELIVERY' });
  assert.strictEqual(st.autoClosed, 0);
});
