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

// ═════════ A4: available-trips ═════════
const loadTrips = (rows = []) => {
  const calls = [];
  install({ pool: {}, query: async (sql, params) => { calls.push({ sql: sql.replace(/\s+/g, ' '), params }); return { rows }; } });
  clearModules('src/modules/deliveries/available-trips.service.js', 'src/modules/deliveries/auto-assign.service.js');
  return { calls, svc: require('../src/modules/deliveries/available-trips.service') };
};
const trip = (o = {}) => ({ fax_id: 'f', delivery_governorate: 'ذمار', route: null, has_dest_in_gov: false, ...o });

test('A4-1) الاستعلام يستعمل trip-capacity: الطن ×20 واستبعاد CANCELLED', async () => {
  const { svc, calls } = loadTrips();
  await svc.listAvailableTrips({});
  const sql = calls[0].sql;
  assert.match(sql, /CASE WHEN dd\.unit = 'ton' THEN 20 ELSE 1 END/);
  assert.match(sql, /dd\.status <> 'CANCELLED'/);
  assert.match(sql, /COALESCE\(f\.loaded_quantity, f\.approved_quantity, f\.requested_quantity, 0\)/);
});

test('A4-2) قائمة الحالات موحّدة وتشمل READY_FOR_TRANSIT ولا تشمل DELIVERED/CANCELLED', async () => {
  const { svc, calls } = loadTrips();
  await svc.listAvailableTrips({});
  const list = calls[0].sql.match(/f\.status IN \(([^)]*)\)/)[1];
  const { ELIGIBLE_STATUSES } = require('../src/modules/deliveries/trip-capacity');
  assert.deepStrictEqual([...list.matchAll(/'(\w+)'/g)].map((m) => m[1]), ELIGIBLE_STATUSES);
  assert.ok(list.includes('READY_FOR_TRANSIT')); assert.ok(!/DELIVERED|CANCELLED/.test(list));
});

test('A4-3) ترقيم المعاملات: محافظة=$1، مصنع=$2، الحد الأدنى=$3', async () => {
  const { svc, calls } = loadTrips();
  await svc.listAvailableTrips({ governorate: ' ذمار ', factoryId: 'fac', minRemaining: '50' });
  assert.deepStrictEqual(calls[0].params, ['ذمار', 'fac', 50]);
  assert.match(calls[0].sql, /TRIM\(dg\.governorate\) = \$1/);
  assert.match(calls[0].sql, /f\.factory_id = \$2/);
  assert.match(calls[0].sql, />= \$3/);
});

test('A4-4) بلا محافظة: المعاملة الوحيدة هي الحد الأدنى (0) والنقاط null', async () => {
  const { svc, calls } = loadTrips([trip({ fax_id: 'a' }), trip({ fax_id: 'b', delivery_governorate: 'عدن' })]);
  const out = await svc.listAvailableTrips({});
  assert.deepStrictEqual(calls[0].params, [0]);
  assert.strictEqual(out.length, 2);
  assert.ok(out.every((t) => t.match_score === null && t.match_reason === null));
});

test('A4-5) حد أدنى سالب أو غير رقمي → 0', async () => {
  for (const v of [-5, 'abc', undefined]) {
    const { svc, calls } = loadTrips();
    await svc.listAvailableTrips({ minRemaining: v });
    assert.deepStrictEqual(calls[0].params, [0]);
  }
});

test('A4-6) مع محافظة: الترتيب 100 > 90 > 80 > 50 والملاءمة الغائبة تُستبعد', async () => {
  const rows = [
    trip({ fax_id: 'none', delivery_governorate: 'عدن' }),                         // null → مستبعد
    trip({ fax_id: 'blank', delivery_governorate: null }),                          // 50
    trip({ fax_id: 'route', delivery_governorate: 'عدن', route: 'صنعاء → ذمار' }),   // 80
    trip({ fax_id: 'dest', delivery_governorate: 'عدن', has_dest_in_gov: true }),   // 90
    trip({ fax_id: 'same', delivery_governorate: 'ذمار' }),                         // 100
  ];
  const { svc } = loadTrips(rows);
  const out = await svc.listAvailableTrips({ governorate: 'ذمار' });
  assert.deepStrictEqual(out.map((t) => [t.fax_id, t.match_score]), [['same', 100], ['dest', 90], ['route', 80], ['blank', 50]]);
  assert.ok(out.every((t) => typeof t.match_reason === 'string' && t.match_reason.length));
});

