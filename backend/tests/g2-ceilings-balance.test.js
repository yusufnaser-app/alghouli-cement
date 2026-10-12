'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { install, clearModules } = require('./helpers');

const norm = (s) => s.replace(/\s+/g, ' ').trim();
const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('G2-1) قائمة الاستثناءات بفلتر الحالة: الشرط مؤهَّل بـ ov.status', async () => {
  const seen = [];
  install({ pool: {}, query: async (sql, params = []) => { seen.push({ s: norm(sql), params }); return { rows: [] }; } });
  clearModules('src/modules/ceilings/ceilings.service.js');
  await require('../src/modules/ceilings/ceilings.service').listOverrides('PENDING');
  assert.match(seen[0].s, /WHERE ov\.status = \$1/);
  assert.deepStrictEqual(seen[0].params, ['PENDING']);
});

test('G2-2) قائمة الاستثناءات بدون فلتر لا تحمل شرطًا على status', async () => {
  const seen = [];
  install({ pool: {}, query: async (sql) => { seen.push(norm(sql)); return { rows: [] }; } });
  clearModules('src/modules/ceilings/ceilings.service.js');
  await require('../src/modules/ceilings/ceilings.service').listOverrides(undefined);
  assert.ok(!/WHERE/.test(seen[0]));
});

test('G2-3) قائمة العملاء تعيد current_balance بالريال من customer_balances (لا null)', () => {
  assert.match(read('src/modules/admin/admin.service.js'),
    /COALESCE\(\(SELECT cb\.balance FROM customer_balances cb WHERE cb\.customer_id = c\.id AND cb\.currency = 'YER'\), 0\) AS current_balance/);
});
