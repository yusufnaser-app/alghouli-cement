'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

test('G13-1) الواجهة المعيارية: firebase-admin/app للتهيئة وfirebase-admin/messaging للإرسال', () => {
  const s = fs.readFileSync(path.join(__dirname, '../src/services/fcm.service.js'), 'utf8');
  assert.match(s, /require\('firebase-admin\/app'\)/);
  assert.match(s, /require\('firebase-admin\/messaging'\)/);
  assert.match(s, /initializeApp\(\{\s*credential: cert\(serviceAccount\)/);
  assert.match(s, /messagingApi\.getMessaging\(\)\.send\(message\)/);
});

test('G13-2) لا استخدام لواجهة admin.credential القديمة', () => {
  const s = fs.readFileSync(path.join(__dirname, '../src/services/fcm.service.js'), 'utf8');
  assert.ok(!/admin\.credential|admin\.messaging\(/.test(s));
});
