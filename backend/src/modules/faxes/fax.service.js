const fmt = (n) => (parseFloat(n) || 0).toLocaleString('en-US');

const { sendPushNotification } = require('../../services/fcm.service');
const { pool, query } = require('../../config/db');
const { queueSms } = require('../../services/sms.service');
const fulfillmentService = require('../accounting/order-fulfillment.service');

// ============== إنشاء الفاكس ==============

const generateFaxNumber = async (client) => {
  const year = new Date().getFullYear();
  const r = await client.query(
    `SELECT COUNT(*) FROM loading_faxes 
     WHERE fax_number IS NOT NULL 
       AND fax_number LIKE $1`,
    [`FX-${year}-%`]
  );
  const count = parseInt(r.rows[0].count, 10) + 1;
  return `FX-${year}-${String(count).padStart(5, '0')}`;
};

// إنشاء فاكس انطلاقًا من طلب شراء معتمد. يستعمل نفس جدول loading_faxes
// ولا ينشئ دورة مستقلة للطلب.
const createFaxFromOrder = async (client, orderId, createdByUserId) => {
  const o = await client.query(
    `SELECT o.*, c.id AS customer_id, c.user_id AS customer_user_id,
            oi.quantity, oi.source_id, oi.product_id,
            d.driver_type, d.owner_trader_id
     FROM orders o
     JOIN customers c ON c.id = o.customer_id
     JOIN order_items oi ON oi.order_id = o.id
     LEFT JOIN drivers d ON d.id = o.trader_driver_id
     WHERE o.id = $1
     ORDER BY oi.id ASC LIMIT 1`,
    [orderId]
  );
  if (!o.rows.length) {
    const err = new Error('الطلب غير موجود'); err.status = 404; throw err;
  }
  const order = o.rows[0];
  if (!order.fax_requested) return null;

  const existing = await client.query(
    `SELECT id, fax_number, status FROM loading_faxes WHERE order_id = $1
       AND status IN ('REQUESTED','APPROVED','ISSUED','USED') LIMIT 1`,
    [orderId]
  );
  if (existing.rows.length) {
    await client.query(`UPDATE orders SET fax_id = $1 WHERE id = $2`, [existing.rows[0].id, orderId]);
    return existing.rows[0];
  }

  if (order.delivery_type === 'trader_pickup') {
    if (!order.trader_driver_id || !order.trader_vehicle_id) {
      const err = new Error('لا يمكن إنشاء الفاكس قبل تحديد سائق وقاطرة التاجر');
      err.code = 'FAX_NOT_READY'; err.status = 409; throw err;
    }
    const d = await client.query(
      `SELECT id, driver_type, owner_trader_id FROM drivers WHERE id = $1`,
      [order.trader_driver_id]
    );
    const v = await client.query(
      `SELECT id, plate_number, current_driver_id FROM vehicles WHERE id = $1`,
      [order.trader_vehicle_id]
    );
    if (!d.rows.length || !v.rows.length || d.rows[0].owner_trader_id !== order.customer_id ||
        (v.rows[0].current_driver_id && v.rows[0].current_driver_id !== order.trader_driver_id)) {
      const err = new Error('السائق أو القاطرة لا يتبعان التاجر'); err.status = 403; throw err;
    }
    const faxNumber = null; // يُصدر لاحقًا من الموظف/المصنع
    const f = await client.query(
      `INSERT INTO loading_faxes
       (order_id, driver_id, vehicle_id, factory_id, requested_quantity, status,
        requested_at, created_by, requested_by_user_id, trader_id,
        driver_type_snapshot, is_managed_by_institution,
        transport_payer, transport_payer_trader_id)
       VALUES ($1,$2,$3,$4,$5,'REQUESTED',NOW(),$6,$7,$8,$9,FALSE,$10,$11)
       RETURNING id, fax_number, status`,
      [orderId, order.trader_driver_id, order.trader_vehicle_id, order.source_id,
       order.quantity, createdByUserId, order.customer_user_id, order.customer_id,
       d.rows[0].driver_type || 'trader_driver',
       order.transport_beneficiary === 'trader' ? 'trader' : 'institution',
       order.transport_beneficiary === 'trader' ? order.customer_id : null]
    );
    await client.query(`UPDATE orders SET fax_id = $1, status = CASE WHEN status = 'PAYMENT_APPROVED' THEN 'PREPARING' ELSE status END, updated_at = NOW() WHERE id = $2`, [f.rows[0].id, orderId]);
    await client.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, reason)
       SELECT $1, 'PAYMENT_APPROVED', 'PREPARING', $2, 'تم إنشاء طلب الفاكس تلقائيًا من الطلب المعتمد'
       WHERE EXISTS (SELECT 1 FROM orders WHERE id = $1 AND status = 'PREPARING')`,
      [orderId, createdByUserId]
    );
    await client.query(
      `INSERT INTO automation_events (event_type, entity_type, entity_id, payload)
       VALUES ('fax.created_from_order', 'orders', $1, $2)`,
      [orderId, JSON.stringify({ fax_id: f.rows[0].id, driver_id: order.trader_driver_id, vehicle_id: order.trader_vehicle_id })]
    );
    return f.rows[0];
  }

  // توصيل المؤسسة: الفاكس لا يُنشأ إلا بعد أن يعيّن الموظف السائق والقاطرة.
  const err = new Error('فاكس توصيل المؤسسة سيُنشأ بعد تعيين سائق وقاطرة');
  err.code = 'FAX_NOT_READY'; err.status = 409; throw err;
};

const requestFax = async (requestedByUserId, data) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const u = await client.query(
      `SELECT id, user_type FROM users WHERE id = $1`,
      [requestedByUserId]
    );
    if (u.rows.length === 0) {
      const err = new Error('المستخدم غير موجود');
      err.status = 404;
      throw err;
    }
    const requesterType = u.rows[0].user_type;

    let driverId;
    let driverType;
    let traderId = null;

    if (requesterType === 'driver') {
      // السائق يطلب لنفسه
      const d = await client.query(
        `SELECT id, driver_type, owner_trader_id FROM drivers WHERE user_id = $1`,
        [requestedByUserId]
      );
      if (d.rows.length === 0) {
        const err = new Error('السائق غير موجود');
        err.status = 404;
        throw err;
      }
      driverId = d.rows[0].id;
      driverType = d.rows[0].driver_type || 'institution_driver';
      traderId = d.rows[0].owner_trader_id || null;
    } else if (requesterType === 'customer') {
      // التاجر يطلب لسائقه
      const cust = await client.query(
        `SELECT id FROM customers WHERE user_id = $1`,
        [requestedByUserId]
      );
      if (cust.rows.length === 0) {
        const err = new Error('التاجر غير موجود');
        err.status = 404;
        throw err;
      }
      const traderCustomerId = cust.rows[0].id;

      if (!data.driverId) {
        const err = new Error('يجب اختيار السائق');
        err.status = 400;
        throw err;
      }

      const d = await client.query(
        `SELECT id, driver_type, owner_trader_id FROM drivers WHERE id = $1`,
        [data.driverId]
      );
      if (d.rows.length === 0) {
        const err = new Error('السائق غير موجود');
        err.status = 404;
        throw err;
      }
      if (d.rows[0].owner_trader_id !== traderCustomerId) {
        const err = new Error('هذا السائق لا يتبع لك');
        err.status = 403;
        throw err;
      }
      driverId = d.rows[0].id;
      driverType = 'trader_driver';
      traderId = traderCustomerId;
    } else {
      const err = new Error('نوع المستخدم غير مدعوم');
      err.status = 403;
      throw err;
    }

    // تحقق من القاطرة
    const v = await client.query(
      `SELECT id, plate_number, current_driver_id FROM vehicles WHERE id = $1`,
      [data.vehicleId]
    );
    if (v.rows.length === 0) {
      const err = new Error('القاطرة غير موجودة');
      err.status = 404;
      throw err;
    }
    // كان يمكن طلب فاكس على قاطرة سائق آخر؛ يجب أن تكون القاطرة مرتبطة بهذا السائق
    if (v.rows[0].current_driver_id !== driverId) {
      const err = new Error('هذه القاطرة غير مرتبطة بحساب السائق');
      err.status = 403;
      err.code = 'VEHICLE_NOT_OWNED';
      throw err;
    }

    // تحقق من المصنع
    const f = await client.query(
      `SELECT id, name_ar FROM product_sources WHERE id = $1 AND status = 'active'`,
      [data.factoryId]
    );
    if (f.rows.length === 0) {
      const err = new Error('المصنع غير موجود');
      err.status = 404;
      throw err;
    }

    // لا يوجد فاكس نشط
    const ex = await client.query(
      `SELECT id FROM loading_faxes
       WHERE driver_id = $1 AND vehicle_id = $2
         AND status IN ('REQUESTED','APPROVED','ISSUED')
       LIMIT 1`,
      [driverId, data.vehicleId]
    );
    if (ex.rows.length > 0) {
      const err = new Error('يوجد فاكس نشط على هذه القاطرة');
      err.status = 400;
      err.code = 'FAX_ALREADY_EXISTS';
      throw err;
    }

    const isManaged = driverType !== 'trader_driver';

    const fax = await client.query(
      `INSERT INTO loading_faxes
       (order_id, driver_id, vehicle_id, factory_id, requested_quantity,
        status, requested_at, notes, created_by,
        requested_by_user_id, trader_id, driver_type_snapshot, is_managed_by_institution)
       VALUES ($1,$2,$3,$4,$5,'REQUESTED',NOW(),$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        data.orderId || null, driverId, data.vehicleId, data.factoryId,
        data.quantity, data.notes || null, requestedByUserId,
        requestedByUserId, traderId, driverType, isManaged,
      ]
    );

    await client.query(
      `INSERT INTO automation_events (event_type, entity_type, entity_id, payload)
       VALUES ('fax.requested', 'loading_faxes', $1, $2)`,
      [fax.rows[0].id, JSON.stringify({ driver_id: driverId, driver_type: driverType })]
    );

    await client.query('COMMIT');
    return {
      ...fax.rows[0],
      factory_name: f.rows[0].name_ar,
      plate_number: v.rows[0].plate_number,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ============== الموظف ينشئ فاكس مباشرة ==============
const requestFaxByStaff = async (data, staffUserId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const d = await client.query(
      `SELECT d.id, d.driver_type, d.owner_trader_id, d.full_name,
              COALESCE(d.phone, u.phone) AS phone
       FROM drivers d
       LEFT JOIN users u ON u.id = d.user_id
       WHERE d.id = $1`,
      [data.driverId]
    );
    if (d.rows.length === 0) {
      const err = new Error('السائق غير موجود');
      err.status = 404;
      throw err;
    }
    const driver = d.rows[0];

    const v = await client.query(
      `SELECT id, plate_number FROM vehicles WHERE id = $1`,
      [data.vehicleId]
    );
    if (v.rows.length === 0) {
      const err = new Error('القاطرة غير موجودة');
      err.status = 404;
      throw err;
    }

    const f = await client.query(
      `SELECT id, name_ar FROM product_sources WHERE id = $1 AND status = 'active'`,
      [data.factoryId]
    );
    if (f.rows.length === 0) {
      const err = new Error('المصنع غير موجود');
      err.status = 404;
      throw err;
    }

    const ex = await client.query(
      `SELECT id FROM loading_faxes
       WHERE driver_id = $1 AND vehicle_id = $2
         AND status IN ('REQUESTED','APPROVED','ISSUED')
       LIMIT 1`,
      [driver.id, data.vehicleId]
    );
    if (ex.rows.length > 0) {
      const err = new Error('يوجد فاكس نشط على هذه القاطرة');
      err.status = 400;
      throw err;
    }

    const isManaged = driver.driver_type !== 'trader_driver';

    // توليد رقم الفاكس تلقائياً
    const faxNumber = await generateFaxNumber(client);

    // إنشاء + إصدار فوري
    const fax = await client.query(
      `INSERT INTO loading_faxes
       (order_id, driver_id, vehicle_id, factory_id, requested_quantity,
        status, requested_at, notes, created_by,
        requested_by_user_id, trader_id, driver_type_snapshot, is_managed_by_institution,
        fax_number, approved_at, issued_at, approved_quantity)
       VALUES ($1,$2,$3,$4,$5,'ISSUED',NOW(),$6,$7,$8,$9,$10,$11,
               $12, NOW(), NOW(), $5)
       RETURNING *`,
      [
        data.orderId || null, driver.id, data.vehicleId, data.factoryId,
        data.quantity, data.notes || null, staffUserId,
        staffUserId, driver.owner_trader_id || null,
        driver.driver_type, isManaged,
        faxNumber,
      ]
    );

    await client.query(
      `INSERT INTO automation_events (event_type, entity_type, entity_id, payload)
       VALUES ('fax.created_by_staff', 'loading_faxes', $1, $2)`,
      [fax.rows[0].id, JSON.stringify({ staff_id: staffUserId })]
    );

    // إشعار in-app للسائق
    await client.query(
      `INSERT INTO notifications (user_id, title_ar, body_ar, type, reference_type, reference_id)
       SELECT d.user_id,
              'فاكس تحميل جديد',
              'فاكس رقم ' || $1 || ' من ' || $2 || '. الكمية: ' || $3 || ' كيس. يرجى التوجه للمصنع.',
              'FAX_ISSUED',
              'loading_faxes',
              $4
       FROM drivers d WHERE d.id = $5`,
      [faxNumber, f.rows[0].name_ar, data.quantity, fax.rows[0].id, driver.id]
    );

    // SMS: قالب من قاعدة البيانات مع نص احتياطي؛ فشلها لا يُفشل إنشاء الفاكس (بند 46)
    await queueSms({
      client,
      phone: driver.phone,
      templateKey: 'FAX_ISSUED',
      messageType: 'FAX_ISSUED',
      operationId: faxNumber,
      vars: { fax_number: faxNumber, factory_name: f.rows[0].name_ar, quantity: data.quantity },
      fallbackText: `مؤسسة الغولي: تم إصدار فاكس التحميل رقم ${faxNumber} من ${f.rows[0].name_ar}. الكمية: ${data.quantity} كيس. يرجى التوجه للمصنع.`,
    });

    await client.query('COMMIT');
    return {
      ...fax.rows[0],
      factory_name: f.rows[0].name_ar,
      plate_number: v.rows[0].plate_number,
      driver_name: driver.full_name,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ============== الاعتماد والإصدار ==============
const approveFax = async (faxId, userId) => {
  const r = await query(
    `UPDATE loading_faxes SET status = 'APPROVED', approved_at = NOW(),
     updated_by = $1, updated_at = NOW()
     WHERE id = $2 AND status = 'REQUESTED' RETURNING *`,
    [userId, faxId]
  );
  if (r.rows.length === 0) {
    const err = new Error('غير موجود أو ليس بانتظار الاعتماد');
    err.status = 400;
    throw err;
  }
  return r.rows[0];
};

const issueFax = async (faxId, faxNumber, userId) => {
  const r = await query(
    `UPDATE loading_faxes SET status = 'ISSUED', fax_number = $1,
     issued_at = NOW(), updated_by = $2, updated_at = NOW()
     WHERE id = $3 AND status IN ('APPROVED','REQUESTED') RETURNING *`,
    [faxNumber, userId, faxId]
  );
  if (r.rows.length === 0) {
    const err = new Error('غير موجود');
    err.status = 400;
    throw err;
  }
  return r.rows[0];
};

const issueAndNotify = async (faxId, faxNumber, staffUserId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const f = await client.query(
      `SELECT f.*, d.full_name AS driver_name, COALESCE(d.phone, u.phone) AS driver_phone,
              s.name_ar AS factory_name
       FROM loading_faxes f
       JOIN drivers d ON d.id = f.driver_id
       LEFT JOIN users u ON u.id = d.user_id
       LEFT JOIN product_sources s ON s.id = f.factory_id
       WHERE f.id = $1`,
      [faxId]
    );
    if (f.rows.length === 0) {
      const err = new Error('الفاكس غير موجود');
      err.status = 404;
      throw err;
    }
    const fax = f.rows[0];
    if (!['REQUESTED','APPROVED'].includes(fax.status)) {
      const err = new Error('لا يمكن إصداره في هذه الحالة');
      err.status = 400;
      throw err;
    }

    await client.query(
      `UPDATE loading_faxes SET status = 'ISSUED', fax_number = $1,
       issued_at = NOW(), approved_at = COALESCE(approved_at, NOW()),
       updated_by = $2, updated_at = NOW() WHERE id = $3`,
      [faxNumber, staffUserId, faxId]
    );

    await queueSms({
      client,
      phone: fax.driver_phone,
      templateKey: 'FAX_ISSUED',
      messageType: 'FAX_ISSUED',
      operationId: faxNumber,
      vars: { fax_number: faxNumber, factory_name: fax.factory_name || 'المصنع', quantity: fax.requested_quantity },
      fallbackText: `تم إصدار فاكس التحميل رقم ${faxNumber} من ${fax.factory_name || 'المصنع'}. يرجى التوجه للمصنع. الكمية: ${fax.requested_quantity} كيس.`,
    });

    // FCM Push
    const fcmRes = await client.query(
      `SELECT u.fcm_token FROM users u
       JOIN drivers d ON d.user_id = u.id
       WHERE d.id = $1`,
      [fax.driver_id]
    );
    if (fcmRes.rows[0]?.fcm_token) {
      sendPushNotification(
        fcmRes.rows[0].fcm_token,
        'تم إصدار فاكس التحميل',
        `فاكس رقم ${faxNumber} من ${fax.factory_name || 'المصنع'}. توجه للمصنع الآن.`,
        { type: 'FAX_ISSUED', faxId: faxId }
      ).catch((e) => console.error('FCM error:', e.message));
    }

    await client.query('COMMIT');
    return { id: faxId, status: 'ISSUED', fax_number: faxNumber, sms_queued: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

module.exports = {
  requestFax, requestFaxByStaff, createFaxFromOrder,
  approveFax, issueFax, issueAndNotify,
};

// ملاحظة: كانت هنا نسختان قديمتان منفصلتان setRoute() و setTransport()
// تم إلغاؤهما لأنهما كانتا تسمحان بتحديد خط السير/الأجرة دون تحديد "من يتحمل الأجرة"
// ودون إشعار السائق ودون نقل حالة الفاكس إلى READY_FOR_TRANSIT، ما يعرّض حساب
// السائق لقيود مالية غير مكتملة. استُبدلتا بالكامل بـ setRouteAndTransport() أدناه
// وهي المسار الوحيد المعتمد الآن عبر PATCH /faxes/:id/route-transport.

const enterFactory = async (faxId, driverUserId) => {
  const r = await query(
    `UPDATE loading_faxes SET factory_entered_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND driver_id = (SELECT id FROM drivers WHERE user_id = $2)
       AND status = 'ISSUED' AND factory_entered_at IS NULL RETURNING *`,
    [faxId, driverUserId]
  );
  if (r.rows.length === 0) {
    const err = new Error('لا يمكن تسجيل الدخول');
    err.status = 400;
    throw err;
  }
  return r.rows[0];
};

const recordLoading = async (faxId, loadedQty, userId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const f = await client.query(`SELECT requested_quantity,status FROM loading_faxes WHERE id=$1 FOR UPDATE`, [faxId]);
    if (!f.rows.length) { const err = new Error('الفاكس غير موجود'); err.status=404; throw err; }
    if (f.rows[0].status !== 'ISSUED') { const err = new Error('لا يمكن تسجيل التحميل في هذه الحالة'); err.status=400; throw err; }
    const requested = Number(f.rows[0].requested_quantity || 0);
    const diff = Number(loadedQty) - requested;
    const r = await client.query(`
      UPDATE loading_faxes SET status='USED', used_at=NOW(), loaded_quantity=$1,
        quantity_discrepancy=$2, factory_exited_at=NOW(), loading_confirmed_by=$3,
        loading_confirmed_at=NOW(), updated_by=$3, updated_at=NOW()
      WHERE id=$4 RETURNING *`, [loadedQty,diff,userId,faxId]);
    const accounting = await fulfillmentService.postActualLoading(client, faxId, loadedQty, userId, 'ترحيل تلقائي عند تسجيل تحميل المصنع');
    await client.query(`INSERT INTO automation_events (event_type,entity_type,entity_id,payload) VALUES ('loading.recorded_by_staff','loading_faxes',$1,$2)`,
      [faxId,JSON.stringify({loaded:loadedQty,requested,diff})]);
    await client.query('COMMIT');
    return {...r.rows[0], accounting};
  } catch (err) { await client.query('ROLLBACK'); throw err; }
  finally { client.release(); }
};

const listPendingFaxes = async () => {
  const r = await query(
    `SELECT f.*, d.full_name AS driver_name, d.phone AS driver_phone,
            d.driver_type,
            v.plate_number, s.name_ar AS factory_name,
            tu.full_name AS trader_name,
            tu.phone AS trader_phone
     FROM loading_faxes f
     LEFT JOIN drivers d ON d.id = f.driver_id
     LEFT JOIN vehicles v ON v.id = f.vehicle_id
     LEFT JOIN product_sources s ON s.id = f.factory_id
     LEFT JOIN customers tc ON tc.id = f.trader_id
     LEFT JOIN users tu ON tu.id = tc.user_id
     WHERE f.status IN ('REQUESTED','APPROVED','ISSUED')
     ORDER BY f.requested_at DESC`
  );
  return r.rows;
};

const listDriverFaxes = async (driverUserId) => {
  const r = await query(
    `SELECT f.*, s.name_ar AS factory_name, v.plate_number,
            tu.full_name AS trader_name, tu.phone AS trader_phone
     FROM loading_faxes f
     LEFT JOIN product_sources s ON s.id = f.factory_id
     LEFT JOIN vehicles v ON v.id = f.vehicle_id
     LEFT JOIN customers tc ON tc.id = f.trader_id
     LEFT JOIN users tu ON tu.id = tc.user_id
     WHERE f.driver_id = (SELECT id FROM drivers WHERE user_id = $1)
     ORDER BY f.requested_at DESC LIMIT 50`,
    [driverUserId]
  );
  return r.rows;
};

const listTraderFaxes = async (traderUserId) => {
  const r = await query(
    `SELECT f.*, s.name_ar AS factory_name, v.plate_number,
            d.full_name AS driver_name
     FROM loading_faxes f
     LEFT JOIN product_sources s ON s.id = f.factory_id
     LEFT JOIN vehicles v ON v.id = f.vehicle_id
     LEFT JOIN drivers d ON d.id = f.driver_id
     WHERE f.trader_id = (SELECT id FROM customers WHERE user_id = $1)
     ORDER BY f.requested_at DESC LIMIT 100`,
    [traderUserId]
  );
  return r.rows;
};

const getFaxById = async (faxId) => {
  const r = await query(
    `SELECT f.*, d.full_name AS driver_name, d.phone AS driver_phone, d.user_id AS driver_user_id,
            v.plate_number, s.name_ar AS factory_name,
            tc.user_id AS trader_user_id,
            pu.full_name AS payer_trader_name, pu.phone AS payer_trader_phone,
            pc.user_id AS payer_trader_user_id,
            pa.governorate AS payer_governorate, pa.area AS payer_area, pa.address_text AS payer_address_text
     FROM loading_faxes f
     LEFT JOIN drivers d ON d.id = f.driver_id
     LEFT JOIN vehicles v ON v.id = f.vehicle_id
     LEFT JOIN product_sources s ON s.id = f.factory_id
     LEFT JOIN customers tc ON tc.id = f.trader_id
     LEFT JOIN customers pc ON pc.id = f.transport_payer_trader_id
     LEFT JOIN users pu ON pu.id = pc.user_id
     LEFT JOIN LATERAL (
       SELECT governorate, area, address_text FROM customer_addresses
       WHERE customer_id = pc.id ORDER BY is_default DESC, created_at DESC LIMIT 1
     ) pa ON true
     WHERE f.id = $1`,
    [faxId]
  );
  return r.rows[0] || null;
};

const cancelFax = async (faxId, userId, reason) => {
  const r = await query(
    `UPDATE loading_faxes SET status = 'CANCELLED', cancelled_at = NOW(),
     updated_by = $1, updated_at = NOW()
     WHERE id = $2 AND status IN ('REQUESTED','APPROVED','ISSUED') RETURNING *`,
    [userId, faxId]
  );
  if (r.rows.length === 0) {
    const err = new Error('غير موجود');
    err.status = 400;
    throw err;
  }
  return r.rows[0];
};

const listPendingRouteAndPrice = async () => {
  const r = await query(
    `SELECT f.*, d.full_name AS driver_name, v.plate_number, s.name_ar AS factory_name
     FROM loading_faxes f
     LEFT JOIN drivers d ON d.id = f.driver_id
     LEFT JOIN vehicles v ON v.id = f.vehicle_id
     LEFT JOIN product_sources s ON s.id = f.factory_id
     WHERE f.status IN ('APPROVED','ISSUED')
       AND (f.route IS NULL OR f.transport_rate IS NULL)
     ORDER BY f.issued_at ASC`
  );
  return r.rows;
};

/**
 * مركز العمليات — أهم شاشة تشغيلية (حسب مواصفة العمل الجديدة، بند 16):
 *   - يحتاج تدخل: قاطرة داخل مصنع منذ وقت طويل دون تسجيل تحميل (رحلة متأخرة)
 *   - يحتاج متابعة: فاكسات لم تُقيَّد بعد (بانتظار الاعتماد/الإصدار)، أو
 *     صادرة/مُحمَّلة لكن بلا خط سير أو أجرة نقل بعد
 *   - طبيعي: رحلات جارية بشكل طبيعي (تم تحديد خط السير والأجرة، في الطريق)
 */
const getOperationsCenter = async (delayThresholdMinutes = 60) => {
  const commonSelect = `
    SELECT f.*, d.full_name AS driver_name, d.phone AS driver_phone,
           v.plate_number, s.name_ar AS factory_name
    FROM loading_faxes f
    LEFT JOIN drivers d ON d.id = f.driver_id
    LEFT JOIN vehicles v ON v.id = f.vehicle_id
    LEFT JOIN product_sources s ON s.id = f.factory_id
  `;

  // 1) يحتاج تدخل — عالق داخل المصنع أطول من الحد المسموح دون تسجيل تحميل
  const urgent = await query(
    `${commonSelect}
     WHERE f.factory_entered_at IS NOT NULL
       AND f.used_at IS NULL
       AND f.status NOT IN ('CANCELLED')
       AND f.factory_entered_at < NOW() - ($1::int * INTERVAL '1 minute')
     ORDER BY f.factory_entered_at ASC`,
    [delayThresholdMinutes]
  );
  const urgentRows = urgent.rows.map((row) => ({
    ...row,
    alert_reason: 'STUCK_IN_FACTORY',
    minutes_elapsed: Math.floor(
      (Date.now() - new Date(row.factory_entered_at).getTime()) / 60000
    ),
  }));

  // 2) يحتاج متابعة — لم تُقيَّد بعد (بانتظار الاعتماد أو الإصدار)
  const awaitingIssue = await query(
    `${commonSelect}
     WHERE f.status IN ('REQUESTED', 'APPROVED')
     ORDER BY f.requested_at ASC`
  );

  // 3) يحتاج متابعة أيضًا — صادرة/محمَّلة لكن بلا خط سير أو أجرة بعد
  const awaitingRoute = await query(
    `${commonSelect}
     WHERE f.status IN ('ISSUED', 'USED')
       AND (f.route IS NULL OR f.transport_rate IS NULL)
     ORDER BY COALESCE(f.used_at, f.issued_at) ASC`
  );

  const needsFollowUp = [
    ...awaitingIssue.rows.map((row) => ({ ...row, follow_up_reason: 'AWAITING_ISSUE' })),
    ...awaitingRoute.rows.map((row) => ({ ...row, follow_up_reason: 'AWAITING_ROUTE' })),
  ];

  // 4) طبيعي — رحلات جارية بلا مشاكل (خط السير والأجرة محدَّدان، في الطريق)
  const normal = await query(
    `${commonSelect}
     WHERE f.status = 'READY_FOR_TRANSIT'
     ORDER BY f.route_set_at DESC
     LIMIT 100`
  );

  return {
    urgent: urgentRows,
    needs_follow_up: needsFollowUp,
    normal: normal.rows,
    summary: {
      urgent_count: urgentRows.length,
      needs_follow_up_count: needsFollowUp.length,
      normal_count: normal.rows.length,
      delay_threshold_minutes: delayThresholdMinutes,
    },
  };
};

module.exports.enterFactory = enterFactory;
module.exports.recordLoading = recordLoading;
module.exports.listPendingFaxes = listPendingFaxes;
module.exports.listDriverFaxes = listDriverFaxes;
module.exports.listTraderFaxes = listTraderFaxes;
module.exports.getFaxById = getFaxById;
module.exports.cancelFax = cancelFax;
module.exports.listPendingRouteAndPrice = listPendingRouteAndPrice;
module.exports.getOperationsCenter = getOperationsCenter;



const getCurrentTrip = async (driverUserId) => {
  const r = await query(
    `SELECT f.*, s.name_ar AS factory_name, v.plate_number,
            d.full_name AS driver_name
     FROM loading_faxes f
     LEFT JOIN product_sources s ON s.id = f.factory_id
     LEFT JOIN vehicles v ON v.id = f.vehicle_id
     LEFT JOIN drivers d ON d.id = f.driver_id
     WHERE f.driver_id = (SELECT id FROM drivers WHERE user_id = $1)
       AND f.status IN ('REQUESTED','APPROVED','ISSUED','USED','READY_FOR_TRANSIT')
     ORDER BY f.requested_at DESC LIMIT 1`,
    [driverUserId]
  );
  return r.rows[0] || null;
};

module.exports.getCurrentTrip = getCurrentTrip;



const driverConfirmLoading = async (faxId, driverUserId, loadedQty, notes) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const f = await client.query(
      `SELECT f.*, d.user_id AS driver_user_id, d.full_name AS driver_name,
              s.name_ar AS factory_name
       FROM loading_faxes f
       JOIN drivers d ON d.id = f.driver_id
       LEFT JOIN product_sources s ON s.id = f.factory_id
       WHERE f.id = $1
       FOR UPDATE OF f`,
      [faxId]
    );

    if (f.rows.length === 0) {
      const err = new Error('الفاكس غير موجود');
      err.status = 404;
      throw err;
    }

    const fax = f.rows[0];

    if (fax.driver_user_id !== driverUserId) {
      const err = new Error('هذا الفاكس لا يخصك');
      err.status = 403;
      throw err;
    }

    if (!['ISSUED', 'APPROVED'].includes(fax.status)) {
      const err = new Error('لا يمكن تسجيل التحميل في هذه الحالة');
      err.status = 400;
      throw err;
    }

    const requested = parseFloat(fax.requested_quantity || 0);
    const diff = loadedQty - requested;

    await client.query(
      `UPDATE loading_faxes
       SET status = 'USED',
           used_at = NOW(),
           loaded_quantity = $1,
           quantity_discrepancy = $2,
           factory_exited_at = NOW(),
           loading_confirmed_by = $3,
           loading_confirmed_at = NOW(),
           notes = CASE WHEN $5::text IS NULL OR $5::text = '' THEN notes
                        ELSE COALESCE(notes || E'\n', '') || 'ملاحظة التحميل: ' || $5::text END,
           updated_at = NOW()
       WHERE id = $4`,
      [loadedQty, diff, driverUserId, faxId, notes ? String(notes).slice(0, 500) : null]
    );

    // ═══ التحديث على الطلب (فقط إن كان الفاكس مرتبطًا بطلب) ═══
    if (fax.order_id) {
      await client.query(
        `UPDATE orders
         SET quantity_loaded = $1, quantity_discrepancy = $2,
             loading_completed_at = NOW(), status = 'LOADED', updated_at = NOW()
         WHERE id = $3`,
        [loadedQty, diff, fax.order_id]
      );

      // الترحيل المحاسبي — فقط عند وجود طلب
      try {
        await fulfillmentService.postActualLoading(
          client, faxId, loadedQty, driverUserId,
          notes || 'ترحيل تلقائي عند تأكيد السائق للتحميل'
        );
      } catch (accErr) {
        // الترحيل قد يفشل لأسباب معينة (فاكس بدون عناصر) — لا نوقف العملية
        console.error('⚠️ تعذّر الترحيل المحاسبي:', accErr.message);
      }
    }

    await client.query(
      `INSERT INTO automation_events (event_type, entity_type, entity_id, payload)
       VALUES ('loading.confirmed_by_driver', 'loading_faxes', $1, $2)`,
      [faxId, JSON.stringify({ loaded: loadedQty, requested, diff })]
    );

    // FCM Push للسائق بتأكيد التسجيل
    const fcmRes = await client.query(
      `SELECT u.fcm_token FROM users u
       JOIN drivers d ON d.user_id = u.id
       WHERE d.id = $1`,
      [fax.driver_id]
    );
    if (fcmRes.rows[0]?.fcm_token) {
      const msg = Math.abs(diff) > 0.01
        ? `تم تسجيل تحميل ${loadedQty} كيس (فرق ${diff}). المؤسسة ستراجع الكمية.`
        : `تم تسجيل تحميل ${loadedQty} كيس. انتظر خط السير.`;
      sendPushNotification(
        fcmRes.rows[0].fcm_token,
        'تم تسجيل التحميل',
        msg,
        { type: 'LOADING_CONFIRMED', faxId: faxId }
      ).catch((e) => console.error('FCM error:', e.message));
    }

    if (Math.abs(diff) > 0.01) {
      await client.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values)
         VALUES ($1, 'QUANTITY_DISCREPANCY', 'loading_faxes', $2, $3)`,
        [driverUserId, faxId, JSON.stringify({ requested, loaded: loadedQty, diff })]
      );

      // تنبيه داخلي للمدير ومسؤول النقل (غير حرج: لا يُفشل تسجيل التحميل)
      try {
        await client.query('SAVEPOINT alert_sp');
        await client.query(
          `INSERT INTO notifications (user_id, title_ar, body_ar, type, reference_type, reference_id)
           SELECT DISTINCT ur.user_id,
                  'اختلاف في كمية التحميل',
                  $1,
                  'QUANTITY_DISCREPANCY', 'loading_faxes', $2
           FROM user_roles ur JOIN roles r ON r.id = ur.role_id
           WHERE r.name IN ('admin', 'transport')`,
          [
            `السائق ${fax.driver_name} — ${fax.factory_name || 'المصنع'}: مطلوب ${requested} / محمّل ${loadedQty} (فرق ${diff}).`,
            faxId,
          ]
        );
      } catch (alertErr) {
        await client.query('ROLLBACK TO SAVEPOINT alert_sp');
        console.error('Discrepancy alert error (تم تجاهله):', alertErr.message);
      }
    }

    await client.query('COMMIT');

    return {
      id: faxId,
      loaded_quantity: loadedQty,
      requested_quantity: requested,
      discrepancy: diff,
      has_discrepancy: Math.abs(diff) > 0.01,
      accounting,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

module.exports.driverConfirmLoading = driverConfirmLoading;

const listAwaitingRoute = async () => {
  const r = await query(
    `SELECT f.*, d.full_name AS driver_name, d.phone AS driver_phone,
            d.driver_type,
            v.plate_number, s.name_ar AS factory_name,
            tu.full_name AS trader_name,
            tu.phone AS trader_phone
     FROM loading_faxes f
     LEFT JOIN drivers d ON d.id = f.driver_id
     LEFT JOIN vehicles v ON v.id = f.vehicle_id
     LEFT JOIN product_sources s ON s.id = f.factory_id
     LEFT JOIN customers tc ON tc.id = f.trader_id
     LEFT JOIN users tu ON tu.id = tc.user_id
     WHERE f.status = 'USED'
       AND f.route IS NULL
     ORDER BY f.used_at ASC`
  );
  return r.rows;
};

const setRouteAndTransport = async (faxId, data, userId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const f = await client.query(
      `SELECT f.*, d.id AS driver_id, d.driver_type, d.full_name AS driver_name,
              COALESCE(d.phone, u.phone) AS driver_phone
       FROM loading_faxes f
       JOIN drivers d ON d.id = f.driver_id
       LEFT JOIN users u ON u.id = d.user_id
       WHERE f.id = $1
       FOR UPDATE OF f`,
      [faxId]
    );

    if (f.rows.length === 0) {
      const err = new Error('الفاكس غير موجود');
      err.status = 404;
      throw err;
    }

    const fax = f.rows[0];

    // منع إعادة تحديد خط السير/الأجرة لفاكس سبق تحديده (لمنع تكرار قيد المستحق في حساب السائق)
    if (fax.transport_rate !== null && fax.transport_rate !== undefined) {
      const err = new Error('تم تحديد خط السير وأجرة النقل لهذا الفاكس مسبقًا');
      err.status = 400;
      err.code = 'ALREADY_ROUTED';
      throw err;
    }

    // قاعدة الحساب
    let baseQty = parseFloat(fax.loaded_quantity || fax.requested_quantity || 0);
    if (data.baseOn === 'requested_quantity') {
      baseQty = parseFloat(fax.requested_quantity || 0);
    } else if (data.baseOn === 'delivered_quantity') {
      baseQty = parseFloat(fax.delivered_quantity || fax.loaded_quantity || 0);
    }

    const rate = parseFloat(data.rate);
    // حساب بوحدات صحيحة (لا أخطاء فاصلة عائمة)
    const { toMinor: _tm, fromMinor: _fm, divRound: _dr } = require('../accounting/accounting.engine');
    const total = parseFloat(_fm(_dr(BigInt(_tm(rate)) * BigInt(_tm(baseQty)), 100n)));

    // تحديد من يتحمل أجور النقل — قبل أي استخدام
    const payerType = data.transportPayer || 'institution';
    const payerTraderId = data.transportPayerTraderId || null;

    // تحديث الفاكس
    await client.query(
      `UPDATE loading_faxes
       SET route = $1,
           delivery_address = $2,
           delivery_governorate = $3,
           delivery_area = $4,
           transport_rate = $5,
           transport_rate_unit = $6,
           transport_total = $7,
           transport_base_on = $8,
           transport_set_by = $9,
           transport_set_at = NOW(),
           route_set_by = $9,
           route_set_at = NOW(),
           transport_payer = $11,
           transport_payer_trader_id = $12,
           transport_payer_note = $13,
           destination_trader_id = COALESCE($14, destination_trader_id),
           status = 'READY_FOR_TRANSIT',
           status_updated_at = NOW(),
           updated_at = NOW()
       WHERE id = $10`,
      [
        data.route,
        data.deliveryAddress || null,
        data.deliveryGovernorate || null,
        data.deliveryArea || null,
        rate,
        data.unit || 'bag',
        total,
        data.baseOn || 'loaded_quantity',
        userId,
        faxId,
        payerType,
        payerTraderId,
        data.transportPayerNote || null,
        data.destinationTraderId || null,
      ]
    );

    // سجل في driver_ledger (فقط إذا المؤسسة تدفع) — عبر نواة الدفتر: قفل + مفتاح عدم تكرار
    if (data.transportPayer !== 'trader' && fax.driver_type !== 'trader_driver' && total > 0) {
      await require('../accounting/ledger.core').postDriverEntry(client, {
        driverId: fax.driver_id, orderId: fax.order_id, currency: 'YER',
        debit: total, credit: 0, transactionType: 'transport_due',
        description: 'مستحق نقل — فاكس ' + (fax.fax_number || 'بدون رقم'),
        referenceCode: fax.fax_number || `FAX-${faxId}`, sourceType: 'fax_route', sourceId: faxId,
        idempotencyKey: `fax:${faxId}:route-transport`, createdBy: userId,
      });
      await require('../audit/audit.service').logAudit(client, {
        userId, action: 'FAX_TRANSPORT_SET', entityType: 'loading_faxes', entityId: faxId, entityRef: fax.fax_number,
        oldValues: { transport_rate: fax.transport_rate, transport_total: fax.transport_total },
        newValues: { transport_rate: rate, transport_total: total, payer: data.transportPayer || 'institution', base_on: data.baseOn || 'loaded_quantity' },
      });
    }

    // إشعار للسائق — يختلف حسب من يتحمل الأجرة
    if (payerType === 'trader' && payerTraderId) {
      // الحالة 1: الأجرة على التاجر
      const traderInfo = await client.query(
        `SELECT u.full_name, u.phone,
                a.governorate, a.area, a.address_text
         FROM customers c
         JOIN users u ON u.id = c.user_id
         LEFT JOIN customer_addresses a ON a.customer_id = c.id AND a.is_default = true
         WHERE c.id = $1
         ORDER BY a.created_at DESC
         LIMIT 1`,
        [payerTraderId]
      );
      if (traderInfo.rows.length > 0) {
        const traderName = traderInfo.rows[0].full_name;
        const traderPhone = traderInfo.rows[0].phone;
        const traderAddressParts = [
          traderInfo.rows[0].governorate,
          traderInfo.rows[0].area,
          traderInfo.rows[0].address_text,
        ].filter(Boolean);
        const traderAddress = traderAddressParts.length > 0
          ? traderAddressParts.join(' — ')
          : 'غير مسجَّل';

        // إشعار in-app — يتضمن خط السير، عنوان التاجر، المبلغ، وتوضيح أنه مقيّد على التاجر
        const traderBody =
          `خط السير: ${data.route}\n` +
          `أجور النقل: ${fmt(total)} ريال — مقيّدة على حساب التاجر (لن تُقيَّد عليك).\n` +
          `التاجر: ${traderName} — ${traderPhone}\n` +
          `عنوان التاجر: ${traderAddress}`;
        await client.query(
          `INSERT INTO notifications (user_id, title_ar, body_ar, type, reference_type, reference_id)
           SELECT d.user_id,
                  'أجور النقل مقيّدة على التاجر',
                  $1,
                  'TRANSPORT_ON_TRADER',
                  'loading_faxes',
                  $2
           FROM drivers d WHERE d.id = $3`,
          [traderBody, faxId, fax.driver_id]
        );

        await queueSms({
          client,
          phone: fax.driver_phone,
          templateKey: 'TRANSPORT_ON_TRADER',
          messageType: 'TRANSPORT_ON_TRADER',
          operationId: fax.fax_number || null,
          vars: {
            route: data.route, amount: fmt(total), trader_name: traderName,
            trader_phone: traderPhone, trader_address: traderAddress,
          },
          fallbackText: `مؤسسة الغولي: خط السير: ${data.route}. أجور النقل (${fmt(total)} ريال) مقيّدة على التاجر ${traderName} — رقمه: ${traderPhone} — عنوانه: ${traderAddress}.`,
        });
      }
    } else {
      // الحالة 2: الأجرة على المؤسسة
      const institutionBody = `خط السير: ${data.route} — مستحق النقل: ${fmt(total)} ريال من المؤسسة. يمكنك بدء الرحلة.`;
      await client.query(
        `INSERT INTO notifications (user_id, title_ar, body_ar, type, reference_type, reference_id)
         SELECT d.user_id,
                'تم تحديد خط السير',
                $1,
                'ROUTE_SET',
                'loading_faxes',
                $2
         FROM drivers d WHERE d.id = $3`,
        [institutionBody, faxId, fax.driver_id]
      );

      await queueSms({
        client,
        phone: fax.driver_phone,
        templateKey: 'ROUTE_SET',
        messageType: 'ROUTE_SET',
        operationId: fax.fax_number || null,
        vars: { route: data.route, amount: fmt(total) },
        fallbackText: `مؤسسة الغولي: تم تحديد خط سير رحلتك: ${data.route}. مستحق النقل: ${fmt(total)} ريال من المؤسسة.`,
      });
    }

    // FCM Push
    const fcmRes = await client.query(
      `SELECT u.fcm_token FROM users u
       JOIN drivers d ON d.user_id = u.id
       WHERE d.id = $1`,
      [fax.driver_id]
    );
    if (fcmRes.rows[0]?.fcm_token) {
      sendPushNotification(
        fcmRes.rows[0].fcm_token,
        'تم تحديد خط السير',
        `خط السير: ${data.route} — مستحق النقل: ${total} ريال.`,
        { type: 'ROUTE_SET', faxId: faxId }
      ).catch((e) => console.error('FCM error:', e.message));
    }



    await client.query('COMMIT');

    return {
      id: faxId,
      route: data.route,
      transport_total: total,
      base_quantity: baseQty,
      new_status: 'READY_FOR_TRANSIT',
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

module.exports.listAwaitingRoute = listAwaitingRoute;
module.exports.setRouteAndTransport = setRouteAndTransport;

const listFaxesForExport = async ({ status, from, to } = {}) => {
  const params = [];
  const where = [];
  if (status) { params.push(status); where.push(`f.status = $${params.length}`); }
  if (from) { params.push(from); where.push(`f.requested_at >= $${params.length}::date`); }
  if (to) { params.push(to); where.push(`f.requested_at < ($${params.length}::date + INTERVAL '1 day')`); }
  const r = await query(
    `SELECT f.fax_number, f.status, f.requested_at, f.issued_at, f.used_at,
            d.full_name AS driver_name, v.plate_number, s.name_ar AS factory_name,
            f.requested_quantity, f.loaded_quantity, f.quantity_discrepancy,
            f.route, f.transport_rate, f.transport_total, f.transport_payer
     FROM loading_faxes f
     LEFT JOIN drivers d ON d.id = f.driver_id
     LEFT JOIN vehicles v ON v.id = f.vehicle_id
     LEFT JOIN product_sources s ON s.id = f.factory_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY f.requested_at DESC
     LIMIT 5000`,
    params
  );
  return r.rows;
};

// ═══ السائق يؤكد التسليم ═══
// ═══ السائق يؤكد التسليم ═══
const driverMarkDelivered = async (faxId, userId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const f = await client.query(
      `SELECT f.*, o.id AS order_id, o.status AS order_status
       FROM loading_faxes f
       LEFT JOIN orders o ON o.id = f.order_id
       WHERE f.id = $1`,
      [faxId]
    );
    if (!f.rows.length) {
      const e = new Error('الرحلة غير موجودة'); e.status = 404; throw e;
    }
    const fax = f.rows[0];

    const d = await client.query(
      `SELECT id FROM drivers WHERE user_id = $1`, [userId]
    );
    if (!d.rows.length || d.rows[0].id !== fax.driver_id) {
      const e = new Error('غير مصرح'); e.status = 403; throw e;
    }

    await client.query(
      `UPDATE loading_faxes 
       SET status = 'DELIVERED', updated_at = NOW()
       WHERE id = $1`, [faxId]
    );

    if (fax.order_id) {
      await client.query(
        `UPDATE deliveries
         SET status = 'DELIVERED', delivered_at = NOW(), updated_at = NOW()
         WHERE order_id = $1 AND driver_id = $2`,
        [fax.order_id, fax.driver_id]
      );

      await client.query(
        `UPDATE orders SET status = 'DELIVERED', updated_at = NOW()
         WHERE id = $1`, [fax.order_id]
      );

      await client.query(
        `INSERT INTO order_status_history 
         (order_id, from_status, to_status, changed_by, reason)
         VALUES ($1, $2, 'DELIVERED', $3, 'تأكيد السائق التسليم')`,
        [fax.order_id, fax.order_status, userId]
      );
    }

    await client.query('COMMIT');
    return { ok: true, fax_id: faxId, had_order: !!fax.order_id };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

module.exports.listFaxesForExport = listFaxesForExport;

// ═══ الأدمن يكتب سعر النقل ═══
const setTransportRate = async (faxId, rate, userId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const f = await client.query(
      `SELECT * FROM loading_faxes WHERE id = $1`,
      [faxId]
    );
    if (!f.rows.length) {
      const e = new Error('الفاكس غير موجود'); e.status = 404; throw e;
    }
    const fax = f.rows[0];

    if (!rate || rate <= 0) {
      const e = new Error('السعر يجب أن يكون أكبر من صفر'); e.status = 400; throw e;
    }

    const baseQty = parseFloat(
      fax.loaded_quantity || fax.approved_quantity || fax.requested_quantity || 0
    );
    const total = rate * baseQty;

    await client.query(
      `UPDATE loading_faxes
       SET transport_rate = $1,
           transport_rate_unit = 'bag',
           transport_total = $2,
           transport_base_on = CASE 
             WHEN loaded_quantity IS NOT NULL THEN 'loaded_quantity'
             WHEN approved_quantity IS NOT NULL THEN 'approved_quantity'
             ELSE 'requested_quantity'
           END,
           transport_set_by = $3,
           transport_set_at = NOW(),
           updated_at = NOW()
       WHERE id = $4`,
      [rate, total, userId, faxId]
    );

    await client.query('COMMIT');
    return {
      ok: true,
      fax_id: faxId,
      transport_rate: rate,
      transport_total: total,
      base_quantity: baseQty,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

module.exports.driverMarkDelivered = driverMarkDelivered;
module.exports.setTransportRate = setTransportRate;