test('A4-7) تعادل النقاط: يُحفظ ترتيب الأقدم أولًا (ORDER BY requested_at)', async () => {
  const { svc } = loadTrips([trip({ fax_id: 'old' }), trip({ fax_id: 'new' })]);
  const out = await svc.listAvailableTrips({ governorate: 'ذمار' });
  assert.deepStrictEqual(out.map((t) => t.fax_id), ['old', 'new']);
});

test('A4-8) rankTrips لا يُعدّل الصفوف الأصلية ولا يُسرّب حقل الترتيب الداخلي', () => {
  const { svc } = loadTrips();
  const rows = [trip({ fax_id: 'x' })];
  const out = svc.rankTrips(rows, 'ذمار');
  assert.ok(!('_i' in out[0])); assert.ok(!('match_score' in rows[0]));
});

test('A4-9) auto-assign يستعمل القائمة الموحّدة نفسها (لا قائمة محلية)', () => {
  const s = fs.readFileSync(path.join(__dirname, '../src/modules/deliveries/auto-assign.service.js'), 'utf8');
  assert.ok(!/const ELIGIBLE_STATUSES\s*=/.test(s));
  assert.ok(/eligibleStatusesSql\(\)/.test(s));
});

// ═════════ A3: createFaxFromOrder ═════════
const loadFax = (existingFaxStatus) => {
  const log = [];
  const client = {
    query: async (sql, params = []) => {
      const s = sql.replace(/\s+/g, ' ').trim(); log.push(s);
      if (/^SELECT o\.\*, c\.id AS customer_id/.test(s)) return { rows: [{ id: 'o1', fax_requested: true, delivery_type: 'trader_pickup', trader_driver_id: null, trader_vehicle_id: null, customer_id: 'c1', quantity: '100' }] };
      if (/FROM loading_faxes WHERE order_id = \$1 AND status IN/.test(s)) {
        const list = [...s.match(/status IN \(([^)]*)\)/)[1].matchAll(/'(\w+)'/g)].map((m) => m[1]);
        return { rows: existingFaxStatus && list.includes(existingFaxStatus) ? [{ id: 'fx1', fax_number: 'FX-1', status: existingFaxStatus }] : [] };
      }
      return { rows: [] };
    },
  };
  install({ pool: {}, query: async () => ({ rows: [] }) });
  stub('src/services/fcm.service.js', { sendPushNotification: async () => {} });
  stub('src/services/sms.service.js', { queueSms: async () => {} });
  stub('src/modules/accounting/order-fulfillment.service.js', {});
  clearModules('src/modules/faxes/fax.service.js');
  return { log, client, svc: require('../src/modules/faxes/fax.service') };
};

test('A3-1) فاكس قائم READY_FOR_TRANSIT → يُعاد نفسه ولا يُنشأ فاكس ثانٍ', async () => {
  const { svc, client, log } = loadFax('READY_FOR_TRANSIT');
  const r = await svc.createFaxFromOrder(client, 'o1', 'u');
  assert.strictEqual(r.id, 'fx1');
  assert.ok(!log.some((l) => /INSERT INTO loading_faxes/.test(l)));
  assert.ok(log.some((l) => /UPDATE orders SET fax_id = \$1/.test(l)));
});

test('A3-2) كل حالة نشطة (REQUESTED..USED) تُعاد أيضًا', async () => {
  for (const st of ['REQUESTED', 'APPROVED', 'ISSUED', 'USED']) {
    const { svc, client } = loadFax(st);
    assert.strictEqual((await svc.createFaxFromOrder(client, 'o1', 'u')).id, 'fx1', st);
  }
});

test('A3-3) فاكس ملغى/مُسلَّم لا يُعدّ قائمًا (يتابع للإنشاء فيرفض لغياب السائق)', async () => {
  for (const st of ['CANCELLED', 'DELIVERED']) {
    const { svc, client, log } = loadFax(st);
    await assert.rejects(svc.createFaxFromOrder(client, 'o1', 'u'), { code: 'FAX_NOT_READY' });
    assert.ok(!log.some((l) => /INSERT INTO loading_faxes/.test(l)));
  }
});

test('A3-4) deliveries.assign: فحص الفاكس القائم يشمل READY_FOR_TRANSIT أيضًا', () => {
  const s = fs.readFileSync(path.join(__dirname, '../src/modules/deliveries/deliveries.service.js'), 'utf8');
  assert.match(s, /FROM loading_faxes WHERE order_id = \$1 AND status IN \('REQUESTED','APPROVED','ISSUED','USED','READY_FOR_TRANSIT'\)/);
});
