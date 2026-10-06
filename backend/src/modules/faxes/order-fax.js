'use strict';
/**
 * إنشاء فاكس لطلب (B): مصدر واحد يستعمله createFaxFromOrder (التاجر) و deliveries.assign (المؤسسة).
 *  - الفاكس يُنشأ ISSUED مباشرة (كما bulk-fax): الموظف/النظام هو من اعتمد، فلا طلب ولا اعتماد منفصلان.
 *  - وجهة واحدة تلقائية = عنوان التاجر، مرتبطة بالطلب عبر fulfills_order_id (يمنع تسليم الوجهة من إنشاء
 *    طلب جديد → لا ازدواج فوترة) ويُغلق بها الطلب عند التسليم.
 *  - فاكس نشط واحد لكل طلب: قفل صف الطلب + فحص + UNIQUE جزئي (m37).
 *  - عدم الجاهزية (سائق/قاطرة/بيانات ناقصة) → FAX_NOT_READY + حدث automation_events صريح (لا صمت).
 * يجب استدعاؤها بـ client داخل معاملة. لا تُجري COMMIT.
 */
const { generateFaxNumber } = require('../../utils/number-generator');
const { queueSms } = require('../../services/sms.service');

const BAGS_PER_TON = 20;
const ACTIVE_STATUSES = ['REQUESTED', 'APPROVED', 'ISSUED', 'USED', 'READY_FOR_TRANSIT'];

const httpError = (message, status = 400, code = null) => {
  const e = new Error(message);
  e.status = status;
  if (code) e.code = code;
  return e;
};

/** يسجّل حدثًا ثم يرمي FAX_NOT_READY (يلتقطه المستدعون فيبقى الطلب كما هو، لكن الحدث يبقى مرئيًا). */
const blockFax = async (client, orderId, eventType, reason, message, extra = {}) => {
  await client.query(
    `INSERT INTO automation_events (event_type, entity_type, entity_id, payload)
     VALUES ($1, 'orders', $2, $3)`,
    [eventType, orderId, JSON.stringify({ reason, ...extra })]
  );
  console.warn(`[order-fax] ${eventType} order=${orderId} reason=${reason}`);
  const err = new Error(message);
  err.code = 'FAX_NOT_READY'; err.status = 409; err.reason = reason;
  throw err;
};

const placeholder = (s) => !s || !String(s).trim() || String(s).trim() === 'يُحدد';

/**
 * @param {object} client  عميل المعاملة
 * @param {{orderId:string, driverId:string, vehicleId:string, createdBy:string,
 *          managed:boolean, advanceOrder?:boolean}} p
 *   managed=false → فاكس تاجر (سائق التاجر)، true → سائق المؤسسة.
 *   advanceOrder  → نقل الطلب PAYMENT_APPROVED → PREPARING (مسار التاجر فقط).
 * @returns {{fax:{id,fax_number,status}, created:boolean, destination_id?:string}}
 */
