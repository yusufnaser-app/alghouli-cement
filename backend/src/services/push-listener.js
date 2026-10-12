'use strict';
/**
 * مستمع الإشعارات الفورية: يستقبل إشارة pg_notify عند كل إدراج في notifications (m40)
 * ويرسل Push للجهاز المسجَّل للمستخدم. الإشارة تصل بعد COMMIT فقط، فلا Push لعملية تراجعت.
 * يحتاج اتصالًا مباشرًا بقاعدة البيانات (DIRECT_DATABASE_URL إن وُجد، وإلا DATABASE_URL):
 * المجمّع (pooler) في وضع transaction لا يدعم LISTEN.
 * فشل المستمع لا يوقف الخادم، ويعيد الاتصال تلقائيًا.
 */
const { sendPushNotification } = require('./fcm.service');

const CHANNEL = 'user_notifications';
const RECONNECT_MS = 5000;

let client = null;
let stopped = false;
let reconnecting = false;

/** يرسل Push لإشعار واحد. يُرجع حالة الإرسال (لا يرمي عادة). */
const deliver = async (db, notificationId) => {
  const r = await db.query(
    `SELECT n.id, n.title_ar, n.body_ar, n.type, n.reference_type, n.reference_id, u.fcm_token
     FROM notifications n JOIN users u ON u.id = n.user_id
     WHERE n.id = $1`,
    [notificationId]
  );
  const row = r.rows[0];
  if (!row) return { sent: false, reason: 'not_found' };
  if (!row.fcm_token) return { sent: false, reason: 'no_token' };
  // بيانات FCM يجب أن تكون نصوصًا فقط
  await sendPushNotification(row.fcm_token, row.title_ar || '', row.body_ar || '', {
    notification_id: String(row.id),
    type: String(row.type || ''),
    reference_type: String(row.reference_type || ''),
    reference_id: String(row.reference_id || ''),
  });
  return { sent: true };
};

const connectionString = () => process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || '';

const start = async () => {
  if (stopped) return;
  const { Client } = require('pg'); // يُحمَّل عند التشغيل فقط
  const { query } = require('../config/db');
  const url = connectionString();
  const isLocal = url.includes('localhost') || url.includes('127.0.0.1');
  client = new Client({ connectionString: url, ssl: isLocal ? false : { rejectUnauthorized: false } });

  client.on('notification', (msg) => {
    if (msg.channel !== CHANNEL || !msg.payload) return;
    deliver({ query: (t, p) => require('../config/db').query(t, p) }, msg.payload)
      .catch((e) => console.error('❌ إرسال Push فشل:', e.message));
  });
  const scheduleReconnect = (why) => {
    if (stopped || reconnecting) return;
    reconnecting = true;
    console.error('⚠️ انقطع مستمع الإشعارات، إعادة الاتصال:', why);
    setTimeout(() => {
      reconnecting = false;
      try { client && client.removeAllListeners(); client && client.end().catch(() => {}); } catch (_) { /* تجاهل */ }
      start().catch((e) => scheduleReconnect(e.message));
    }, RECONNECT_MS);
  };
  client.on('error', (e) => scheduleReconnect(e.message));
  client.on('end', () => scheduleReconnect('connection ended'));

  await client.connect();
  await client.query(`LISTEN ${CHANNEL}`);
  console.log('✅ مستمع الإشعارات الفورية يعمل');
};

const startPushListener = () => start();

const stopPushListener = async () => {
  stopped = true;
  if (client) await client.end().catch(() => {});
};

module.exports = { deliver, startPushListener, stopPushListener, CHANNEL };
