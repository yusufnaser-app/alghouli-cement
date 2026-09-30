require('dotenv').config();
const { pool } = require('../src/config/db');

(async () => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query("CREATE INDEX IF NOT EXISTS idx_notifications_user_sent ON notifications(user_id, sent_at DESC)");
    await c.query("CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = FALSE");
    await c.query("CREATE INDEX IF NOT EXISTS idx_notifications_reference ON notifications(reference_type, reference_id)");
    await c.query('COMMIT');
    console.log('✅ m28 — notifications indexes created');
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('❌ m28:', e.message);
    process.exitCode = 1;
  } finally {
    c.release();
    await pool.end();
  }
})();
