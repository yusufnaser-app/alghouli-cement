'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { install, clearModules } = require('./helpers');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

// يستبدل fcm.service بتسجيل وهمي لكل إرسال
const loadWithFakeFcm = () => {
  const sent = [];
  const fcmPath = require.resolve('../src/services/fcm.service');
  require.cache[fcmPath] = { id: fcmPath, filename: fcmPath, loaded: true, exports: {
    sendPushNotification: async (token, title, body, data) => { sent.push({ token, title, body, data }); },
  } };
  install({ pool: {}, query: async () => ({ rows: [] }) });
  clearModules('src/services/push-listener.js');
  return { mod: require('../src/services/push-listener'), sent };
};
const dbWith = (row) => ({ query: async () => ({ rows: row ? [row] : [] }) });

test('G14-1) إشعار لمستخدم له توكن: Push بعنوان ونص ونوع وبيانات نصية فقط', async () => {
  const { mod, sent } = loadWithFakeFcm();
  const r = await mod.deliver(dbWith({ id: 'n1', title_ar: 'دفعة معتمدة', body_ar: 'تم اعتماد 500 ر.ي', type: 'PAYMENT', reference_type: 'payments', reference_id: 42, fcm_token: 'tok' }), 'n1');
  assert.deepStrictEqual(r, { sent: true });
  assert.strictEqual(sent[0].token, 'tok');
  assert.strictEqual(sent[0].title, 'دفعة معتمدة');
  assert.strictEqual(sent[0].data.reference_id, '42');
  for (const v of Object.values(sent[0].data)) assert.strictEqual(typeof v, 'string');
});

test('G14-2) مستخدم بلا توكن: لا إرسال ولا خطأ', async () => {
  const { mod, sent } = loadWithFakeFcm();
  const r = await mod.deliver(dbWith({ id: 'n1', title_ar: 't', body_ar: 'b', fcm_token: null }), 'n1');
  assert.deepStrictEqual(r, { sent: false, reason: 'no_token' });
  assert.strictEqual(sent.length, 0);
});

test('G14-3) إشعار غير موجود: لا إرسال', async () => {
  const { mod, sent } = loadWithFakeFcm();
  assert.deepStrictEqual(await mod.deliver(dbWith(null), 'x'), { sent: false, reason: 'not_found' });
  assert.strictEqual(sent.length, 0);
});

test('G14-4) الاستماع على القناة الصحيحة فقط', () => {
  assert.match(read('src/services/push-listener.js'), /const CHANNEL = 'user_notifications'/);
  assert.match(read('migrations/m40.js'), /pg_notify\('user_notifications', NEW\.id::text\)/);
});

test('G14-5) الخادم يشغّل المستمع دون أن يوقف نفسه عند فشله، وm40 آمن لإعادة التشغيل', () => {
  assert.match(read('src/server.js'), /startPushListener\(\)\s*\.catch/);
  const m = read('migrations/m40.js');
  assert.match(m, /CREATE OR REPLACE FUNCTION/);
  assert.match(m, /DROP TRIGGER IF EXISTS trg_notify_user_notification/);
});
