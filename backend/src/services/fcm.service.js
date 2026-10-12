const path = require('path');

// الواجهة المعيارية لـ firebase-admin (الإصدارات الحديثة لم تعد تُصدّر واجهة الاعتماد القديمة).
// تُحمَّل عند التهيئة فقط، فالخادم يعمل بدونها إن لم تُهيَّأ.
let messagingApi = null;
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
    const { initializeApp, cert } = require('firebase-admin/app');
    messagingApi = require('firebase-admin/messaging');
    const serviceAccount = loadServiceAccount();
    initializeApp({
      credential: cert(serviceAccount),
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
    const response = await messagingApi.getMessaging().send(message);
    console.log('✅ Push sent:', response);
    return response;
  } catch (e) {
    console.error('❌ Push failed:', e.message);
    return null;
  }
};

module.exports = { sendPushNotification, initFirebase, loadServiceAccount };
