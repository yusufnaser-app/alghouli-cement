'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { install, clearModules } = require('./helpers');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const norm = (s) => s.replace(/\s+/g, ' ').trim();

test('G20-1) نقطة اقتراح السعر مسجّلة قبل /:id وبصلاحيات الإدارة', () => {
  const r = read('src/modules/faxes/fax.routes.js');
  assert.match(r, /router\.get\('\/destinations\/price-suggestion', requireRoles\('admin','transport','sales'\), destinations\.suggestPrice\)/);
  assert.ok(r.indexOf("'/destinations/price-suggestion'") < r.indexOf("'/:id/destinations'"));
});

test('G20-2) السعر الخاص للعميل يُفضَّل على قائمة الأسعار، والتحويل كيس↔طن صحيح', async () => {
  install({ pool: {}, query: async (sql) => {
    if (/FROM customers WHERE id/.test(norm(sql))) return { rows: [{ customer_type: 'trader' }] };
    return { rows: [] };
  } });
  clearModules('src/modules/faxes/destination.service.js');
  const svc = require('../src/modules/faxes/destination.service');
  // اختبار التحويل عبر الدالة الداخلية: نعتمد على الكود المصدري لعدم كشف الدوال الداخلية
  const s = read('src/modules/faxes/destination.service.js');
  assert.match(s, /if \(pu !== u\) price = pu === 'ton' \? price \/ 20 : price \* 20;/);
  assert.match(s, /if \(special !== null && special > 0\)/);
  assert.strictEqual(typeof svc.suggestDestinationPrice, 'function');
});

test('G20-3) السعر المقترح يُملأ تلقائيًا إن لم تُدخله الإدارة (لا رفض) قبل إنشاء الطلب', () => {
  const s = read('src/modules/faxes/destination.service.js');
  assert.match(s, /if \(d\.destinationType === 'trader' && traderInfo && d\.productId && !\(Number\(d\.unitPrice\) > 0\)\) \{\s*const sug = await suggestDestinationPrice/);
});

test('G20-4) إشعار التاجر يحمل الصنف والكمية والسعر والمطلوب ويشير للطلب', () => {
  const s = read('src/modules/faxes/destination.service.js');
  assert.match(s, /يرجى السداد/);
  assert.match(s, /'ORDER_CREATED', 'orders', \$3\)/);
  assert.match(s, /شحنة أسمنت/);
});
