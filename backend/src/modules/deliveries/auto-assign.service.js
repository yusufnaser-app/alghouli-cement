const { pool } = require('../../config/db');
const { toMinor } = require('../accounting/accounting.engine');
const { capacitySql, usedBagsSql, bagsH } = require('./trip-capacity');

// الحالات التي تقبل وجهات جديدة (DELIVERED/CANCELLED وأي حالة أخرى مستبعدة بحكم القائمة)
const ELIGIBLE_STATUSES = ['REQUESTED', 'APPROVED', 'ISSUED', 'USED', 'READY_FOR_TRANSIT'];

const norm = (v) => String(v || '').trim();

/** تقسيم خط السير على → أو , أو ، أو - ومطابقة عنصر كامل (لا substring). */
const routeHasGovernorate = (route, governorate) => {
  const g = norm(governorate);
  if (!g || !route) return false;
  return String(route).split(/[→,،\-]/).map(norm).filter(Boolean).includes(g);
};

/** نقاط ملاءمة الفاكس لمحافظة الطلب؛ null = غير مناسب. */
const scoreTrip = (fax, governorate) => {
  const g = norm(governorate);
  if (norm(fax.delivery_governorate) === g && g) return { score: 100, reason: 'نفس المحافظة' };
  if (fax.has_dest_in_gov) return { score: 90, reason: 'وجهة قائمة بنفس المحافظة' };
  if (routeHasGovernorate(fax.route, g)) return { score: 80, reason: 'المحافظة ضمن خط السير' };
  if (!norm(fax.delivery_governorate)) return { score: 50, reason: 'فاكس بلا محافظة محددة' };
  return null;
};

/** أفضل رحلة: الأعلى نقاطًا ثم الأقدم (ترتيب الصفوف requested_at ASC)، بشرط كفاية المتبقي. */
const pickTrip = (rows, governorate, needH) => {
  const ranked = [];
  rows.forEach((r, i) => {
    const sc = scoreTrip(r, governorate);
    if (!sc) return;
    if (toMinor(r.capacity) - toMinor(r.used_bags) < needH) return;
    ranked.push({ trip: r, ...sc, i });
  });
  ranked.sort((a, b) => b.score - a.score || a.i - b.i);
  return ranked[0] || null;
};

/**
 * تكليف طلب مدفوع على رحلة قائمة (إضافة وجهة للفاكس).
 * - فقط توصيل المؤسسة (alghouli_delivery)؛ طلبات قاطرة التاجر لا تدخل هنا.
 * - لا ينشئ فاكسًا ولا يختار سائقًا: اختيار السائق والقاطرة قرار الموظف (assign اليدوي).
 * - Idempotent: الطلب المكلَّف مسبقًا يُعاد كما هو. الفهرس الفريد يمنع التكرار.
 * يُعيد { assigned, reason?, fax_id?, fax_number?, destination_id? }
 */
