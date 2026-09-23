const { pool, query } = require('../../config/db');

// ============== إنشاء الفاكس ==============
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
      `SELECT id, driver_type, owner_trader_id, full_name FROM drivers WHERE id = $1`,
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

    await client.query(
      `INSERT INTO automation_events (event_type, entity_type, entity_id, payload)
       VALUES ('fax.created_by_staff', 'loading_faxes', $1, $2)`,
      [fax.rows[0].id, JSON.stringify({ staff_id: staffUserId })]
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

    await client.query(
      `INSERT INTO sms_messages (phone, message_type, message, status)
       VALUES ($1, 'FAX_ISSUED', $2, 'pending')`,
      [
        fax.driver_phone,
        `تم إصدار فاكس التحميل رقم ${faxNumber} من ${fax.factory_name || 'المصنع'}. يرجى التوجه للمصنع. الكمية: ${fax.requested_quantity} كيس.`,
      ]
    );

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
  requestFax, requestFaxByStaff,
  approveFax, issueFax, issueAndNotify,
};

const setRoute = async (faxId, route, userId) => {
  const r = await query(
    `UPDATE loading_faxes SET route = $1, route_set_by = $2, route_set_at = NOW(),
     updated_at = NOW() WHERE id = $3 RETURNING *`,
    [route, userId, faxId]
  );
  if (r.rows.length === 0) {
    const err = new Error('غير موجود');
    err.status = 404;
    throw err;
  }
  return r.rows[0];
};

const setTransport = async (faxId, data, userId) => {
  const f = await query(
    `SELECT f.*, d.id AS driver_id, d.driver_type FROM loading_faxes f
     JOIN drivers d ON d.id = f.driver_id WHERE f.id = $1`,
    [faxId]
  );
  if (f.rows.length === 0) {
    const err = new Error('غير موجود');
    err.status = 404;
    throw err;
  }
  const fax = f.rows[0];
  const baseQty = fax.approved_quantity || fax.requested_quantity || 0;
  const rate = parseFloat(data.rate);
  const total = rate * parseFloat(baseQty);

  await query(
    `UPDATE loading_faxes SET transport_rate = $1, transport_rate_unit = $2,
     transport_total = $3, transport_base_on = $4, transport_set_by = $5,
     transport_set_at = NOW(), updated_at = NOW() WHERE id = $6`,
    [rate, data.unit || 'bag', total, data.baseOn || 'approved_quantity', userId, faxId]
  );

  if (fax.driver_type === 'trader_driver') {
    return { transport_total: total, skipped_ledger: true };
  }

  const d = await query(`SELECT current_balance FROM drivers WHERE id = $1`, [fax.driver_id]);
  const newBalance = parseFloat(d.rows[0].current_balance || 0) + total;

  await query(
    `INSERT INTO driver_ledger
     (driver_id, order_id, transaction_type, description, debit, credit,
      balance_after, reference_code, created_by)
     VALUES ($1, $2, 'transport_due', $3, $4, 0, $5, $6, $7)`,
    [fax.driver_id, fax.order_id,
     'مستحق نقل — فاكس ' + (fax.fax_number || 'بدون رقم'),
     total, newBalance, fax.fax_number, userId]
  );

  await query(`UPDATE drivers SET current_balance = $1 WHERE id = $2`, [newBalance, fax.driver_id]);

  return { transport_total: total, base_quantity: parseFloat(baseQty) };
};

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
  const r = await query(
    `UPDATE loading_faxes SET status = 'USED', used_at = NOW(),
     factory_exited_at = NOW(), updated_by = $1, updated_at = NOW()
     WHERE id = $2 AND status = 'ISSUED' RETURNING *`,
    [userId, faxId]
  );
  if (r.rows.length === 0) {
    const err = new Error('لا يمكن التسجيل في هذه الحالة');
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

module.exports.setRoute = setRoute;
module.exports.setTransport = setTransport;
module.exports.enterFactory = enterFactory;
module.exports.recordLoading = recordLoading;
module.exports.listPendingFaxes = listPendingFaxes;
module.exports.listDriverFaxes = listDriverFaxes;
module.exports.listTraderFaxes = listTraderFaxes;
module.exports.getFaxById = getFaxById;
module.exports.cancelFax = cancelFax;
module.exports.listPendingRouteAndPrice = listPendingRouteAndPrice;
