'use strict';
require('dotenv').config();
const { pool } = require('../src/config/db');

/**
 * m31 — Part 27
 * - destination_trader_id: التاجر المستفيد من التسليم
 * - destination_confirmed_at: وقت تأكيد التسليم للتاجر
 */
(async () => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    console.log('🚀 m31 — destination_trader for loading_faxes');

    await c.query(`
      ALTER TABLE loading_faxes
      ADD COLUMN IF NOT EXISTS destination_trader_id UUID REFERENCES customers(id)
    `);
    console.log('✅ destination_trader_id');

    await c.query(`
      ALTER TABLE loading_faxes
      ADD COLUMN IF NOT EXISTS destination_confirmed_at TIMESTAMP
    `);
    console.log('✅ destination_confirmed_at');

    await c.query(`
      CREATE INDEX IF NOT EXISTS idx_loading_faxes_dest_trader
      ON loading_faxes(destination_trader_id)
    `);
    console.log('✅ index');

    await c.query('COMMIT');
    console.log('✅ m31 اكتمل');
  } catch (err) {
    await c.query('ROLLBACK');
    console.error('❌ m31 فشل:', err.message);
    process.exit(1);
  } finally {
    c.release();
    process.exit(0);
  }
})();
