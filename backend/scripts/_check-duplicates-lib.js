'use strict';
/**
 * مكتبة مشتركة لسكربتات فحص تكرار الأرقام — قراءة فقط.
 * كل شيء داخل BEGIN READ ONLY ثم ROLLBACK، فلا يمكن أن يغيّر السكربت أي بيانات.
 * رمز الخروج: 1 إن وُجدت أرقام مكررة، 0 إن لم توجد.
 */
require('dotenv').config();
const { pool } = require('../src/config/db');

const run = async ({ title, table, col, prefix }) => {
  const client = await pool.connect();
  let dupCount = 0;
  try {
    await client.query('BEGIN READ ONLY');
    console.log(`\n══════ ${title}: ${table}.${col} (البادئة ${prefix}-YYYY-N) ══════`);

    const total = await client.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(${col})::int AS with_number,
              (COUNT(*) - COUNT(${col}))::int AS null_number
       FROM ${table}`
    );
    const t = total.rows[0];
    console.log(`الصفوف: ${t.total} | بها رقم: ${t.with_number} | بلا رقم (NULL): ${t.null_number}`);

    const dups = await client.query(
      `SELECT ${col} AS num, COUNT(*)::int AS cnt, array_agg(id::text ORDER BY created_at) AS ids
       FROM ${table}
       WHERE ${col} IS NOT NULL
       GROUP BY ${col}
       HAVING COUNT(*) > 1
       ORDER BY ${col}`
    );
    dupCount = dups.rows.length;
    if (dupCount === 0) {
      console.log('✅ لا أرقام مكررة — آمن لإنشاء UNIQUE INDEX');
    } else {
      console.log(`❌ أرقام مكررة: ${dupCount}`);
      for (const r of dups.rows) console.log(`   ${r.num}  ×${r.cnt}  ids=${r.ids.join(', ')}`);
    }

    const re = `^${prefix}-[0-9]{4}-[0-9]+$`;
    const bad = await client.query(
      `SELECT id::text AS id, ${col} AS num FROM ${table}
       WHERE ${col} IS NOT NULL AND ${col} !~ $1
       ORDER BY created_at LIMIT 50`,
      [re]
    );
    if (bad.rows.length === 0) {
      console.log('✅ كل الأرقام بالصيغة المتوقعة');
    } else {
      console.log(`⚠️  أرقام بصيغة مختلفة (أول ${bad.rows.length}) — لا يعتمد عليها MAX:`);
      for (const r of bad.rows) console.log(`   ${r.num}  id=${r.id}`);
    }

    // فجوة بين العدد وأعلى رقم = علامة على أن توليد COUNT قد يصطدم (حذف/إلغاء/تزامن)
    const years = await client.query(
      `SELECT SUBSTRING(${col} FROM '^${prefix}-([0-9]{4})-') AS yr,
              COUNT(*)::int AS cnt,
              MAX(CAST(SUBSTRING(${col} FROM '[0-9]+$') AS INTEGER))::int AS max_seq
       FROM ${table}
       WHERE ${col} ~ $1
       GROUP BY 1 ORDER BY 1`,
      [re]
    );
    for (const y of years.rows) {
      const flag = y.cnt === y.max_seq ? '✅' : '⚠️ ';
      console.log(`${flag} سنة ${y.yr}: العدد=${y.cnt} | أعلى تسلسل=${y.max_seq}${y.cnt === y.max_seq ? '' : ' (فجوة — COUNT سيعيد توليد رقم موجود)'}`);
    }
    await client.query('ROLLBACK');
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    console.error('❌ فشل الفحص:', e.message);
    process.exitCode = 2;
  } finally {
    client.release();
    await pool.end();
  }
  if (dupCount > 0 && !process.exitCode) process.exitCode = 1;
};

module.exports = { run };
