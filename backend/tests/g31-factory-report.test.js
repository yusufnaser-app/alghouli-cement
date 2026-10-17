'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { buildFactoryReport, validateRange } = require('../src/modules/faxes/factory-report.service');

const row = (o) => ({ id: 'f1', fax_number: 'FX-1', status: 'ISSUED', bags: 100, driver_name: 'هاشم',
  plate_number: 'ص1', product_name: 'عمران 42.5', requested_at: '2026-10-01', ...o });

test('G31-1) الفاكس الواحد لا يتكرر حتى لو ظهر في أكثر من صف', () => {
  const r = buildFactoryReport({ id: 'm1', name_ar: 'النهضة' }, [row({ id: 'f1' }), row({ id: 'f1' }), row({ id: 'f2', fax_number: 'FX-2' })]);
  assert.strictEqual(r.rows.length, 2);
  assert.strictEqual(r.count, 2);
  assert.strictEqual(r.total_bags, 200);
});

test('G31-2) الملغى لا يدخل الإجماليات ويُعدّ منفصلًا', () => {
  const r = buildFactoryReport({ id: 'm1', name_ar: 'النهضة' }, [row({ id: 'f1' }), row({ id: 'f2', status: 'CANCELLED', bags: 500 })]);
  assert.strictEqual(r.count, 1);
  assert.strictEqual(r.total_bags, 100);
  assert.strictEqual(r.cancelled_count, 1);
});

test('G31-3) الإجماليات تُجمع لكل صنف على حدة', () => {
  const r = buildFactoryReport({ id: 'm1', name_ar: 'النهضة' }, [
    row({ id: 'f1', product_name: 'عمران 42.5', bags: 100 }),
    row({ id: 'f2', product_name: 'بورتلاندي', bags: 50 }),
    row({ id: 'f3', product_name: 'عمران 42.5', bags: 25 }),
  ]);
  const byName = Object.fromEntries(r.by_product.map((p) => [p.product_name, p]));
  assert.strictEqual(byName['عمران 42.5'].bags, 125);
  assert.strictEqual(byName['بورتلاندي'].count, 1);
});

test('G31-4) البيانات الناقصة تُعرض بوضوح بدل اختلاق قيم', () => {
  const r = buildFactoryReport({ id: 'm1', name_ar: 'النهضة' }, [row({ id: 'f1', driver_name: null, plate_number: null, product_name: null })]);
  assert.strictEqual(r.rows[0].driver_name, 'غير مسجّل');
  assert.strictEqual(r.rows[0].plate_number, 'غير مسجّلة');
  assert.strictEqual(r.rows[0].product_name, 'غير محدد');
});

test('G31-5) نطاق التاريخ غير الصالح يُرفض', () => {
  assert.throws(() => validateRange('2026-10-10', '2026-10-01'), { code: 'INVALID_RANGE', status: 400 });
  assert.throws(() => validateRange('x', '2026-10-01'), { code: 'INVALID_RANGE' });
  validateRange('2026-10-01', '2026-10-31');
});

test('G31-6) المسار مركّب قبل التعامل مع الأرقام وبصلاحيات الإدارة', () => {
  const r = fs.readFileSync(path.join(__dirname, '../src/modules/faxes/fax.routes.js'), 'utf8');
  assert.match(r, /router\.get\('\/reports\/factory', requireRoles\('admin','transport','sales'\)/);
});
