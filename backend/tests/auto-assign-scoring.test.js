const test = require('node:test');
const assert = require('node:assert');
const { install, clearModules } = require('./helpers');

const FACTORY = 'fac-1';
const baseOrder = (o = {}) => ({
  id: 'o1', order_number: 'GHO-1', status: 'PAYMENT_APPROVED', delivery_type: 'alghouli_delivery',
  customer_id: 'c1', fax_id: null, governorate: 'ذمار', area: null, address_text: null,
  quantity: '100', unit: 'bag', source_id: FACTORY, ...o,
});
const fax = (o = {}) => ({
  id: 'f1', fax_number: 'FX-1', driver_id: 'd1', status: 'USED', factory_id: FACTORY, managed: true,
  delivery_governorate: 'ذمار', route: null, requested_at: 1, capacity: '1500', used_bags: '0', has_dest_in_gov: false, ...o,
});

// عميل وهمي يحاكي دلالات الاستعلامات (ويقرأ قائمة الحالات وشرط المصنع من نص SQL الفعلي)
const setup = (order, faxes, { already = null } = {}) => {
  const log = [];
  const client = {
    query: async (sql, params = []) => {
      const head = sql.trim().split(/\s+/)[0];
      log.push({ head, sql, params });
      if (/FROM orders o\s+JOIN customers/.test(sql)) return { rows: [order] };
      if (/WHERE dd\.fulfills_order_id = \$1/.test(sql)) return { rows: already ? [already] : [] };
      if (/FROM loading_faxes f\s+WHERE f\.status IN/.test(sql)) {
        const statuses = [...sql.match(/f\.status IN \(([^)]*)\)/)[1].matchAll(/'(\w+)'/g)].map((m) => m[1]);
        assert.ok(/f\.factory_id = \$1/.test(sql), 'المصنع شرط صارم');
        return { rows: faxes.filter((f) => statuses.includes(f.status) && f.factory_id === params[0] && f.managed) };
      }
      if (/MAX\(sort_order\)/.test(sql)) return { rows: [{ n: 0 }] };
      if (/FROM customers c JOIN users/.test(sql)) return { rows: [{ full_name: 'ت', phone: '7', user_id: 'u9' }] };
      if (/INSERT INTO delivery_destinations/.test(sql)) return { rows: [{ id: 'dest-1' }] };
      return { rows: [] };
    },
    release() {},
  };
  install({ pool: { connect: async () => client }, query: async () => ({ rows: [] }) });
  clearModules('src/modules/deliveries/auto-assign.service.js');
  return { log, svc: require('../src/modules/deliveries/auto-assign.service') };
};
const inserted = (log) => log.filter((l) => /^INSERT INTO delivery_destinations/.test(l.sql.trim())).length;

test('1) نفس المحافظة → 100', async () => {
  const { svc } = setup(baseOrder(), [fax()]);
  const r = await svc.autoAssignToTrip('o1', 'u');
  assert.strictEqual(r.assigned, true); assert.strictEqual(r.match_score, 100); assert.strictEqual(r.match_reason, 'نفس المحافظة');
});

test('2) وجهة قائمة بنفس المحافظة → 90', async () => {
  const { svc } = setup(baseOrder(), [fax({ delivery_governorate: 'صنعاء', has_dest_in_gov: true })]);
  assert.strictEqual((await svc.autoAssignToTrip('o1', 'u')).match_score, 90);
});

test('3) المحافظة ضمن المسار (عنصر كامل) → 80', async () => {
  const { svc } = setup(baseOrder(), [fax({ delivery_governorate: 'صنعاء', route: 'صنعاء → ذمار' })]);
  assert.strictEqual((await svc.autoAssignToTrip('o1', 'u')).match_score, 80);
});

test('3b) فواصل المسار: , و - و ، ولا مطابقة جزئية', () => {
  const { svc } = setup(baseOrder(), []);
  assert.ok(svc.routeHasGovernorate('صنعاء, ذمار', 'ذمار'));
  assert.ok(svc.routeHasGovernorate('صنعاء - ذمار', 'ذمار'));
  assert.ok(svc.routeHasGovernorate('صنعاء، ذمار', 'ذمار'));
  assert.ok(!svc.routeHasGovernorate('صنعاء الأمانة → عدن', 'صنعاء'));
  assert.ok(!svc.routeHasGovernorate(null, 'ذمار'));
});

test('4) المحافظة فارغة → 50', async () => {
  const { svc } = setup(baseOrder(), [fax({ delivery_governorate: null })]);
  assert.strictEqual((await svc.autoAssignToTrip('o1', 'u')).match_score, 50);
});

