'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const n = require('../src/modules/notifications/notify.service');
const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('G28-1) اعتماد الطلب يذكر الرقم والإجمالي', () => {
  const m = n.buildOrderApprovedTrader({ orderNumber: 'GHO-7', total: 500000 });
  assert.match(m.body, /GHO-7/);
  assert.match(m.body, /500,000 ر\.ي/);
});

test('G28-2) الرفض يحمل السبب', () => {
  const m = n.buildOrderRejectedTrader({ orderNumber: 'GHO-7', reason: 'تجاوز الحد' });
  assert.match(m.body, /تجاوز الحد/);
});

test('G28-3) الإلغاء للإدارة يذكر اسم العميل والسبب', () => {
  const m = n.buildOrderCancelledAdmin({ orderNumber: 'GHO-7', customerName: 'علي محمد', reason: 'طلب مكرر' });
  assert.match(m.body, /علي محمد/);
  assert.match(m.body, /طلب مكرر/);
});

test('G28-4) الرفض والإلغاء بلا سبب لا يُضيفان نصًا فارغًا', () => {
  assert.doesNotMatch(n.buildOrderCancelledTrader({ orderNumber: 'G' }).body, /السبب/);
});

test('G28-5) أحداث الطلب مربوطة داخل نقاط حماية قبل COMMIT', () => {
  const s = read('src/modules/orders/orders.service.js');
  assert.match(s, /notifyOrderEvent\(client, orderId, 'approved'\)/);
  assert.match(s, /notifyOrderEvent\(client, orderId, 'rejected', reason\)/);
  assert.match(s, /notifyOrderEvent\(client, orderId, 'cancelled', reason \|\| null\)/);
  assert.equal((s.match(/SAVEPOINT order_event_sp/g) || []).length >= 3, true);
});
