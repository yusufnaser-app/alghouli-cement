const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
  console.log('═══ driver_ledger — entry_date ═══');
  const c = await pool.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'driver_ledger'
      AND column_name IN ('entry_date', 'created_at', 'transaction_type')
    ORDER BY ordinal_position
  `);
  console.table(c.rows);

  console.log('\n═══ الفهرس التعبيري ═══');
  const idx = await pool.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'driver_ledger'
      AND indexname LIKE '%entry%'
  `);
  console.table(idx.rows);

  console.log('\n═══ driver_ledger — البيانات ═══');
  const rows = await pool.query(`
    SELECT id, driver_id, transaction_type, entry_date, created_at,
           COALESCE(entry_date, created_at) AS effective_date
    FROM driver_ledger
    ORDER BY created_at DESC
    LIMIT 10
  `);
  console.table(rows.rows);

  await pool.end();
})();
