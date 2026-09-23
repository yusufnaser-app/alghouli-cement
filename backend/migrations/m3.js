require('dotenv').config();
const { pool } = require('../src/config/db');
(async () => {
  const c = await pool.connect();
  try {
    await c.query(`
      CREATE TABLE IF NOT EXISTS sms_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id),
        phone VARCHAR(20) NOT NULL,
        message_type VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        provider VARCHAR(30),
        provider_message_id VARCHAR(100),
        status VARCHAR(20) DEFAULT 'pending',
        error_message TEXT,
        sent_at TIMESTAMP,
        delivered_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_sms_phone ON sms_messages(phone, created_at DESC)`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_sms_status ON sms_messages(status)`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_sms_type ON sms_messages(message_type)`);
    console.log('✅ sms_messages');
  } catch (e) { console.error('❌', e.message); }
  finally { c.release(); await pool.end(); }
})();
