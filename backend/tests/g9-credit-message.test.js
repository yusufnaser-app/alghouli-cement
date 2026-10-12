'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('G9-1) رسالة تجاوز الائتمان واضحة للعميل: متجاوز + المتاح + يرجى السداد', () => {
  const s = read('src/modules/orders/orders.service.js');
  assert.match(s, /متجاوز الحد الائتماني المسموح به/);
  assert.match(s, /يرجى سداد المستحقات أولًا/);
  assert.match(s, /code = 'CREDIT_LIMIT_EXCEEDED'|e\.code = 'CREDIT_LIMIT_EXCEEDED'/);
});

test('G9-2) الرمز CREDIT_LIMIT_EXCEEDED محفوظ (التطبيق يعتمد عليه)', () => {
  assert.match(read('src/modules/orders/orders.service.js'), /CREDIT_LIMIT_EXCEEDED/);
});
