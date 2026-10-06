'use strict';
/**
 * تشخيص قراءة فقط (BEGIN READ ONLY) قبل دفعة B:
 *  1) طلبات PAYMENT_APPROVED + trader_pickup + fax_requested + fax_id IS NULL (المتوقع: 0)
 *     مع سبب العلّة: لا سائق/قاطرة؟ فاكس نشط غير مربوط؟
 *  2) طلبات لها أكثر من فاكس نشط (يجب أن تكون 0 لنجاح m37)
 *  3) فاكسات نشطة مربوطة بطلب لكن orders.fax_id مختلف/فارغ
 * الاستخدام: node scripts/check-pending-trader-orders.js   (رمز الخروج 1 إن وُجد ما يعيق m37)
 */
require('dotenv').config();
const { pool } = require('../src/config/db');

(async () => {
  const c = await pool.connect();
  let blocking = 0;
  try {
    await c.query('BEGIN READ ONLY');

    const pending = await c.query(
      `SELECT o.id::text AS id, o.order_number, o.trader_driver_id IS NOT NULL AS has_driver,
              o.trader_vehicle_id IS NOT NULL AS has_vehicle,
              EXISTS (SELECT 1 FROM loading_faxes f WHERE f.order_id = o.id AND f.status <> 'CANCELLED') AS has_active_fax
       FROM orders o
       WHERE o.status = 'PAYMENT_APPROVED' AND o.delivery_type = 'trader_pickup'
         AND o.fax_requested = TRUE AND o.fax_id IS NULL
       ORDER BY o.created_at`
    );
    console.log(`\n── 1) طلبات تاجر معتمدة بلا فاكس: ${pending.rows.length} (المتوقع 0)`);
    for (const r of pending.rows) {
      const why = !r.has_driver || !r.has_vehicle ? 'لا سائق/قاطرة' : r.has_active_fax ? 'فاكس نشط غير مربوط' : 'سبب غير معروف';
      console.log(`   ${r.order_number}  ${r.id}  → ${why}`);
    }

    const dups = await c.query(
      `SELECT order_id::text AS order_id, COUNT(*)::int AS cnt,
              array_agg(COALESCE(fax_number, id::text) ORDER BY requested_at) AS faxes
       FROM loading_faxes WHERE order_id IS NOT NULL AND status <> 'CANCELLED'
       GROUP BY order_id HAVING COUNT(*) > 1`
    );
    blocking += dups.rows.length;
    console.log(`\n── 2) طلبات لها أكثر من فاكس نشط: ${dups.rows.length} (يجب 0 قبل m37)`);
    for (const r of dups.rows) console.log(`   ${r.order_id} ×${r.cnt}  ${r.faxes.join(', ')}`);

    const mism = await c.query(
      `SELECT o.order_number, f.fax_number, f.status, o.fax_id::text AS order_fax_id, f.id::text AS fax_id
       FROM loading_faxes f JOIN orders o ON o.id = f.order_id
       WHERE f.status <> 'CANCELLED' AND o.fax_id IS DISTINCT FROM f.id`
    );
    console.log(`\n── 3) فاكس نشط وorders.fax_id لا يشير إليه: ${mism.rows.length} (معلوماتي)`);
    for (const r of mism.rows.slice(0, 30)) console.log(`   ${r.order_number}  ${r.fax_number || r.fax_id} [${r.status}]  orders.fax_id=${r.order_fax_id || 'NULL'}`);

    const dd = await c.query(
      `SELECT fulfills_order_id::text AS oid, COUNT(*)::int AS cnt
       FROM delivery_destinations WHERE fulfills_order_id IS NOT NULL
       GROUP BY fulfills_order_id HAVING COUNT(*) > 1`
    );
    console.log(`\n── 4) وجهات تكرّر fulfills_order_id: ${dd.rows.length} (يجب 0؛ مفروض بفهرس m35)`);

    await c.query('ROLLBACK');
    console.log(blocking ? '\n❌ يوجد ما يعيق m37 — عالجه أولًا' : '\n✅ لا شيء يعيق m37');
  } catch (e) {
    try { await c.query('ROLLBACK'); } catch (_) { /* تجاهل */ }
    console.error('❌ فشل التشخيص:', e.message);
    blocking = 1;
  } finally {
    c.release();
    await pool.end();
    process.exit(blocking ? 1 : 0);
  }
})();
