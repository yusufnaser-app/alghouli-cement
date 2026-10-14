'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '../src/modules/faxes/fax.service.js'), 'utf8');
const fnBody = (name) => {
  const i = src.indexOf(name);
  assert.ok(i >= 0, name);
  const next = src.indexOf('\nconst ', i + 10);
  return src.slice(i, next > 0 ? next : src.length);
};

test('G18-1) فحص "السائق لا يحمل فاكسًا آخر" يشمل الحالات المشغولة كلها', () => {
  const h = fnBody('const assertDriverFree');
  assert.match(h, /status IN \('USED', 'READY_FOR_TRANSIT'\)/);
  assert.match(h, /status IN \('APPROVED', 'ISSUED'\) AND f\.factory_entered_at IS NOT NULL/);
  assert.match(h, /f\.id <> \$2/);
  assert.match(h, /code = 'DRIVER_BUSY'/);
});

test('G18-2) دخول المصنع يقفل صف السائق ويفحص قبل التحديث داخل معاملة', () => {
  const b = fnBody('const enterFactory');
  assert.ok(b.indexOf('FOR UPDATE') < b.indexOf('assertDriverFree'));
  assert.ok(b.indexOf('assertDriverFree') < b.indexOf('UPDATE loading_faxes SET factory_entered_at'));
  assert.match(b, /COMMIT[\s\S]*ROLLBACK/);
});

test('G18-3) تأكيد التحميل يفحص أن السائق لا يحمل فاكسًا آخر', () => {
  const b = fnBody('const driverConfirmLoading');
  assert.match(b, /FOR UPDATE[\s\S]*assertDriverFree\(client, driverUserId, faxId\)/);
});

test('G18-4) التسليم يرفض فاكسًا بلا وجهات قبل أي إغلاق', () => {
  const b = fnBody('const driverMarkDelivered');
  assert.match(b, /COUNT\(\*\)::int AS n FROM delivery_destinations WHERE fax_id = \$1 AND status <> 'CANCELLED'/);
  assert.match(b, /code = 'NO_DESTINATIONS'/);
  assert.ok(b.indexOf('NO_DESTINATIONS') < b.indexOf("UPDATE loading_faxes \n") || b.indexOf('NO_DESTINATIONS') < b.indexOf('UPDATE loading_faxes'));
});