test('الأعلى نقاطًا يُختار ولو كان أحدث؛ والتعادل للأقدم', async () => {
  const faxes = [
    fax({ id: 'old50', fax_number: 'A', delivery_governorate: null, requested_at: 1 }),
    fax({ id: 'new100', fax_number: 'B', requested_at: 9 }),
    fax({ id: 'new100b', fax_number: 'C', requested_at: 10 }),
  ];
  const r = await setup(baseOrder(), faxes).svc.autoAssignToTrip('o1', 'u');
  assert.strictEqual(r.fax_id, 'new100');
  assert.strictEqual(r.match_score, 100);
});

test('محافظة مختلفة بلا وجهة ولا مسار → غير مناسب', async () => {
  const { svc } = setup(baseOrder(), [fax({ delivery_governorate: 'عدن', route: 'عدن' })]);
  const r = await svc.autoAssignToTrip('o1', 'u');
  assert.deepStrictEqual([r.assigned, r.code], [false, 'NO_MATCHING_TRIP']);
});

test('5) مصنع مختلف → مستبعد', async () => {
  const { svc, log } = setup(baseOrder(), [fax({ factory_id: 'other' })]);
  const r = await svc.autoAssignToTrip('o1', 'u');
  assert.strictEqual(r.assigned, false); assert.strictEqual(inserted(log), 0);
});

test('6) trader_pickup → مرفوض', async () => {
  const { svc, log } = setup(baseOrder({ delivery_type: 'trader_pickup' }), [fax()]);
  const r = await svc.autoAssignToTrip('o1', 'u');
  assert.deepStrictEqual([r.assigned, r.code], [false, 'NOT_INSTITUTION_DELIVERY']);
  assert.strictEqual(inserted(log), 0);
});

test('7) لا رحلة → assigned:false + NO_MATCHING_TRIP + reason عربي', async () => {
  const r = await setup(baseOrder(), []).svc.autoAssignToTrip('o1', 'u');
  assert.deepStrictEqual(r, { assigned: false, code: 'NO_MATCHING_TRIP', reason: 'لا توجد رحلة مناسبة' });
});

test('8) طلب 100 طن = 2000 كيس على متبقٍ 1500 → مرفوض؛ و75 طن (1500) مقبول', async () => {
  const no = await setup(baseOrder({ quantity: '100', unit: 'ton' }), [fax()]).svc.autoAssignToTrip('o1', 'u');
  assert.strictEqual(no.code, 'NO_MATCHING_TRIP');
  const yes = await setup(baseOrder({ quantity: '75', unit: 'ton' }), [fax()]).svc.autoAssignToTrip('o1', 'u');
  assert.strictEqual(yes.assigned, true);
});

test('8b) المتبقي يحسب وجهات الطن ×20 (used_bags بالأكياس)', async () => {
  // سعة 1500، مستخدم 1400 كيس → لا يتسع 101
  const r = await setup(baseOrder({ quantity: '101' }), [fax({ used_bags: '1400' })]).svc.autoAssignToTrip('o1', 'u');
  assert.strictEqual(r.code, 'NO_MATCHING_TRIP');
  const ok = await setup(baseOrder({ quantity: '100' }), [fax({ used_bags: '1400' })]).svc.autoAssignToTrip('o1', 'u');
  assert.strictEqual(ok.assigned, true);
});

test('9) فاكس DELIVERED/CANCELLED → مستبعد', async () => {
  for (const status of ['DELIVERED', 'CANCELLED']) {
    const r = await setup(baseOrder(), [fax({ status })]).svc.autoAssignToTrip('o1', 'u');
    assert.strictEqual(r.code, 'NO_MATCHING_TRIP', status);
  }
});

test('الحالات السابقة للتحميل ما زالت مقبولة (REQUESTED..READY_FOR_TRANSIT)', async () => {
  for (const status of ['REQUESTED', 'APPROVED', 'ISSUED', 'USED', 'READY_FOR_TRANSIT']) {
    const r = await setup(baseOrder(), [fax({ status })]).svc.autoAssignToTrip('o1', 'u');
    assert.strictEqual(r.assigned, true, status);
  }
});

test('10) تكرار الاستدعاء: لا وجهة ثانية (already)', async () => {
  const { svc, log } = setup(baseOrder(), [fax()], { already: { id: 'dest-1', fax_id: 'f1', fax_number: 'FX-1' } });
  const r = await svc.autoAssignToTrip('o1', 'u');
  assert.deepStrictEqual([r.assigned, r.already, r.destination_id], [true, true, 'dest-1']);
  assert.strictEqual(inserted(log), 0);
});
