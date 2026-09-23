const { pool, query } = require('../../config/db');

const requestFax = async (driverUserId, data) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const d = await client.query(`SELECT id FROM drivers WHERE user_id = $1`, [driverUserId]);
    if (d.rows.length === 0) {
      const err = new Error('السائق غير موجود');
      err.status = 404;
      throw err;
    }
    const driverId = d.rows[0].id;

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
      `SELECT id FROM loading_faxes WHERE driver_id = $1 AND vehicle_id = $2
       AND status IN ('REQUESTED','APPROVED','ISSUED') LIMIT 1`,
      [driverId, data.vehicleId]
    );
    if (ex.rows.length > 0) {
      const err = new Error('لديك فاكس نشط على هذه القاطرة');
      err.status = 400;
      err.code = 'FAX_ALREADY_EXISTS';
      throw err;
    }

    const fax = await client.query(
      `INSERT INTO loading_faxes
       (order_id, driver_id, vehicle_id, factory_id, requested_quantity,
        status, requested_at, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, 'REQUESTED', NOW(), $6, $7)
       RETURNING *`,
      [data.orderId || null, driverId, data.vehicleId, data.factoryId,
       data.quantity, data.notes || null, driverUserId]
    );

    await client.query(
      `INSERT INTO automation_events (event_type, entity_type, entity_id, payload)
       VALUES ('fax.requested', 'loading_faxes', $1, $2)`,
      [fax.rows[0].id, JSON.stringify({ driver_id: driverId })]
    );

    await client.query('COMMIT');
    return { ...fax.rows[0], factory_name: f.rows[0].name_ar, plate_number: v.rows[0].plate_number };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const approveFax = async (faxId, userId) => {
  const r = await query(
    `UPDATE loading_faxes SET status = 'APPROVED', approved_at = NOW(),
     updated_by = $1, updated_at = NOW()
     WHERE id = $2 AND status = 'REQUESTED' RETURNING *`,
    [userId, faxId]
  );
  if (r.rows.length === 0) {
    const err = new Error('الفاكس غير موجود أو ليس بانتظار الاعتماد');
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
    const err = new Error('الفاكس غير موجود');
    err.status = 400;
    throw err;
  }
  await query(
    `INSERT INTO automation_events (event_type, entity_type, entity_id, payload)
     VALUES ('fax.issued', 'loading_faxes', $1, $2)`,
    [faxId, JSON.stringify({ fax_number: faxNumber })]
  );
  return r.rows[0];
};

module.exports = { requestFax, approveFax, issueFax };

const setRoute = async (faxId, route, userId) => {
  const r = await query(
    `UPDATE loading_faxes SET route = $1, route_set_by = $2, route_set_at = NOW(),
     updated_at = NOW() WHERE id = $3 RETURNING *`,
    [route, userId, faxId]
  );
  if (r.rows.length === 0) {
    const err = new Error('الفاكس غير موجود');
    err.status = 404;
    throw err;
  }
  return r.rows[0];
};