const autoAssignToTrip = async (orderId, userId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const o = await client.query(`
      SELECT o.id, o.order_number, o.status, o.delivery_type, o.customer_id, o.fax_id,
               COALESCE(a.governorate, c.governorate) AS governorate,
               COALESCE(a.area, c.area) AS area,
               a.address_text,
             oi.quantity, oi.unit, oi.source_id
      FROM orders o
        JOIN customers c ON c.id = o.customer_id
        LEFT JOIN customer_addresses a ON a.id = o.address_id
      LEFT JOIN LATERAL (SELECT quantity, unit, source_id FROM order_items
                         WHERE order_id = o.id ORDER BY id ASC LIMIT 1) oi ON TRUE
      WHERE o.id = $1 FOR UPDATE OF o
    `, [orderId]);
    if (!o.rows.length) { const e = new Error('الطلب غير موجود'); e.status = 404; throw e; }
    const order = o.rows[0];

    const done = await client.query(
      `SELECT dd.id, dd.fax_id, f.fax_number FROM delivery_destinations dd
       JOIN loading_faxes f ON f.id = dd.fax_id WHERE dd.fulfills_order_id = $1`, [orderId]);
    if (done.rows.length) {
      await client.query('ROLLBACK');
      return { assigned: true, already: true, fax_id: done.rows[0].fax_id, fax_number: done.rows[0].fax_number, destination_id: done.rows[0].id };
    }
    if (order.status !== 'PAYMENT_APPROVED') { await client.query('ROLLBACK'); return { assigned: false, code: 'ORDER_NOT_APPROVED', reason: 'الطلب ليس بحالة PAYMENT_APPROVED' }; }
    if (order.delivery_type !== 'alghouli_delivery') { await client.query('ROLLBACK'); return { assigned: false, code: 'NOT_INSTITUTION_DELIVERY', reason: 'ليس توصيل مؤسسة' }; }
    if (order.fax_id) { await client.query('ROLLBACK'); return { assigned: false, code: 'ORDER_HAS_FAX', reason: 'للطلب فاكس مرتبط' }; }
    if (!order.source_id || !(Number(order.quantity) > 0) || !order.governorate) {
      await client.query('ROLLBACK'); return { assigned: false, code: 'ORDER_DATA_INCOMPLETE', reason: 'بيانات الطلب ناقصة (مصنع/كمية/محافظة)' };
    }

    // أفضل رحلة بالنقاط: نفس المصنع (شرط صارم) + حالة مناسبة + متبقٍ كافٍ بالأكياس
    const gov = norm(order.governorate);
    const t = await client.query(`
      SELECT f.id, f.fax_number, f.driver_id, f.status, f.delivery_governorate, f.route, f.requested_at,
             ${capacitySql('f')} AS capacity,
             ${usedBagsSql('f')} AS used_bags,
             EXISTS (SELECT 1 FROM delivery_destinations dg
                     WHERE dg.fax_id = f.id AND dg.status <> 'CANCELLED'
                       AND TRIM(dg.governorate) = $2) AS has_dest_in_gov
      FROM loading_faxes f
      WHERE f.status IN (${ELIGIBLE_STATUSES.map((x) => `'${x}'`).join(',')})
        AND f.factory_id = $1
        AND COALESCE(f.is_managed_by_institution, TRUE) = TRUE
      ORDER BY f.requested_at ASC
      FOR UPDATE OF f
    `, [order.source_id, gov]);
    const best = pickTrip(t.rows, gov, bagsH(order.quantity, order.unit));
    if (!best) { await client.query('ROLLBACK'); return { assigned: false, code: 'NO_MATCHING_TRIP', reason: 'لا توجد رحلة مناسبة' }; }
    const trip = best.trip;

    const sort = await client.query(`SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM delivery_destinations WHERE fax_id = $1`, [trip.id]);
    const cust = await client.query(`SELECT u.full_name, u.phone, u.id AS user_id FROM customers c JOIN users u ON u.id = c.user_id WHERE c.id = $1`, [order.customer_id]);
    const cu = cust.rows[0] || {};
    const dest = await client.query(`
      INSERT INTO delivery_destinations
        (fax_id, destination_type, trader_id, quantity, unit, label, governorate, area, address_text,
         contact_phone, contact_name, sort_order, created_by, fulfills_order_id)
      VALUES ($1,'trader',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id
    `, [trip.id, order.customer_id, order.quantity, order.unit || 'bag', cu.full_name || null,
        order.governorate, order.area, order.address_text, cu.phone || null, cu.full_name || null,
        sort.rows[0].n, userId, orderId]);

    // ✅ بعد أول وجهة، نُحدّث محافظة/منطقة الفاكس (لمنع فراغ delivery_governorate)
    await client.query(`
      UPDATE loading_faxes
      SET delivery_governorate = COALESCE(delivery_governorate, $1),
          delivery_area = COALESCE(delivery_area, $2)
      WHERE id = $3
    `, [order.governorate, order.area, trip.id]);

    await client.query(`UPDATE orders SET fax_id = $1, status = 'PREPARING', updated_at = NOW() WHERE id = $2`, [trip.id, orderId]);
    await client.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, reason)
       VALUES ($1,'PAYMENT_APPROVED','PREPARING',$2,$3)`,
      [orderId, userId, `تكليف تلقائي على فاكس ${trip.fax_number || ''}`]);

    // إشعارات داخلية (فشلها داخل نفس المعاملة غير متوقع؛ SMS خارج هذا الملف)
    await client.query(
      `INSERT INTO notifications (user_id, title_ar, body_ar, type, reference_type, reference_id)
       SELECT d.user_id, 'وجهة جديدة على رحلتك', $1, 'DESTINATION_ADDED', 'loading_faxes', $2
       FROM drivers d WHERE d.id = $3 AND d.user_id IS NOT NULL`,
      [`أُضيف طلب ${order.order_number} (${order.quantity} ${order.unit === 'ton' ? 'طن' : 'كيس'}) إلى الفاكس ${trip.fax_number || ''}`, trip.id, trip.driver_id]);
    if (cu.user_id) {
      await client.query(
        `INSERT INTO notifications (user_id, title_ar, body_ar, type, reference_type, reference_id)
         VALUES ($1,'تم تكليف طلبك','تم تكليف طلبك ' || $2 || ' على رحلة قائمة','ORDER_ASSIGNED','orders',$3)`,
        [cu.user_id, order.order_number, orderId]);
    }
    await client.query('COMMIT');
    return { assigned: true, fax_id: trip.id, fax_number: trip.fax_number, destination_id: dest.rows[0].id,
             match_score: best.score, match_reason: best.reason };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/** محاولة تكليف كل الطلبات المعتمدة غير المكلَّفة. لا يتوقف عند فشل طلب واحد. */
const autoAssignPendingOrders = async (userId) => {
  const { query } = require('../../config/db');
  const r = await query(`
    SELECT o.id, o.order_number FROM orders o
    WHERE o.status = 'PAYMENT_APPROVED' AND o.delivery_type = 'alghouli_delivery' AND o.fax_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM delivery_destinations dd WHERE dd.fulfills_order_id = o.id)
    ORDER BY o.created_at ASC`);
  const report = { total: r.rows.length, assigned: 0, skipped: 0, failed: 0, details: [] };
  for (const row of r.rows) {
    try {
      const res = await autoAssignToTrip(row.id, userId);
      if (res.assigned) report.assigned++; else report.skipped++;
      report.details.push({ order_id: row.id, order_number: row.order_number, ...res });
    } catch (e) {
      report.failed++;
      console.error('[auto-assign] فشل', row.order_number, e.message);
      report.details.push({ order_id: row.id, order_number: row.order_number, assigned: false, reason: e.message });
    }
  }
  return report;
};

/** استدعاء آمن بعد COMMIT: لا يكسر الاعتماد أو التسعير عند الفشل. */
const tryAutoAssign = async (orderId, userId) => {
  try { return await autoAssignToTrip(orderId, userId); }
  catch (e) { console.error('[auto-assign] فشل:', e.message); return { assigned: false, reason: e.message }; }
};

module.exports = { autoAssignToTrip, autoAssignPendingOrders, tryAutoAssign, scoreTrip, pickTrip, routeHasGovernorate };
