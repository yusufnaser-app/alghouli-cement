'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

test('G12-1) استعلام الفاكس لا يقرأ f.delivered_at (العمود غير موجود في loading_faxes)', () => {
  const s = fs.readFileSync(path.join(__dirname, '../src/modules/documents/documents.service.js'), 'utf8');
  const loadFax = s.slice(s.indexOf('const loadFax'), s.indexOf('const faxNo'));
  assert.ok(!/f\.delivered_at/.test(loadFax), 'لا يجوز قراءة f.delivered_at من loading_faxes');
  assert.match(loadFax, /SELECT MAX\(x\.delivered_at\) FROM delivery_destinations x WHERE x\.fax_id = f\.id\) AS delivered_at/);
});
