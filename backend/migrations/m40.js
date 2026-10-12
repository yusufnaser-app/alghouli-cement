'use strict';
require('dotenv').config();
const { pool } = require('../src/config/db');

// m40 — كل إشعار يُدرج في جدول notifications يرسل إشارة pg_notify بعد الـ COMMIT.
// المستمع في الخادم (push-listener.js) يلتقطها ويرسل Push للمستخدم.
// آمن لإعادة التشغيل: CREATE OR REPLACE + DROP TRIGGER IF EXISTS.
(async () => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    console.log('🚀 m40 — إشارة الإشعارات الفورية');
    await c.query(`
      CREATE OR REPLACE FUNCTION notify_user_notification() RETURNS trigger AS $$
      BEGIN
        PERFORM pg_notify('user_notifications', NEW.id::text);
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql`);
    await c.query(`DROP TRIGGER IF EXISTS trg_notify_user_notification ON notifications`);
    await c.query(`CREATE TRIGGER trg_notify_user_notification AFTER INSERT ON notifications
      FOR EACH ROW EXECUTE FUNCTION notify_user_notification()`);
    await c.query('COMMIT');
    console.log('✅ m40 اكتمل');
  } catch (err) {
    await c.query('ROLLBACK');
    console.error('❌ m40 فشل:', err.message);
    process.exit(1);
  } finally {
    c.release();
    process.exit(0);
  }
})();
