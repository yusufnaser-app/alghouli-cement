'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const load = () => { delete require.cache[require.resolve('../src/services/fcm.service')]; return require('../src/services/fcm.service'); };
const VALID = JSON.stringify({ type: 'service_account', project_id: 'p', client_email: 'a@p.iam.gserviceaccount.com', private_key: '-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----\n' });

test('G11-1) المفتاح من متغير البيئة يُقرأ دون ملف', () => {
  const old = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON = VALID;
  try {
    const acc = load().loadServiceAccount();
    assert.strictEqual(acc.project_id, 'p');
    assert.match(acc.private_key, /BEGIN PRIVATE KEY/);
  } finally { if (old === undefined) delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON; else process.env.FIREBASE_SERVICE_ACCOUNT_JSON = old; }
});

test('G11-2) JSON غير صالح أو مفتاح ناقص ⇒ خطأ واضح (لا يُطبع المفتاح)', () => {
  const old = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  try {
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = '{not json';
    assert.throws(() => load().loadServiceAccount(), /ليس JSON صالحًا/);
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({ project_id: 'p' });
    assert.throws(() => load().loadServiceAccount(), /ناقص/);
  } finally { if (old === undefined) delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON; else process.env.FIREBASE_SERVICE_ACCOUNT_JSON = old; }
});

const LOCAL_KEY = path.join(__dirname, '../firebase-secrets/service-account.json');
// إن وُجد المفتاح محليًا فلن يفشل التحميل أصلًا؛ الاختبار يُتخطى في هذه الحالة
test('G11-3) بلا متغير ولا ملف ⇒ خطأ (السلوك القديم يبقى)', { skip: fs.existsSync(LOCAL_KEY) ? 'المفتاح المحلي موجود' : false }, () => {
  const old = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  try { assert.throws(() => load().loadServiceAccount(), /Cannot find module|firebase-secrets/); }
  finally { if (old !== undefined) process.env.FIREBASE_SERVICE_ACCOUNT_JSON = old; }
});
