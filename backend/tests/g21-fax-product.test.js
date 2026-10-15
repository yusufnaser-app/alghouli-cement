'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { clearModules } = require('./helpers');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const norm = (s) => s.replace(/\s+/g, ' ').trim();

test('G21-1) m42: عمود product_id بـ IF NOT EXISTS ومرجعيّ لجدول المنتجات', () => {
  const m = read('migrations/m42.js');
  assert.match(m, /ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products\(id\)/);
});

test('G21-2) الصنف يجب أن يتبع المصنع: منتج لمصنع آخر ⇒ 422 PRODUCT_NOT_OF_FACTORY', async () => {
  const { assertProductOfFactory } = require('../src/modules/faxes/product-guard');
  const q = { query: async (sql, p) => { assert.match(norm(sql), /WHERE id = \$1 AND source_id = \$2/); return { rows: [] }; } };
  await assert.rejects(assertProductOfFactory(q, 'p1', 'f1'), { code: 'PRODUCT_NOT_OF_FACTORY', status: 422 });
});

test('G21-3) صنف مطابق للمصنع يمر', async () => {
  const { assertProductOfFactory } = require('../src/modules/faxes/product-guard');
  const q = { query: async () => ({ rows: [{ id: 'p1' }] }) };
  await assertProductOfFactory(q, 'p1', 'f1');
});

test('G21-4) الفاكس بلا صنف مرفوض (PRODUCT_REQUIRED)', async () => {
  const { assertProductOfFactory } = require('../src/modules/faxes/product-guard');
  await assert.rejects(assertProductOfFactory({ query: async () => ({ rows: [] }) }, null, 'f1'), { code: 'PRODUCT_REQUIRED', status: 422 });
});

test('G21-5) طلب السائق والإنشاء الإداري والجماعي يتحققون من الصنف قبل الإدراج', () => {
  const s = read('src/modules/faxes/fax.service.js');
  const req = s.slice(s.indexOf('const requestFax = async'), s.indexOf('const requestFaxByStaff'));
  assert.ok(req.indexOf('assertProductOfFactory') < req.indexOf('INSERT INTO loading_faxes'));
  const st = s.slice(s.indexOf('const requestFaxByStaff'));
  assert.ok(st.indexOf('assertProductOfFactory') < st.indexOf('INSERT INTO loading_faxes'));
  const b = read('src/modules/faxes/bulk-fax.service.js');
  assert.ok(b.indexOf('assertProductOfFactory(client, item.productId') < b.indexOf('INSERT INTO loading_faxes'));
});

test('G21-6) الوجهة ترث صنف الفاكس، وتُرفض عند عدم التطابق', () => {
  const s = read('src/modules/faxes/destination.service.js');
  assert.match(s, /const faxRow = \(await client\.query\(`SELECT factory_id, product_id FROM loading_faxes WHERE id = \$1`/);
  assert.match(s, /if \(!d\.productId\) d\.productId = faxRow\.product_id/);
  assert.match(s, /code[^\n]*PRODUCT_MISMATCH|PRODUCT_MISMATCH/);
});

test('G21-7) المخططات تقبل الصنف (وإلا يُحذف صامتًا)', () => {
  assert.match(read('src/modules/faxes/fax.controller.js'), /productId: z\.string\(\)\.uuid\(\)/);
  assert.match(read('src/modules/faxes/bulk-fax.controller.js'), /productId: z\.string\(\)\.uuid\(\)/);
});
