'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const n = require('../src/modules/notifications/notify.service');
const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('G27-1) إشعار التسعير للتاجر يذكر كل صنف بكميته وسعره والإجمالي', () => {
  const m = n.buildOrderPricedTrader({ orderNumber: 'GHO-9', currency: 'YER', total: 500000,
    lines: [{ product: 'أسمنت عمران 42.5', quantity: 100, unit: 'bag', unitPrice: 5000 }] });
  assert.match(m.body, /GHO-9/);
  assert.match(m.body, /أسمنت عمران 42\.5 100 كيس × 5,000 ر\.ي/);
  assert.match(m.body, /500,000 YER/);
});

test('G27-2) إشعار الإدارة باختيار الدفع يذكر اسم التاجر وطريقة الدفع بالعربية', () => {
  const m = n.buildPaymentChosenAdmin({ orderNumber: 'GHO-9', customerName: 'علي محمد', paymentTerms: 'on_account', total: 500000 });
  assert.match(m.body, /علي محمد/);
  assert.match(m.body, /آجل/);
  assert.match(m.body, /GHO-9/);
});

test('G27-3) طريقة الدفع المعاد تسميتها داخليًا (network_transfer) تُعرض بالعربية', () => {
  const m = n.buildPaymentChosenAdmin({ orderNumber: 'G', customerName: 'x', paymentTerms: 'network_transfer', total: 1 });
  assert.match(m.body, /تحويل شبكة/);
});

test('G27-4) التسعير يستخدم الوحدة الجديدة داخل نقطة الحماية (لا إشعار قديم)', () => {
  const s = read('src/modules/orders/orders.service.js');
  assert.match(s, /await notifyOrderPriced\(client, orderId\);/);
  assert.ok(!/تم تحديد قيمة طلبك/.test(s), 'لا يجوز بقاء نص التسعير القديم');
});

test('G27-5) اختيار طريقة الدفع يرسل إشعار الإدارة داخل نقطة حماية مستقلة', () => {
  const s = read('src/modules/orders/orders.service.js');
  assert.match(s, /SAVEPOINT payment_notify_sp[\s\S]*notifyPaymentChosen\(client, orderId, paymentTerms\)/);
});
