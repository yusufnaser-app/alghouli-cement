const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
  console.log('═══ order_ceilings — الأعمدة ═══');
  const c = await pool.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'order_ceilings'
    ORDER BY ordinal_position
  `);
  console.table(c.rows);

  console.log('\n═══ القيود على order_ceilings (يجب ألا يوجد CHECK m22 القديم) ═══');
  const cons = await pool.query(`
    SELECT conname, contype, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = to_regclass('public.order_ceilings')
    ORDER BY contype, conname
  `);
  console.table(cons.rows);

  console.log('\n═══ الفهارس على driver_ledger ═══');
  const idx = await pool.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'driver_ledger'
    ORDER BY indexname
  `);
  console.table(idx.rows);

  console.log('\n═══ customers — ceiling_action ═══');
  const cc = await pool.query(`
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_name = 'customers'
      AND column_name LIKE 'ceiling%'
    ORDER BY ordinal_position
  `);
  console.table(cc.rows);

  await pool.end();
})();