const setTransport = async (faxId, data, userId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const f = await client.query(
      `SELECT f.*, d.id AS driver_id FROM loading_faxes f
       JOIN drivers d ON d.id = f.driver_id
       WHERE f.id = $1 FOR UPDATE`,
      [faxId]
    );
    if (f.rows.length === 0) {
      const err = new Error('الفاكس غير موجود');
      err.status = 404;
      throw err;
    }
    const fax = f.rows[0];
    const baseQty = fax.approved_quantity || fax.requested_quantity || 0;
    const rate = parseFloat(data.rate);
    const total = rate * parseFloat(baseQty);
    const prevRate = fax.transport_rate;
    const editReason = prevRate && parseFloat(prevRate) !== rate ? data.editReason : null;

    await client.query(
      `UPDATE loading_faxes SET transport_rate = $1, transport_rate_unit = $2,
       transport_total = $3, transport_base_on = $4, transport_set_by = $5,
       transport_set_at = NOW(), transport_previous_rate = $6,
       transport_edit_reason = $7, updated_at = NOW() WHERE id = $8`,
      [rate, data.unit || 'bag', total, data.baseOn || 'approved_quantity',
       userId, prevRate, editReason, faxId]
    );

    const d = await client.query(
      `SELECT current_balance FROM drivers WHERE id = $1`,
      [fax.driver_id]
    );
    const newBalance = parseFloat(d.rows[0].current_balance || 0) + total;

    await client.query(
      `INSERT INTO driver_ledger
       (driver_id, order_id, transaction_type, description, debit, credit,
        balance_after, reference_code, created_by)
       VALUES ($1, $2, 'transport_due', $3, $4, 0, $5, $6, $7)`,
      [fax.driver_id, fax.order_id,
       'مستحق نقل — فاكس ' + (fax.fax_number || 'بدون رقم'),
       total, newBalance, fax.fax_number, userId]
    );

    await client.query(
      `UPDATE drivers SET current_balance = $1 WHERE id = $2`,
      [newBalance, fax.driver_id]
    );

    await client.query('COMMIT');
    return { transport_total: total, base_quantity: parseFloat(baseQty) };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const enterFactory = async (faxId, driverUserId) => {
  const r = await query(
    `UPDATE loading_faxes SET factory_entered_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND driver_id = (SELECT id FROM drivers WHERE user_id = $2)
       AND status = 'ISSUED' AND factory_entered_at IS NULL RETURNING *`,
    [faxId, driverUserId]
  );
  if (r.rows.length === 0) {
    const err = new Error('لا يمكن تسجيل الدخول للمصنع');
    err.status = 400;
    throw err;
  }
  return r.rows[0];
};

const recordLoading = async (faxId, loadedQty, userId) => {
  const r = await query(
    `UPDATE loading_faxes SET status = 'USED', used_at = NOW(),
     factory_exited_at = NOW(), updated_by = $1, updated_at = NOW()
     WHERE id = $2 AND status = 'ISSUED' RETURNING *`,
    [userId, faxId]
  );
  if (r.rows.length === 0) {
    const err = new Error('الفاكس ليس في حالة تسمح بالتحميل');
    err.status = 400;
    throw err;
  }
  return r.rows[0];
};

const listPendingFaxes = async () => {
  const r = await query(
    `SELECT f.*, d.full_name AS driver_name, d.phone AS driver_phone,
            v.plate_number, s.name_ar AS factory_name
     FROM loading_faxes f
     LEFT JOIN drivers d ON d.id = f.driver_id
     LEFT JOIN vehicles v ON v.id = f.vehicle_id
     LEFT JOIN product_sources s ON s.id = f.factory_id
     WHERE f.status IN ('REQUESTED','APPROVED','ISSUED')
     ORDER BY f.requested_at DESC`
  );
  return r.rows;
};

const listDriverFaxes = async (driverUserId) => {
  const r = await query(
    `SELECT f.*, s.name_ar AS factory_name, v.plate_number
     FROM loading_faxes f
     LEFT JOIN product_sources s ON s.id = f.factory_id
     LEFT JOIN vehicles v ON v.id = f.vehicle_id
     WHERE f.driver_id = (SELECT id FROM drivers WHERE user_id = $1)
     ORDER BY f.requested_at DESC LIMIT 50`,
    [driverUserId]
  );
  return r.rows;
};

const getFaxById = async (faxId) => {
  const r = await query(
    `SELECT f.*, d.full_name AS driver_name, d.phone AS driver_phone,
            v.plate_number, s.name_ar AS factory_name
     FROM loading_faxes f
     LEFT JOIN drivers d ON d.id = f.driver_id
     LEFT JOIN vehicles v ON v.id = f.vehicle_id
     LEFT JOIN product_sources s ON s.id = f.factory_id
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

module.exports = {
  requestFax, approveFax, issueFax,
  setRoute, setTransport,
  enterFactory, recordLoading,
  listPendingFaxes, listDriverFaxes, getFaxById, cancelFax,
  listPendingRouteAndPrice,
};

/**
 * الموظف ينشئ فاكس مباشرة لأي سائق بدون طلب مسبق
 * يُستخدم عندما:
 * - السائق لا يستخدم التطبيق
 * - التاجر لا يستخدم التطبيق
 * - المؤسسة تريد تسريع العملية
 */
const requestFaxByStaff = async (data, staffUserId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // تحقق من السائق
    const d = await client.query(
      `SELECT id, driver_type, owner_trader_id, full_name FROM drivers WHERE id = $1`,
      [data.driverId]
    );
    if (d.rows.length === 0) {
      const err = new Error('السائق غير موجود');
      err.status = 404;
      throw err;
    }
    const driver = d.rows[0];

    // تحقق من القاطرة
    const v = await client.query(
      `SELECT id, plate_number FROM vehicles WHERE id = $1`,
      [data.vehicleId]
    );
    if (v.rows.length === 0) {
      const err = new Error('القاطرة غير موجودة');
      err.status = 404;
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
      [driver.id, data.vehicleId]
    );
    if (ex.rows.length > 0) {
      const err = new Error('يوجد فاكس نشط على هذه القاطرة');
      err.status = 400;
      err.code = 'FAX_ALREADY_EXISTS';
      throw err;
    }

    const isManaged = driver.driver_type !== 'trader_driver';

    // أنشئ الفاكس بحالة REQUESTED مباشرة
    const fax = await client.query(
      `INSERT INTO loading_faxes
       (order_id, driver_id, vehicle_id, factory_id, requested_quantity,
        status, requested_at, notes, created_by,
        requested_by_user_id, trader_id, driver_type_snapshot, is_managed_by_institution)
       VALUES ($1,$2,$3,$4,$5,'REQUESTED',NOW(),$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        data.orderId || null, driver.id, data.vehicleId, data.factoryId,
        data.quantity, data.notes || null, staffUserId,
        staffUserId, driver.owner_trader_id || null,
        driver.driver_type, isManaged,
      ]
    );

    // سجّل الحدث
    await client.query(
      `INSERT INTO automation_events (event_type, entity_type, entity_id, payload)
       VALUES ('fax.created_by_staff', 'loading_faxes', $1, $2)`,
      [fax.rows[0].id, JSON.stringify({
        driver_id: driver.id,
        driver_type: driver.driver_type,
        staff_id: staffUserId,
      })]
    );

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

/**
 * إصدار الفاكس مباشرة + إشعار السائق
 * يجمع approve + issue في خطوة واحدة (اختياري)
 */
const issueAndNotify = async (faxId, faxNumber, staffUserId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const f = await client.query(
      `SELECT f.*, d.full_name AS driver_name, d.phone AS driver_phone,
              s.name_ar AS factory_name
       FROM loading_faxes f
       JOIN drivers d ON d.id = f.driver_id
       LEFT JOIN product_sources s ON s.id = f.factory_id
       WHERE f.id = $1 FOR UPDATE`,
      [faxId]
    );
    if (f.rows.length === 0) {
      const err = new Error('الفاكس غير موجود');
      err.status = 404;
      throw err;
    }
    const fax = f.rows[0];

    if (!['REQUESTED','APPROVED'].includes(fax.status)) {
      const err = new Error('الفاكس لا يمكن إصداره في حالته الحالية');
      err.status = 400;
      throw err;
    }

    // أصدر الفاكس
    await client.query(
      `UPDATE loading_faxes
       SET status = 'ISSUED', fax_number = $1, issued_at = NOW(),
           approved_at = COALESCE(approved_at, NOW()),
           updated_by = $2, updated_at = NOW()
       WHERE id = $3`,
      [faxNumber, staffUserId, faxId]
    );

    // سجّل حدث SMS
    await client.query(
      `INSERT INTO automation_events (event_type, entity_type, entity_id, payload)
       VALUES ('fax.issued', 'loading_faxes', $1, $2)`,
      [faxId, JSON.stringify({
        fax_number: faxNumber,
        driver_id: fax.driver_id,
        notify_sms: true,
      })]
    );

    // أضف SMS في الجدول (سيُرسل بواسطة worker لاحقًا)
    await client.query(
      `INSERT INTO sms_messages (user_id, phone, message_type, message, status)
       VALUES ($1, $2, 'FAX_ISSUED', $3, 'pending')`,
      [
        null, // user_id can be null
        fax.driver_phone,
        `تم إصدار فاكس التحميل رقم ${faxNumber} من ${fax.factory_name || 'المصنع'}. يرجى التوجه للمصنع. الكمية: ${fax.requested_quantity} كيس.`,
      ]
    );

    await client.query('COMMIT');
    return {
      id: faxId,
      status: 'ISSUED',
      fax_number: faxNumber,
      sms_queued: true,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

module.exports.requestFaxByStaff = requestFaxByStaff;
module.exports.issueAndNotify = issueAndNotify;
