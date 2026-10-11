'use strict';
require('dotenv').config();
const { pool } = require('../src/config/db');

// m39 — F2: تاريخ القيد في دفتر السائق (entry_date) ليدعم تاريخ الرصيد الافتتاحي والترتيب الصحيح للكشف.
// ملاحظة مهمة: driver_ledger محمي بـ trigger (m29) يمنع UPDATE/DELETE، لذلك لا نُعبّئ القيم القديمة.
// القيم القديمة تبقى NULL ويُقرأ التاريخ الفعلي دائمًا بـ COALESCE(entry_date, created_at).
(async () => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    console.log('🚀 m39 — driver_ledger.entry_date');
    await c.query(`ALTER TABLE driver_ledger ADD COLUMN IF NOT EXISTS entry_date TIMESTAMP`);
    await c.query(
      `CREATE INDEX IF NOT EXISTS idx_driver_ledger_entry
       ON driver_ledger (driver_id, (COALESCE(entry_date, created_at)) DESC)`
    );
    await c.query('COMMIT');
    console.log('✅ m39 اكتمل');
  } catch (err) {
    await c.query('ROLLBACK');
    console.error('❌ m39 فشل:', err.message);
    process.exit(1);
  } finally {
    c.release();
    process.exit(0);
  }
})();
