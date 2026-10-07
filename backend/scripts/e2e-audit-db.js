'use strict';
/**
 * D1 — تدقيق ثوابت دورتي المؤسسة والتاجر على DB (قراءة فقط: BEGIN READ ONLY ثم ROLLBACK).
 * يتحقق من نتائج A1–A4 وB على البيانات الحية. fail = كسر ثابت (رمز الخروج 1)، warn = يستحق نظرة، info = معلومة.
 * الاستخدام: node scripts/e2e-audit-db.js
 */
require('dotenv').config();
const { pool } = require('../src/config/db');

const BAGS = `(x.quantity * CASE WHEN x.unit = 'ton' THEN 20 ELSE 1 END)`;

const CHECKS = [
  { id: 'I1', sev: 'fail', title: 'طلب له أكثر من فاكس نشط (يمنعه m37)',
    sql: `SELECT order_id::text AS order_id, COUNT(*)::int AS n FROM loading_faxes
          WHERE order_id IS NOT NULL AND status <> 'CANCELLED' GROUP BY order_id HAVING COUNT(*) > 1` },
  { id: 'I2', sev: 'fail', title: 'فاكس نشط مربوط بطلب لكن orders.fax_id لا يشير إليه',
    sql: `SELECT o.order_number, f.fax_number, f.status FROM loading_faxes f JOIN orders o ON o.id = f.order_id
          WHERE f.status <> 'CANCELLED' AND o.fax_id IS DISTINCT FROM f.id` },
  { id: 'I3', sev: 'fail', title: 'فاكس تاجر/طلب له أكثر من وجهة مرتبطة بطلبه الأصلي',
    sql: `SELECT f.fax_number, COUNT(*)::int AS n FROM loading_faxes f
          JOIN delivery_destinations d ON d.fax_id = f.id AND d.fulfills_order_id = f.order_id AND d.status <> 'CANCELLED'
          WHERE f.order_id IS NOT NULL GROUP BY f.id, f.fax_number HAVING COUNT(*) > 1` },
  { id: 'I4', sev: 'fail', title: 'فاكس DELIVERED وله وجهات PENDING',
    sql: `SELECT f.fax_number, COUNT(*)::int AS pending FROM loading_faxes f
          JOIN delivery_destinations d ON d.fax_id = f.id AND d.status = 'PENDING'
          WHERE f.status = 'DELIVERED' GROUP BY f.id, f.fax_number` },
  { id: 'I5', sev: 'fail', title: 'وجهة DELIVERED مرتبطة بطلب، والطلب ليس DELIVERED',
    sql: `SELECT o.order_number, o.status AS order_status, f.fax_number FROM delivery_destinations d
          JOIN orders o ON o.id = d.fulfills_order_id JOIN loading_faxes f ON f.id = d.fax_id
          WHERE d.status = 'DELIVERED' AND o.status <> 'DELIVERED'` },
  { id: 'I6', sev: 'fail', title: 'مجموع وجهات غير الملغاة (بالأكياس) يتجاوز سعة الفاكس',
    sql: `SELECT f.fax_number, SUM(${BAGS})::numeric AS dest_bags,
                 COALESCE(f.loaded_quantity, f.approved_quantity, f.requested_quantity) AS capacity
          FROM loading_faxes f JOIN delivery_destinations x ON x.fax_id = f.id
          WHERE x.status <> 'CANCELLED' AND f.status NOT IN ('CANCELLED')
          GROUP BY f.id, f.fax_number, f.loaded_quantity, f.approved_quantity, f.requested_quantity
          HAVING SUM(${BAGS}) > COALESCE(f.loaded_quantity, f.approved_quantity, f.requested_quantity) + 0.01` },
  { id: 'I7', sev: 'fail', title: 'فاكس نشط (ISSUED/USED/READY_FOR_TRANSIT) بلا رقم',
    sql: `SELECT id::text AS fax_id, status FROM loading_faxes
          WHERE status IN ('ISSUED','USED','READY_FOR_TRANSIT') AND fax_number IS NULL` },
  { id: 'I7b', sev: 'info', title: 'فاكس DELIVERED قديم بلا رقم (مقبول — تاريخي)',
    sql: `SELECT id::text AS fax_id FROM loading_faxes WHERE status = 'DELIVERED' AND fax_number IS NULL` },
  { id: 'I8', sev: 'fail', title: 'طلب تاجر تقدّم (PREPARING/LOADED) بلا فاكس',
    sql: `SELECT order_number, status FROM orders
          WHERE delivery_type = 'trader_pickup' AND fax_requested = TRUE
            AND status IN ('PREPARING','LOADED') AND fax_id IS NULL` },
  { id: 'I9', sev: 'fail', title: 'طلب تاجر PAYMENT_APPROVED عالق بلا فاكس (fax_requested)',
    sql: `SELECT order_number, trader_driver_id IS NOT NULL AS has_driver, trader_vehicle_id IS NOT NULL AS has_vehicle
          FROM orders WHERE status = 'PAYMENT_APPROVED' AND delivery_type = 'trader_pickup'
            AND fax_requested = TRUE AND fax_id IS NULL` },
  { id: 'I10', sev: 'warn', title: 'طلب DELIVERED وفاكسه النشط ليس DELIVERED',
    sql: `SELECT o.order_number, f.fax_number, f.status FROM orders o JOIN loading_faxes f ON f.id = o.fax_id
          WHERE o.status = 'DELIVERED' AND f.status NOT IN ('DELIVERED','CANCELLED')` },
  { id: 'I11', sev: 'warn', title: 'فاكس مؤسسة USED عالق: له وجهات لكن لم يُسعَّر',
    sql: `SELECT f.fax_number, f.used_at FROM loading_faxes f
          WHERE f.status = 'USED' AND COALESCE(f.is_managed_by_institution, TRUE) = TRUE
            AND f.transport_rate IS NULL AND EXISTS (SELECT 1 FROM delivery_destinations d WHERE d.fax_id = f.id)
            AND f.used_at < NOW() - INTERVAL '24 hours'` },
  { id: 'I12', sev: 'warn', title: 'أحداث fax.blocked_* خلال 7 أيام (طلبات تعذّر إنشاء فاكسها)',
    sql: `SELECT event_type, entity_id::text AS order_id, payload->>'reason' AS reason, created_at
          FROM automation_events WHERE event_type LIKE 'fax.blocked%' AND created_at > NOW() - INTERVAL '7 days'
          ORDER BY created_at DESC` },
  { id: 'I13', sev: 'info', title: 'فاكسات قديمة (قبل B) مرتبطة بطلب وبلا وجهة تلقائية',
    sql: `SELECT f.fax_number, f.status FROM loading_faxes f
          WHERE f.order_id IS NOT NULL AND f.status <> 'CANCELLED'
            AND NOT EXISTS (SELECT 1 FROM delivery_destinations d WHERE d.fax_id = f.id AND d.fulfills_order_id = f.order_id)` },
];

