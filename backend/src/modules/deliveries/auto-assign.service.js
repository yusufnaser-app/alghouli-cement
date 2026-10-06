const { pool } = require('../../config/db');

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
    if (order.status !== 'PAYMENT_APPROVED') { await client.query('ROLLBACK'); return { assigned: false, reason: 'الطلب ليس بحالة PAYMENT_APPROVED' }; }
    if (order.delivery_type !== 'alghouli_delivery') { await client.query('ROLLBACK'); return { assigned: false, reason: 'ليس توصيل مؤسسة' }; }
    if (order.fax_id) { await client.query('ROLLBACK'); return { assigned: false, reason: 'للطلب فاكس مرتبط' }; }
    if (!order.source_id || !(Number(order.quantity) > 0) || !order.governorate) {
      await client.query('ROLLBACK'); return { assigned: false, reason: 'بيانات الطلب ناقصة (مصنع/كمية/محافظة)' };
    }

    // أول رحلة مناسبة: نفس المصنع والمحافظة وكمية متبقية كافية (قبل اعتماد الفاكس أو أثناءه)
    const t = await client.query(`
      SELECT f.id, f.fax_number, f.driver_id,
             COALESCE(f.loaded_quantity, f.approved_quantity, f.requested_quantity, 0)
               - COALESCE((SELECT SUM(quantity) FROM delivery_destinations WHERE fax_id = f.id), 0) AS remaining
      FROM loading_faxes f
      WHERE f.status IN ('REQUESTED','APPROVED','ISSUED','USED','READY_FOR_TRANSIT')
        AND f.factory_id = $1
    AND (f.delivery_governorate IS NULL OR f.delivery_governorate = $2)
        AND COALESCE(f.is_managed_by_institution, TRUE) = TRUE
      ORDER BY f.requested_at ASC
      FOR UPDATE OF f
    `, [order.source_id, order.governorate]);
    const trip = t.rows.find((r) => Number(r.remaining) >= Number(order.quantity));
    if (!trip) { await client.query('ROLLBACK'); return { assigned: false, reason: 'لا توجد رحلة مناسبة' }; }

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
    return { assigned: true, fax_id: trip.id, fax_number: trip.fax_number, destination_id: dest.rows[0].id };
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

module.exports = { autoAssignToTrip, autoAssignPendingOrders, tryAutoAssign };
