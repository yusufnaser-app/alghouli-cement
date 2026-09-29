require('dotenv').config();
const { pool } = require('../src/config/db');

(async () => {
  const c = await pool.connect();
  try {
    // حقول سجل الرسائل حسب المواصفة (بند 45): القالب، رقم العملية، عدد المحاولات
    await c.query(`ALTER TABLE sms_messages ADD COLUMN IF NOT EXISTS template_key VARCHAR(60)`);
    await c.query(`ALTER TABLE sms_messages ADD COLUMN IF NOT EXISTS operation_id VARCHAR(100)`);
    await c.query(`ALTER TABLE sms_messages ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0`);
    await c.query(`ALTER TABLE sms_messages ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMP`);
    console.log('✅ sms_messages: template_key, operation_id, retry_count, last_attempt_at');
  } catch (e) {
    console.error('❌', e.message);
  } finally {
    c.release();
    await pool.end();
  }
})();