(async () => {
  const c = await pool.connect();
  let fails = 0; let warns = 0;
  try {
    await c.query('BEGIN READ ONLY');
    for (const k of CHECKS) {
      let rows;
      try { rows = (await c.query(k.sql)).rows; }
      catch (e) { console.log(`❌ ${k.id} خطأ استعلام: ${e.message}`); fails++; await c.query('ROLLBACK'); await c.query('BEGIN READ ONLY'); continue; }
      const icon = rows.length === 0 ? '✅' : k.sev === 'fail' ? '❌' : k.sev === 'warn' ? '⚠️ ' : 'ℹ️ ';
      console.log(`${icon} ${k.id} ${k.title}: ${rows.length}`);
      if (rows.length) {
        if (k.sev === 'fail') fails++; else if (k.sev === 'warn') warns++;
        for (const r of rows.slice(0, 8)) console.log('     ', JSON.stringify(r));
        if (rows.length > 8) console.log(`      … و${rows.length - 8} أخرى`);
      }
    }
    await c.query('ROLLBACK');
    console.log(`\nالخلاصة: ${fails} فشل، ${warns} تحذير`);
  } catch (e) {
    console.error('❌ فشل التدقيق:', e.message); fails = 1;
    try { await c.query('ROLLBACK'); } catch (_) { /* تجاهل */ }
  } finally {
    c.release(); await pool.end(); process.exit(fails ? 1 : 0);
  }
})();
