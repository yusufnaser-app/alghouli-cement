const path = require('path');

// تحميل firebase-admin عند التهيئة فقط (الخادم يعمل بدونه إن لم يُهيَّأ)
let admin = null;
let initialized = false;

/**
 * مفتاح حساب الخدمة: من متغير البيئة FIREBASE_SERVICE_ACCOUNT_JSON أولًا (الأسلم على Render)،
 * ثم من الملف المحلي إن وُجد. لا يُطبع المفتاح في السجلات أبدًا.
 */
const loadServiceAccount = () => {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (raw && raw.trim()) {
    let parsed;
    try { parsed = JSON.parse(raw); } catch (_) { throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON ليس JSON صالحًا'); }
    if (!parsed.private_key || !parsed.client_email) throw new Error('المفتاح في FIREBASE_SERVICE_ACCOUNT_JSON ناقص');
    return parsed;
  }
  return require(path.join(__dirname, '../../firebase-secrets/service-account.json'));
};

const initFirebase = () => {
  if (initialized) return;
  try {
    admin = require('firebase-admin');
    const serviceAccount = loadServiceAccount();
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    initialized = true;
    console.log('✅ Firebase Admin initialized');
  } catch (e) {
    console.error('❌ Firebase init failed:', e.message);
  }
};

const sendPushNotification = async (fcmToken, title, body, data = {}) => {
  if (!fcmToken) {
    console.log('⚠️ No FCM token — skipping');
    return null;
  }

  initFirebase();
  if (!initialized) return null;

  const message = {
    notification: { title, body },
    token: fcmToken,
    data: Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, String(v)])
    ),
    android: {
      priority: 'high',
      notification: {
        channelId: 'alghouli_default',
        sound: 'default',
      },
    },
  };

  try {
    const response = await admin.messaging().send(message);
    console.log('✅ Push sent:', response);
    return response;
  } catch (e) {
    console.error('❌ Push failed:', e.message);
    return null;
  }
};

module.exports = { sendPushNotification, initFirebase, loadServiceAccount };
