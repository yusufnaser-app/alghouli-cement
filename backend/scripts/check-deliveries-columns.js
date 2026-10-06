'use strict';
/**
 * فحص بنية جدول deliveries الفعلية (أعمدة + قيود + فهارس) وفهارس أعمدة الأرقام — قراءة فقط.
 * الاستخدام: node scripts/check-deliveries-columns.js
 */
require('dotenv').config();
const { pool } = require('../src/config/db');

(async () => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN READ ONLY');

    const ex = await c.query(`SELECT to_regclass('public.deliveries') AS t`);
    console.log('\n== وجود الجدول ==');
    console.log(ex.rows[0].t ? '✅ deliveries موجود' : '❌ deliveries غير موجود');

    console.log('\n== الأعمدة ==');
    const cols = await c.query(
      `SELECT column_name, data_type, character_maximum_length AS max_len,
              is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'deliveries'
       ORDER BY ordinal_position`
    );
    console.table(cols.rows);

    console.log('\n== القيود (PK / FK / UNIQUE / CHECK) على deliveries ==');
    const cons = await c.query(
      `SELECT conname, contype, pg_get_constraintdef(oid) AS definition
       FROM pg_constraint
       WHERE conrelid = to_regclass('public.deliveries')
       ORDER BY contype, conname`
    );
    console.table(cons.rows);

    console.log('\n== الفهارس على deliveries / loading_faxes / orders (أعمدة الأرقام) ==');
    const idx = await c.query(
      `SELECT tablename, indexname, indexdef
       FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename IN ('deliveries', 'loading_faxes', 'orders')
         AND (indexdef ILIKE '%trip_number%' OR indexdef ILIKE '%fax_number%'
              OR indexdef ILIKE '%order_number%' OR tablename = 'deliveries')
       ORDER BY tablename, indexname`
    );
    console.table(idx.rows);

    console.log('\n== قيد CHECK على حالات deliveries.status (إن وُجد) ==');
    const chk = await c.query(
      `SELECT conname, pg_get_constraintdef(oid) AS definition
       FROM pg_constraint
       WHERE conrelid = to_regclass('public.deliveries') AND contype = 'c'`
    );
    console.table(chk.rows);

    await c.query('ROLLBACK');
  } catch (e) {
    try { await c.query('ROLLBACK'); } catch (_) { /* ignore */ }
    console.error('❌ فشل الفحص:', e.message);
    process.exitCode = 2;
  } finally {
    c.release();
    await pool.end();
  }
})();
