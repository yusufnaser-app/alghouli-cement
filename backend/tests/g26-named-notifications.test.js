'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const n = require('../src/modules/notifications/notify.service');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('G26-1) إشعار الإدارة لطلب الشراء يحمل اسم العميل والصنف والكمية ورقم الطلب', () => {
  const m = n.buildOrderCreatedAdmin({ orderNumber: 'GHO-2026-000009', customerName: 'علي محمد', customerType: 'trader',
    items: [{ product: 'أسمنت عمران 42.5', quantity: 100, unit: 'bag' }] });
  assert.match(m.body, /GHO-2026-000009/);
  assert.match(m.body, /علي محمد/);
  assert.match(m.body, /أسمنت عمران 42\.5 100 كيس/);
  assert.match(m.body, /تاجر/);
});

test('G26-2) إشعار التاجر عند التسليم يذكر الكمية والصنف والسائق والمبلغ والفاكس', () => {
  const m = n.buildDestinationDeliveredTrader({ qty: 50, unit: 'ton', product: 'أسمنت عمران 42.5', factory: 'النهضة',
    driverName: 'هاشم', amount: 1500000, faxNumber: 'FX-2026-00007' });
  assert.match(m.body, /50 طن/);
  assert.match(m.body, /أسمنت عمران 42\.5/);
  assert.match(m.body, /هاشم/);
  assert.match(m.body, /1,500,000 ر\.ي/);
  assert.match(m.body, /FX-2026-00007/);
});

test('G26-3) إشعار الإدارة عند التسليم يحدد التاجر والسائق والمكان', () => {
  const m = n.buildDestinationDeliveredAdmin({ qty: 20, unit: 'bag', product: 'أسمنت بورتلاندي', traderName: 'علي محمد',
    driverName: 'هاشم', place: 'ذمار', faxNumber: 'FX-1' });
  assert.match(m.body, /علي محمد/);
  assert.match(m.body, /هاشم/);
  assert.match(m.body, /ذمار/);
  assert.match(m.body, /20 كيس/);
});

test('G26-4) الصنف المجهول يُعرض باسم عام بدل فراغ', () => {
  const m = n.buildDestinationDeliveredAdmin({ qty: 1, unit: 'bag' });
  assert.match(m.body, /الأسمنت/);
  assert.match(m.body, /—/);
});

test('G26-5) إنشاء الطلب والتسليم يستدعيان الإشعارات داخل المعاملة قبل COMMIT', () => {
  const o = read('src/modules/orders/orders.service.js');
  assert.ok(o.indexOf('notifyOrderCreated(client, order.id)') < o.indexOf("await client.query('COMMIT');", o.indexOf('notifyOrderCreated(client')));
  const d = read('src/modules/faxes/destination.service.js');
  assert.match(d, /await notifyDestinationDelivered\(client, dest\.id, userId\);/);
});

test('G26-6) الإدارة تُحدَّد بدور admin النشط عبر user_roles', () => {
  assert.match(read('src/modules/notifications/notify.service.js'), /WHERE r\.name = 'admin' AND u\.status = 'active'/);
});
