const { pool, query } = require('../../config/db');

const generateTripNumber = async () => {
  const year = new Date().getFullYear();
  const r = await query(
    `SELECT COUNT(*) FROM deliveries WHERE trip_number LIKE $1`,
    [`TRP-${year}-%`]
  );
  return `TRP-${year}-${String(parseInt(r.rows[0].count, 10) + 1).padStart(6, '0')}`;
};

const assignDriver = async (orderId, data, assignedBy) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const o = await client.query(
      `SELECT o.id, o.status, o.shipping_amount, a.address_text, a.governorate, a.area
       FROM orders o
       JOIN customer_addresses a ON a.id = o.address_id
       WHERE o.id = $1`,
      [orderId]
    );
    if (o.rows.length === 0) {
      const err = new Error('الطلب غير موجود');
      err.status = 404;
      throw err;
    }
    const order = o.rows[0];

    if (!['PAYMENT_APPROVED', 'PREPARING', 'PENDING_DRIVER_ASSIGNMENT'].includes(order.status)) {
      const err = new Error('الطلب ليس جاهزًا للتوصيل');
      err.status = 400;
      throw err;
    }

    const items = await client.query(
      `SELECT DISTINCT packaging_type FROM order_items WHERE order_id = $1`,
      [orderId]
    );

    const tripResults = [];
    for (const item of items.rows) {
      const tripNumber = await generateTripNumber();

      const veh = await client.query(
        `SELECT supports_bagged, supports_bulk FROM vehicles WHERE id = $1`,
        [data.vehicleId]
      );
      if (veh.rows.length === 0) {
        const err = new Error('الشاحنة غير موجودة');
        err.status = 404;
        throw err;
      }
      const vehicle = veh.rows[0];

      if (item.packaging_type === 'bagged' && !vehicle.supports_bagged) {
        const err = new Error('الشاحنة لا تدعم الأكياس');
        err.status = 400;
        throw err;
      }
      if (item.packaging_type === 'bulk' && !vehicle.supports_bulk) {
        const err = new Error('الشاحنة لا تدعم السائب');
        err.status = 400;
        throw err;
      }

      const dRes = await client.query(
        `INSERT INTO deliveries
         (trip_number, order_id, driver_id, vehicle_id, packaging_type,
          delivery_location, shipping_amount, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'DRIVER_ASSIGNED')
         RETURNING id, trip_number, status`,
        [
          tripNumber, orderId, data.driverId, data.vehicleId,
          item.packaging_type,
          `${order.address_text}, ${order.area || ''}, ${order.governorate}`,
          order.shipping_amount / items.rows.length,
        ]
      );

      await client.query(
        `INSERT INTO delivery_status_history (delivery_id, status, changed_by, notes)
         VALUES ($1, 'DRIVER_ASSIGNED', $2, $3)`,
        [dRes.rows[0].id, assignedBy, 'تعيين السائق والشاحنة']
      );

      tripResults.push(dRes.rows[0]);
    }

    await client.query(
      `UPDATE orders SET status = 'DRIVER_ASSIGNED', updated_at = NOW() WHERE id = $1`,
      [orderId]
    );

    // إذا طلب التاجر الفاكس مع توصيل مؤسسة الغولي، يتم إنشاؤه تلقائيًا
    // بعد تعيين السائق والقاطرة؛ الموظف لا يعيد إدخال بيانات الطلب يدويًا.
    const faxOrder = await client.query(
      `SELECT o.fax_requested, o.fax_id, o.customer_id, o.transport_beneficiary,
              oi.quantity, oi.source_id, d.driver_type
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       JOIN drivers d ON d.id = $2
       WHERE o.id = $1
       ORDER BY oi.id ASC LIMIT 1`,
      [orderId, data.driverId]
    );
    if (faxOrder.rows[0]?.fax_requested && !faxOrder.rows[0]?.fax_id) {
      const f = faxOrder.rows[0];
      const existingFax = await client.query(
        `SELECT id FROM loading_faxes WHERE order_id = $1 AND status IN ('REQUESTED','APPROVED','ISSUED','USED') LIMIT 1`,
        [orderId]
      );
      if (!existingFax.rows.length) {
        const fax = await client.query(
          `INSERT INTO loading_faxes
           (order_id, driver_id, vehicle_id, factory_id, requested_quantity, status,
            requested_at, created_by, requested_by_user_id, trader_id, driver_type_snapshot,
            is_managed_by_institution, transport_payer, transport_payer_trader_id)
           VALUES ($1,$2,$3,$4,$5,'REQUESTED',NOW(),$6,$7,$8,$9,TRUE,$10,$11)
           RETURNING id`,
          [orderId, data.driverId, data.vehicleId,
           (await client.query(`SELECT source_id FROM order_items WHERE order_id = $1 ORDER BY id ASC LIMIT 1`, [orderId])).rows[0].source_id,
           f.quantity, assignedBy,
           (await client.query(`SELECT user_id FROM customers WHERE id = $1`, [f.customer_id])).rows[0].user_id,
           f.customer_id, f.driver_type || 'institution_driver',
           f.transport_beneficiary === 'trader' ? 'trader' : 'institution',
           f.transport_beneficiary === 'trader' ? f.customer_id : null]
        );
        await client.query(`UPDATE orders SET fax_id = $1 WHERE id = $2`, [fax.rows[0].id, orderId]);
      }
    }

    await client.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, reason)
       VALUES ($1, $2, 'DRIVER_ASSIGNED', $3, 'تعيين السائق')`,
      [orderId, order.status, assignedBy]
    );

    await client.query('COMMIT');
    return tripResults;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const listPendingAssignment = async () => {
  // ✅ LEFT JOINs: نسمح بطلبات قد يكون product_id/source_id فيها NULL
  //    (الطلبات المولَّدة من تسليم الفاكس أو التي لم يكتمل تسعيرها بعد)
  const result = await query(`
    SELECT o.id, o.order_number, o.status, o.total_amount, o.shipping_amount,
           o.fax_requested, o.created_at,
           COALESCE(u.full_name, 'عميل') AS customer_name,
           u.phone AS customer_phone,
           COALESCE(s.name_ar, 'مصنع غير محدد') AS factory_name,
           oi.quantity, COALESCE(oi.unit, 'bag') AS unit,
           COALESCE(p.name_ar, 'بند غير محدد') AS product_name,
           COALESCE(a.governorate, c.governorate) AS governorate,
           COALESCE(a.area, c.area) AS area,
           a.address_text
    FROM orders o
    LEFT JOIN customers c ON c.id = o.customer_id
    LEFT JOIN users u ON u.id = c.user_id
    LEFT JOIN order_items oi ON oi.order_id = o.id
    LEFT JOIN products p ON p.id = oi.product_id
    LEFT JOIN product_sources s ON s.id = oi.source_id
    LEFT JOIN customer_addresses a ON a.id = o.address_id
    WHERE o.delivery_type = 'alghouli_delivery'
      AND o.status = 'PAYMENT_APPROVED'
      AND NOT EXISTS (SELECT 1 FROM deliveries d WHERE d.order_id = o.id)
    ORDER BY o.created_at ASC
  `);
  return result.rows;
};

const updateDeliveryStatus = async (deliveryId, status, userId, notes) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const d = await client.query(
      `SELECT id, order_id, status FROM deliveries WHERE id = $1`,
      [deliveryId]
    );
    if (d.rows.length === 0) {
      const err = new Error('الرحلة غير موجودة');
      err.status = 404;
      throw err;
    }
    const delivery = d.rows[0];

    // استخدم $1 للقيمة، $2 للمعرّف، $3 للمقارنة
    await client.query(
      `UPDATE deliveries SET
        status = $1::varchar,
        started_at = CASE WHEN $3::varchar = 'IN_TRANSIT' THEN NOW() ELSE started_at END,
        delivered_at = CASE WHEN $3::varchar = 'DELIVERED' THEN NOW() ELSE delivered_at END
       WHERE id = $2::uuid`,
      [status, deliveryId, status]
    );

    await client.query(
      `INSERT INTO delivery_status_history (delivery_id, status, changed_by, notes)
       VALUES ($1::uuid, $2::varchar, $3::uuid, $4)`,
      [deliveryId, status, userId, notes || null]
    );

    let orderStatus = null;
    if (status === 'LOADED') orderStatus = 'LOADED';
    else if (status === 'IN_TRANSIT') orderStatus = 'IN_TRANSIT';
    else if (status === 'DELIVERED') orderStatus = 'DELIVERED';

    if (orderStatus) {
      await client.query(
        `UPDATE orders SET status = $1::varchar, updated_at = NOW() WHERE id = $2::uuid`,
        [orderStatus, delivery.order_id]
      );
      await client.query(
        `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, reason)
         VALUES ($1::uuid, $2::varchar, $3::varchar, $4::uuid, $5)`,
        [delivery.order_id, delivery.status, orderStatus, userId, 'تحديث حالة التوصيل']
      );
    }

    await client.query('COMMIT');
    return { id: deliveryId, status };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const listByOrder = async (orderId) => {
  const result = await query(
    `SELECT d.id, d.trip_number, d.packaging_type, d.status,
            d.delivery_location, d.shipping_amount,
            d.created_at, d.started_at, d.delivered_at,
            dr.full_name AS driver_name, dr.phone AS driver_phone,
            v.plate_number, v.vehicle_type
     FROM deliveries d
     LEFT JOIN drivers dr ON dr.id = d.driver_id
     LEFT JOIN vehicles v ON v.id = d.vehicle_id
     WHERE d.order_id = $1
     ORDER BY d.created_at ASC`,
    [orderId]
  );
  return result.rows;
};

module.exports = { assignDriver, updateDeliveryStatus, listByOrder, listPendingAssignment };
