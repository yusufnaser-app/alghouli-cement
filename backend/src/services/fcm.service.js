const admin = require('firebase-admin');
const path = require('path');

let initialized = false;

const initFirebase = () => {
  if (initialized) return;
  try {
    const serviceAccount = require(path.join(__dirname, '../../firebase-secrets/service-account.json'));
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

module.exports = { sendPushNotification, initFirebase };
