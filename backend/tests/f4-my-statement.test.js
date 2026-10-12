'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { install, clearModules } = require('./helpers');

const norm = (s) => s.replace(/\s+/g, ' ').trim();
const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('F4-1) كشف العميل الشخصي: مستخدم بلا حساب عميل ⇒ 404 NO_CUSTOMER_ACCOUNT، ويُبحث بمعرّف المستخدم لا بمعامل الطلب', async () => {
  const seen = [];
  const query = async (sql, params = []) => { seen.push({ s: norm(sql), params }); return { rows: [] }; };
  install({ pool: {}, query });
  clearModules('src/modules/documents/documents.service.js');
  const svc = require('../src/modules/documents/documents.service');
  await assert.rejects(svc.myCustomerStatement({ userId: 'u-customer', roles: ['customer'], perms: new Set(['statements.view_own']) }, {}),
    { code: 'NO_CUSTOMER_ACCOUNT', status: 404 });
  assert.match(seen[0].s, /^SELECT id FROM customers WHERE user_id = \$1/);
  assert.deepStrictEqual(seen[0].params, ['u-customer']);
});

test('F4-2) المسار مركّب قبل /customer/:id وبلا معامل معرّف، والمصادقة موجودة', () => {
  const r = read('src/modules/documents/documents.routes.js');
  assert.match(r, /router\.get\('\/my\/statement', c\.myStatement\)/);
  assert.ok(r.indexOf("'/my/statement'") < r.indexOf("'/customer/:customerId/statement'"));
  assert.match(r, /router\.use\(authenticate\)/);
  assert.match(read('src/modules/documents/documents.controller.js'), /svc\.myCustomerStatement\(await ctxOf\(req\)/);
});
