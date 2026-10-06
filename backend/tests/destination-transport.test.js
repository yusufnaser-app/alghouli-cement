const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { install, clearModules } = require('./helpers');

const stub = (rel, exports) => {
  const p = require.resolve(path.join(__dirname, '..', rel));
  require.cache[p] = { id: p, filename: p, loaded: true, exports };
};

const D1 = '11111111-1111-4111-8111-111111111111';
const D2 = '22222222-2222-4222-8222-222222222222';
const dest = (o = {}) => ({ destinationType: 'trader', traderId: D1, quantity: 100, unit: 'bag', governorate: 'صنعاء', ...o });

// يبني بيئة وهمية: log لكل استعلام، applyCalls لاستدعاءات applyTransportAndRoute، pushes للإشعارات
const setup = (fax, { destRows = null } = {}) => {
  const log = [];
  const applyCalls = [];
  const pushes = [];
  const client = {
    query: async (sql, params = []) => {
      log.push(sql.trim().split(/\s+/).slice(0, 3).join(' '));
      if (/FROM loading_faxes f/.test(sql)) return { rows: fax ? [fax] : [] };
      if (/AND NOT \(status = 'PENDING'/.test(sql)) return { rows: [] }; // لا وجهات باقية
      if (/DELETE FROM delivery_destinations/.test(sql)) return { rows: [] };
      if (/FROM customers c JOIN users/.test(sql)) return { rows: [{ id: params[0], governorate: 'ذمار', area: null, default_address: null, full_name: 'ت', phone: '7' }] };
      if (/INSERT INTO delivery_destinations/.test(sql)) return { rows: [{ id: 'x' }] };
      if (/SELECT \* FROM delivery_destinations/.test(sql)) return { rows: destRows || [{ governorate: 'صنعاء', area: 'سعوان' }, { governorate: 'ذمار', area: null }] };
      return { rows: [] };
    },
    release() {},
  };
  install({ pool: { connect: async () => client }, query: async () => ({ rows: [] }) });
  stub('src/services/fcm.service.js', { sendPushNotification: async (...a) => { pushes.push({ a, at: log.length, committed: log.includes('COMMIT') }); } });
  stub('src/modules/faxes/fax.service.js', {
    applyTransportAndRoute: async (c, f, data, uid, opt) => {
      applyCalls.push({ data, opt });
      return { id: f.id, route: data.route, transport_total: 18750, base_quantity: 1500, new_status: 'READY_FOR_TRANSIT', _push: ['tok', 't', 'b', {}] };
    },
  });
  clearModules('src/modules/faxes/destination.service.js');
  return { log, applyCalls, pushes, svc: require('../src/modules/faxes/destination.service') };
};

const usedFax = (o = {}) => ({ id: 'f1', status: 'USED', driver_id: 'dr', loaded_quantity: '1500', requested_quantity: '1500', transport_rate: null, delivery_governorate: 'لحج', delivery_area: 'ر', delivery_address: 'عنوان', ...o });

test('فاكس DELIVERED → FAX_CLOSED مع ROLLBACK', async () => {
  const { svc, log } = setup(usedFax({ status: 'DELIVERED' }));
  await assert.rejects(svc.replaceDestinationsAndTransport('f1', { destinations: [dest()] }, 'u'), { code: 'FAX_CLOSED', status: 400 });
  assert.ok(log.includes('ROLLBACK')); assert.ok(!log.includes('COMMIT'));
});

test('READY_FOR_TRANSIT + سعر → ALREADY_ROUTED (ولا تُمسّ الوجهات)', async () => {
  const { svc, log } = setup(usedFax({ status: 'READY_FOR_TRANSIT' }));
  await assert.rejects(svc.replaceDestinationsAndTransport('f1', { destinations: [dest()], transportRate: 250 }, 'u'), { code: 'ALREADY_ROUTED' });
  assert.ok(!log.some((l) => l.startsWith('DELETE')));
});

test('سعر قبل التحميل (APPROVED) → TRANSPORT_NOT_ALLOWED_YET', async () => {
  const { svc } = setup(usedFax({ status: 'APPROVED', loaded_quantity: null }));
  await assert.rejects(svc.replaceDestinationsAndTransport('f1', { destinations: [dest()], transportRate: 250 }, 'u'), { code: 'TRANSPORT_NOT_ALLOWED_YET' });
});

test('تجاوز الكمية المحملة → QUANTITY_EXCEEDS_LOADED', async () => {
  const { svc } = setup(usedFax());
  await assert.rejects(svc.replaceDestinationsAndTransport('f1', { destinations: [dest({ quantity: 1000 }), dest({ quantity: 501 })] }, 'u'), { code: 'QUANTITY_EXCEEDS_LOADED' });
});

test('الكمية بالطن تُحوَّل ×20 عند فحص السعة', async () => {
  const { svc } = setup(usedFax());
  // 76 طن = 1520 كيس > 1500
  await assert.rejects(svc.replaceDestinationsAndTransport('f1', { destinations: [dest({ quantity: 76, unit: 'ton' })] }, 'u'), { code: 'QUANTITY_EXCEEDS_LOADED' });
  const ok = await setup(usedFax()).svc.replaceDestinationsAndTransport('f1', { destinations: [dest({ quantity: 75, unit: 'ton' })] }, 'u');
  assert.strictEqual(ok.new_status, 'USED');
});

test('متحمّل=trader بلا traderId وعدة تجار → TRANSPORT_PAYER_TRADER_REQUIRED', async () => {
  const { svc } = setup(usedFax());
  await assert.rejects(svc.replaceDestinationsAndTransport('f1', {
    destinations: [dest({ traderId: D1, quantity: 10 }), dest({ traderId: D2, quantity: 10 })], transportRate: 250, transportPayer: 'trader',
  }, 'u'), { code: 'TRANSPORT_PAYER_TRADER_REQUIRED' });
});

test('تاجر واحد → يُملأ تلقائيًا؛ route مشتق؛ المحافظة من أول وجهة؛ Push بعد COMMIT', async () => {
  const { svc, applyCalls, pushes, log } = setup(usedFax());
  const r = await svc.replaceDestinationsAndTransport('f1', {
    destinations: [dest({ quantity: 750 }), dest({ quantity: 750, governorate: 'ذمار' })],
    transportRate: 250, transportRateUnit: 'ton', transportPayer: 'trader',
  }, 'u');
  const a = applyCalls[0];
  assert.strictEqual(a.data.route, 'صنعاء → ذمار');
  assert.strictEqual(a.data.transportPayerTraderId, D1);
  assert.strictEqual(a.data.unit, 'ton');
  assert.strictEqual(a.data.deliveryGovernorate, 'صنعاء');
  assert.strictEqual(a.data.deliveryAddress, 'عنوان');
  assert.strictEqual(a.opt.deferPush, true);
  assert.strictEqual(r.new_status, 'READY_FOR_TRANSIT');
  assert.deepStrictEqual(r.warnings, []);
  await new Promise((res) => setImmediate(res));
  assert.strictEqual(pushes.length, 1);
  assert.ok(pushes[0].committed, 'Push يجب أن يُرسل بعد COMMIT');
  assert.ok(log.includes('COMMIT'));
});

test('بلا سعر على USED → تحذير TRANSPORT_NOT_SET فقط، بلا applyTransportAndRoute', async () => {
  const { svc, applyCalls } = setup(usedFax());
  const r = await svc.replaceDestinationsAndTransport('f1', { destinations: [dest()] }, 'u');
  assert.deepStrictEqual(r.warnings, ['TRANSPORT_NOT_SET']);
  assert.strictEqual(applyCalls.length, 0);
  assert.strictEqual(r.new_status, 'USED');
});

test('بلا سعر على APPROVED → لا تحذير (السعر غير مسموح بعد)', async () => {
  const { svc } = setup(usedFax({ status: 'APPROVED', loaded_quantity: null }));
  const r = await svc.replaceDestinationsAndTransport('f1', { destinations: [dest()] }, 'u');
  assert.deepStrictEqual(r.warnings, []);
});

test('وجهة بلا محافظة → لا تُمسّ محافظة الفاكس القديمة', async () => {
  const a = setup(usedFax(), { destRows: [{ governorate: null, area: null }] });
  await assert.rejects(a.svc.replaceDestinationsAndTransport('f1', { destinations: [dest()], transportRate: 250 }, 'u'), { code: 'ROUTE_REQUIRED' });
  const b = setup(usedFax(), { destRows: [{ governorate: null, area: null }] });
  await b.svc.replaceDestinationsAndTransport('f1', { destinations: [dest()] }, 'u');
  assert.ok(!b.log.some((l) => l.startsWith('UPDATE loading_faxes')));
  assert.strictEqual(b.applyCalls.length, 0);
});

test('معادلة الطن: 1500 كيس × 250/طن = 18,750 (وليس 375,000)', () => {
  const e = require('../src/modules/accounting/accounting.engine');
  const t = (div) => e.fromMinor(e.divRound(BigInt(e.toMinor(250)) * BigInt(e.toMinor(1500)), div));
  assert.strictEqual(t(2000n), '18750.00');
  assert.strictEqual(t(100n), '375000.00');
});
