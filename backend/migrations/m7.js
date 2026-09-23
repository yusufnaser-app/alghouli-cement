require('dotenv').config();
const { pool } = require('../src/config/db');
(async () => {
  const c = await pool.connect();
  try {
    await c.query(`
      CREATE TABLE IF NOT EXISTS automation_rules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(200) NOT NULL,
        event VARCHAR(100) NOT NULL,
        condition_json JSONB,
        action VARCHAR(100) NOT NULL,
        action_params JSONB,
        delay_minutes INTEGER DEFAULT 0,
        enabled BOOLEAN DEFAULT TRUE,
        priority INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await c.query(`
      CREATE TABLE IF NOT EXISTS automation_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_type VARCHAR(100) NOT NULL,
        entity_type VARCHAR(50),
        entity_id UUID,
        payload JSONB,
        processed BOOLEAN DEFAULT FALSE,
        processed_at TIMESTAMP,
        error TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_auto_events_unprocessed ON automation_events(processed, created_at)`);
    console.log('✅ automation_rules + automation_events');
  } catch (e) { console.error('❌', e.message); }
  finally { c.release(); await pool.end(); }
})();