const createOrderFax = async (client, p) => {
  const { orderId, driverId, vehicleId, createdBy, managed, advanceOrder = false } = p;

  // 1) قفل الطلب + سياقه (يُسلسل اعتمادين متزامنين لنفس الطلب)
  const o = await client.query(
    `SELECT o.id, o.customer_id, o.transport_beneficiary, o.factory_id,
            c.user_id AS customer_user_id, c.governorate AS c_gov, c.area AS c_area, c.default_address,
            u.full_name AS customer_name, u.phone AS customer_phone,
            a.governorate AS a_gov, a.area AS a_area, a.address_text,
            oi.quantity, oi.unit, oi.source_id
     FROM orders o
     JOIN customers c ON c.id = o.customer_id
     JOIN users u ON u.id = c.user_id
     LEFT JOIN customer_addresses a ON a.id = o.address_id
     LEFT JOIN LATERAL (SELECT quantity, unit, source_id FROM order_items
                        WHERE order_id = o.id ORDER BY id ASC LIMIT 1) oi ON TRUE
     WHERE o.id = $1
     FOR UPDATE OF o`,
    [orderId]
  );
  if (!o.rows.length) throw httpError('الطلب غير موجود', 404);
  const order = o.rows[0];

  // 2) idempotent: فاكس نشط قائم يُعاد كما هو
  const ex = await client.query(
    `SELECT id, fax_number, status FROM loading_faxes
     WHERE order_id = $1 AND status IN (${ACTIVE_STATUSES.map((s) => `'${s}'`).join(',')}) LIMIT 1`,
    [orderId]
  );
  if (ex.rows.length) return { fax: ex.rows[0], created: false };

  // 3) الطلب مكلَّف أصلًا كوجهة على رحلة مؤسسة → لا فاكس خاص به
  const assigned = await client.query(
    `SELECT id, fax_id FROM delivery_destinations WHERE fulfills_order_id = $1 LIMIT 1`, [orderId]
  );
  if (assigned.rows.length) throw httpError('الطلب مكلَّف على رحلة قائمة', 409, 'ORDER_ALREADY_ASSIGNED');

  // 4) جاهزية البيانات — كل نقص يُسجَّل صراحةً
  if (!driverId || !vehicleId) {
    await blockFax(client, orderId, 'fax.blocked_missing_driver', 'MISSING_DRIVER_OR_VEHICLE',
      'لا يمكن إنشاء الفاكس قبل تحديد سائق وقاطرة', { driver_id: driverId || null, vehicle_id: vehicleId || null });
  }
  const factoryId = order.source_id || order.factory_id || null;
  const qty = Number(order.quantity);
  if (!factoryId || !(qty > 0)) {
    await blockFax(client, orderId, 'fax.blocked_incomplete_order', 'ORDER_DATA_INCOMPLETE',
      'بيانات الطلب ناقصة (مصنع/كمية) — لا يمكن إنشاء الفاكس', { factory_id: factoryId, quantity: order.quantity });
  }

  const d = await client.query(
    `SELECT d.id, d.driver_type, d.user_id, COALESCE(d.phone, u.phone) AS phone
     FROM drivers d LEFT JOIN users u ON u.id = d.user_id WHERE d.id = $1`, [driverId]);
  if (!d.rows.length) throw httpError('السائق غير موجود', 404);
  const v = await client.query(`SELECT id FROM vehicles WHERE id = $1`, [vehicleId]);
  if (!v.rows.length) throw httpError('القاطرة غير موجودة', 404);
  const driver = d.rows[0];

  const unit = order.unit === 'ton' ? 'ton' : 'bag';
  const bags = qty * (unit === 'ton' ? BAGS_PER_TON : 1); // الفاكس بالأكياس دائمًا (الطن = 20 كيس)
  const gov = order.a_gov || order.c_gov || null;
  const area = order.a_area || order.c_area || null;
  const addressText = !placeholder(order.address_text) ? order.address_text : (order.default_address || null);
  const traderPays = order.transport_beneficiary === 'trader';
  const driverType = driver.driver_type || (managed ? 'institution_driver' : 'trader_driver');

  // 5) الفاكس: ISSUED مباشرة
  const faxNumber = await generateFaxNumber(client); // بعد التحققات (القفل يدوم حتى COMMIT)
  let fax;
  try {
    const f = await client.query(
      `INSERT INTO loading_faxes
       (order_id, driver_id, vehicle_id, factory_id, requested_quantity, approved_quantity,
        status, requested_at, approved_at, issued_at,
        created_by, requested_by_user_id, trader_id, driver_type_snapshot, is_managed_by_institution,
        transport_payer, transport_payer_trader_id, fax_number,
        delivery_governorate, delivery_area, delivery_address)
       VALUES ($1,$2,$3,$4,$5,$5,'ISSUED',NOW(),NOW(),NOW(),$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING id, fax_number, status`,
      [orderId, driverId, vehicleId, factoryId, bags,
       createdBy, order.customer_user_id, order.customer_id, driverType, !!managed,
       traderPays ? 'trader' : 'institution', traderPays ? order.customer_id : null, faxNumber,
       gov, area, addressText]
    );
    fax = f.rows[0];
  } catch (err) {
    if (err.code === '23505' && /order_active/.test(err.constraint || err.message || '')) {
      throw httpError('يوجد فاكس نشط لهذا الطلب', 409, 'FAX_ALREADY_EXISTS_FOR_ORDER');
    }
    throw err;
  }

  // 6) الوجهة الوحيدة = عنوان التاجر، مرتبطة بالطلب
  const dest = await client.query(
    `INSERT INTO delivery_destinations
     (fax_id, destination_type, trader_id, quantity, unit, label, governorate, area, address_text,
      contact_phone, contact_name, sort_order, created_by, fulfills_order_id)
     VALUES ($1,'trader',$2,$3,$4,$5,$6,$7,$8,$9,$10,0,$11,$12)
     RETURNING id`,
    [fax.id, order.customer_id, qty, unit, order.customer_name || null, gov, area, addressText,
     order.customer_phone || null, order.customer_name || null, createdBy, orderId]
  );

  // 7) الطلب
  await client.query(`UPDATE orders SET fax_id = $1, updated_at = NOW() WHERE id = $2`, [fax.id, orderId]);
  if (advanceOrder) {
    const u = await client.query(
      `UPDATE orders SET status = 'PREPARING', updated_at = NOW()
       WHERE id = $1 AND status = 'PAYMENT_APPROVED' RETURNING id`, [orderId]);
    if (u.rows.length) {
      await client.query(
        `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, reason)
         VALUES ($1, 'PAYMENT_APPROVED', 'PREPARING', $2, $3)`,
        [orderId, createdBy, `إصدار الفاكس ${fax.fax_number} تلقائيًا من الطلب المعتمد`]
      );
    }
  }
  await client.query(
    `INSERT INTO automation_events (event_type, entity_type, entity_id, payload)
     VALUES ('fax.created_from_order', 'orders', $1, $2)`,
    [orderId, JSON.stringify({ fax_id: fax.id, driver_id: driverId, vehicle_id: vehicleId,
      managed: !!managed, destination_id: dest.rows[0].id })]
  );

  // 8) إشعار السائق (داخلي + SMS؛ فشلهما لا يُفشل الإنشاء)
  const fac = await client.query(`SELECT name_ar FROM product_sources WHERE id = $1`, [factoryId]);
  const factoryName = (fac.rows[0] && fac.rows[0].name_ar) || 'المصنع';
  await client.query(
    `INSERT INTO notifications (user_id, title_ar, body_ar, type, reference_type, reference_id)
     SELECT d.user_id, 'فاكس تحميل جديد',
            'فاكس رقم ' || $1 || ' من ' || $2 || '. الكمية: ' || $3 || ' كيس. يرجى التوجه للمصنع.',
            'FAX_ISSUED', 'loading_faxes', $4
     FROM drivers d WHERE d.id = $5 AND d.user_id IS NOT NULL`,
    [fax.fax_number, factoryName, String(bags), fax.id, driverId]
  );
  await client.query('SAVEPOINT order_fax_sms');
  try {
    await queueSms({
      client, phone: driver.phone, templateKey: 'FAX_ISSUED', messageType: 'FAX_ISSUED',
      operationId: fax.fax_number,
      vars: { fax_number: fax.fax_number, factory_name: factoryName, quantity: bags },
      fallbackText: `مؤسسة الغولي: تم إصدار فاكس التحميل رقم ${fax.fax_number} من ${factoryName}. الكمية: ${bags} كيس.`,
    });
    await client.query('RELEASE SAVEPOINT order_fax_sms');
  } catch (smsErr) {
    await client.query('ROLLBACK TO SAVEPOINT order_fax_sms');
    console.error('[order-fax] SMS (تم تجاهله):', smsErr.message);
  }

  return { fax, created: true, destination_id: dest.rows[0].id };
};

module.exports = { createOrderFax, blockFax, ACTIVE_STATUSES };
