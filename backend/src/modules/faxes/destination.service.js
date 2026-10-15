'use strict';
const { pool, query } = require('../../config/db');
const { toMinor } = require('../accounting/accounting.engine');
const engine = require('../accounting/accounting.engine');
const ledgerCore = require('../accounting/ledger.core');
const { calculatePrice } = require('../products/products.service');
const { getCustomerProductPrice } = require('../orders/transport.service');
const { sendPushNotification } = require('../../services/fcm.service');
const { generateOrderNumber } = require('../../utils/number-generator');
const { assertFaxDeliverable } = require('./delivery-gate');

const listDestinations = async (faxId) => {
  const r = await query(`
    SELECT d.*,
           c.id AS trader_id,
           u.full_name AS trader_name,
           u.phone AS trader_phone,
           w.name_ar AS warehouse_name,
           w.code AS warehouse_code
    FROM delivery_destinations d
    LEFT JOIN customers c ON c.id = d.trader_id
    LEFT JOIN users u ON u.id = c.user_id
    LEFT JOIN institution_warehouses w ON w.id = d.warehouse_id
    WHERE d.fax_id = $1
    ORDER BY d.sort_order, d.created_at
  `, [faxId]);
  return r.rows;
};

/**
 * يقترح سعر الوحدة للتاجر: سعره الخاص أولًا، ثم قائمة الأسعار حسب نوع العميل والكمية.
 * يُحوَّل بين الكيس والطن إن اختلفت وحدة التسعير. الإدارة تستطيع تعديله قبل الحفظ.
 */
const suggestDestinationPrice = async (traderCustomerId, productId, quantity, unit) => {
  const q = Number(quantity) || 0;
  const u = unit === 'ton' ? 'ton' : 'bag';
  const cust = await query(`SELECT customer_type FROM customers WHERE id = $1`, [traderCustomerId]);
  if (!cust.rows.length) return null;
  const special = await getCustomerProductPrice(traderCustomerId, productId, q);
  if (special !== null && special > 0) {
    return { price: Math.round(special * 100) / 100, unit: u, source: 'customer_price' };
  }
  const std = await calculatePrice(productId, cust.rows[0].customer_type, q);
  if (!std || !(Number(std.price) > 0)) return null;
  const pu = std.pricing_unit === 'ton' ? 'ton' : 'bag';
  let price = Number(std.price);
  if (pu !== u) price = pu === 'ton' ? price / 20 : price * 20;
  return { price: Math.round(price * 100) / 100, unit: u, source: 'price_list', list: std.price_list_name || null };
};

/**
 * طلب تلقائي لوجهة تاجر بلا طلب: يُسعَّر بسعر الوجهة (لكل وحدة الوجهة) ويُرتبط بها.
 * يُنشأ مرة واحدة عند حفظ الوجهة، ويُقيَّد بيعه في حساب التاجر عند التسليم.
 */
const createAutoOrderForDestination = async (client, p) => {
  const prod = await client.query(`SELECT packaging_type FROM products WHERE id = $1`, [p.productId]);
  if (!prod.rows.length) throw httpError('الصنف غير موجود', 404, 'PRODUCT_NOT_FOUND');
  const subtotal = engine.fromMinor(engine.divRound(engine.toMinor(p.quantity) * engine.toMinor(p.unitPrice), 100));
  const orderNumber = await generateOrderNumber(client);
  const o = await client.query(
    `INSERT INTO orders (order_number, customer_id, status, source, currency, subtotal, discount_amount, shipping_amount,
       total_amount, paid_amount, remaining_amount, notes, created_by, delivery_type, transport_beneficiary, auto_for_destination)
     VALUES ($1, $2, 'PREPARING', 'admin_destination', 'YER', $3, 0, 0, $3, 0, $3, $4, $5, 'alghouli_delivery', 'institution', TRUE)
     RETURNING id, order_number, customer_id, subtotal, currency`,
    [orderNumber, p.customerId, subtotal, `طلب تلقائي من وجهة فاكس ${p.faxNumber || ''} — ${p.quantity} ${p.unit}`, p.userId]
  );
  const order = o.rows[0];
  await client.query(
    `INSERT INTO order_items (order_id, product_id, source_id, packaging_type, quantity, unit, unit_price, discount, line_total)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8)`,
    [order.id, p.productId, p.sourceId, prod.rows[0].packaging_type || null, p.quantity, p.unit, p.unitPrice, subtotal]
  );
  await client.query(
    `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, reason)
     VALUES ($1, NULL, 'PREPARING', $2, 'طلب تلقائي من وجهة فاكس')`,
    [order.id, p.userId]
  );
  // إشعار التاجر بالتفاصيل المطلوبة: الصنف والكمية والسعر والمطلوب
  const info = await client.query(
    `SELECT c.user_id, p.name_ar AS product_name FROM customers c, products p WHERE c.id = $1 AND p.id = $2`,
    [p.customerId, p.productId]
  );
  if (info.rows[0] && info.rows[0].user_id) {
    const unitAr = p.unit === 'ton' ? 'طن' : 'كيس';
    await client.query(
      `INSERT INTO notifications (user_id, title_ar, body_ar, type, reference_type, reference_id)
       VALUES ($1, 'شحنة جديدة لحسابك', $2, 'ORDER_CREATED', 'orders', $3)`,
      [info.rows[0].user_id,
        `شحنة أسمنت ${info.rows[0].product_name || ''}، عدد ${p.quantity} ${unitAr}، السعر ${p.unitPrice} ر.ي للوحدة، الإجمالي ${subtotal} ر.ي — يرجى السداد`,
        order.id]
    );
  }
  return order;
};

/** يرحّل بيع الوجهة التلقائية إلى حساب التاجر. مرة واحدة فقط (idempotency). */
const postDestinationSale = async (client, order, dest, userId) => {
  await ledgerCore.postCustomerEntry(client, {
    customerId: order.customer_id,
    orderId: order.id,
    currency: order.currency || 'YER',
    debit: order.subtotal,
    credit: 0,
    transactionType: 'actual_sale',
    description: `بيع: ${dest.quantity} ${dest.unit === 'ton' ? 'طن' : 'كيس'} — فاكس ${dest.fax_number || ''}`,
    sourceType: 'destination',
    sourceId: dest.id,
    idempotencyKey: `dest-sale:${dest.id}`,
    createdBy: userId,
  });
};

const replaceDestinations = async (client, faxId, destinations, userId) => {
  // صنف الفاكس ومصنعه: الوجهة ترث الصنف (الفاكس صنف واحد)
  const faxRow = (await client.query(`SELECT factory_id, product_id FROM loading_faxes WHERE id = $1`, [faxId])).rows[0] || {};
  // الطلبات التلقائية للوجهات المعلّقة تُلغى (لم تُسلَّم بعد)، ثم تُحذف وجهاتها
  await client.query(
    `UPDATE orders SET status = 'CANCELLED', updated_at = NOW()
     WHERE auto_for_destination = TRUE AND status = 'PREPARING'
       AND id IN (SELECT fulfills_order_id FROM delivery_destinations
                  WHERE fax_id = $1 AND status = 'PENDING' AND fulfills_order_id IS NOT NULL)`,
    [faxId]
  );
  await client.query(
    `DELETE FROM delivery_destinations WHERE fax_id = $1 AND status = 'PENDING'
       AND (fulfills_order_id IS NULL OR fulfills_order_id IN (SELECT id FROM orders WHERE auto_for_destination = TRUE))`,
    [faxId]
  );

  const inserted = [];
  for (let i = 0; i < destinations.length; i++) {
    const d = destinations[i];

    let traderInfo = null;
    if (d.destinationType === 'trader' && d.traderId) {
      const t = await client.query(`
        SELECT c.id, c.governorate, c.area, c.default_address, u.full_name, u.phone
        FROM customers c JOIN users u ON u.id = c.user_id WHERE c.id = $1
      `, [d.traderId]);
      if (!t.rows.length) { const e = new Error('التاجر غير موجود'); e.status = 404; throw e; }
      traderInfo = t.rows[0];
    }

    let warehouseInfo = null;
    if (d.destinationType === 'warehouse' && d.warehouseId) {
      const w = await client.query(`
        SELECT id, name_ar, governorate, area, address_text, contact_phone, manager_name
        FROM institution_warehouses WHERE id = $1
      `, [d.warehouseId]);
      if (!w.rows.length) { const e = new Error('المستودع غير موجود'); e.status = 404; throw e; }
      warehouseInfo = w.rows[0];
    }

    // وجهة تاجر بلا طلب: تتطلب الصنف والمصنع والسعر، ويُنشأ لها طلب تلقائي بعد الإدراج
    if (d.destinationType === 'trader') {
      if (!d.productId) d.productId = faxRow.product_id || null;
      if (faxRow.product_id && d.productId !== faxRow.product_id) {
        throw httpError('الصنف لا يطابق صنف الفاكس', 422, 'PRODUCT_MISMATCH');
      }
      if (!d.sourceId) d.sourceId = faxRow.factory_id || null;
    }
    // السعر المقترح تلقائيًا إن لم تُدخله الإدارة (تظهر قيمته للإدارة قبل الحفظ عبر نقطة الاقتراح)
    if (d.destinationType === 'trader' && traderInfo && d.productId && !(Number(d.unitPrice) > 0)) {
      const sug = await suggestDestinationPrice(traderInfo.id, d.productId, d.quantity, d.unit || 'bag');
      if (sug) d.unitPrice = sug.price;
    }
    if (d.destinationType === 'trader' && !!traderInfo && (!d.productId || !d.sourceId || !(Number(d.unitPrice) > 0))) {
      throw httpError('وجهة التاجر تتطلب الصنف والمصنع والسعر (لكل وحدة الوجهة)', 422, 'TRADER_DESTINATION_NEEDS_PRICE');
    }

    const res = await client.query(`
      INSERT INTO delivery_destinations
        (fax_id, destination_type, trader_id, warehouse_id,
         quantity, unit, label, governorate, area, address_text,
         contact_phone, contact_name, sort_order, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *
    `, [
      faxId, d.destinationType,
      traderInfo?.id || null,
      warehouseInfo?.id || null,
      d.quantity, d.unit || 'bag',
      d.label || traderInfo?.full_name || warehouseInfo?.name_ar || null,
      d.governorate || traderInfo?.governorate || warehouseInfo?.governorate || null,
      d.area || traderInfo?.area || warehouseInfo?.area || null,
      d.addressText || traderInfo?.default_address || warehouseInfo?.address_text || null,
      d.contactPhone || traderInfo?.phone || warehouseInfo?.contact_phone || null,
      d.contactName || traderInfo?.full_name || warehouseInfo?.manager_name || null,
      i, userId,
    ]);
    const row = res.rows[0];
    if (d.destinationType === 'trader' && traderInfo) {
      const fax = await client.query(`SELECT fax_number FROM loading_faxes WHERE id = $1`, [faxId]);
      const order = await createAutoOrderForDestination(client, {
        customerId: traderInfo.id,
        productId: d.productId,
        sourceId: d.sourceId,
        quantity: d.quantity,
        unit: d.unit || 'bag',
        unitPrice: d.unitPrice,
        faxNumber: fax.rows[0] && fax.rows[0].fax_number,
        userId,
      });
      await client.query(`UPDATE delivery_destinations SET fulfills_order_id = $1 WHERE id = $2`, [order.id, row.id]);
      row.fulfills_order_id = order.id;
    }
    inserted.push(row);
  }
  return inserted;
};

// ═══════════════ Patch 2.3b: الوجهات + سعر النقل في معاملة واحدة ═══════════════
const EDITABLE_STATUSES = ['REQUESTED', 'APPROVED', 'ISSUED', 'USED', 'READY_FOR_TRANSIT'];
const BAGS_PER_TON = 20; // الكيس = 50 كغ

const httpError = (message, status = 400, code = null) => {
  const e = new Error(message);
  e.status = status;
  if (code) e.code = code;
  return e;
};

// الكمية بالأكياس × 100 (عدد صحيح) — لا أخطاء عائمة
const bagsH = (qty, unit) => toMinor(qty) * (unit === 'ton' ? BAGS_PER_TON : 1);

// "صنعاء → ذمار" — يتجاهل الفارغ ويدمج التكرار المتتالي
const deriveRoute = (rows) => {
  const parts = [];
  for (const r of rows) {
    const g = String(r.governorate || '').trim();
    if (g && parts[parts.length - 1] !== g) parts.push(g);
  }
  return parts.join(' → ');
};

const replaceDestinationsAndTransport = async (faxId, data, userId) => {
  // require متأخر لتفادي أي دورة استيراد مع fax.service
  const { applyTransportAndRoute } = require('./fax.service');
  const hasPrice = data.transportRate !== undefined && data.transportRate !== null;

  const client = await pool.connect();
  let result;
  let push = null;
  try {
    await client.query('BEGIN');

    // 1) قفل الفاكس + بيانات السائق (LEFT JOIN: فاكسات ما قبل التحميل قد لا تحمل سائقًا)
    const f = await client.query(
      `SELECT f.*, d.driver_type, d.full_name AS driver_name,
              COALESCE(d.phone, u.phone) AS driver_phone
       FROM loading_faxes f
       LEFT JOIN drivers d ON d.id = f.driver_id
       LEFT JOIN users u ON u.id = d.user_id
       WHERE f.id = $1
       FOR UPDATE OF f`,
      [faxId]
    );
    if (!f.rows.length) throw httpError('الفاكس غير موجود', 404);
    const fax = f.rows[0];

    // 2) قواعد الحالة
    if (['DELIVERED', 'CANCELLED'].includes(fax.status)) {
      throw httpError('لا يمكن تعديل وجهات فاكس مُسلَّم أو ملغى', 400, 'FAX_CLOSED');
    }
    if (!EDITABLE_STATUSES.includes(fax.status)) {
      throw httpError(`لا يمكن تعديل الوجهات في الحالة ${fax.status}`, 400, 'INVALID_STATUS');
    }
    if (hasPrice) {
      if (fax.status === 'READY_FOR_TRANSIT') {
        throw httpError('تم تحديد خط السير وأجرة النقل لهذا الفاكس مسبقًا', 400, 'ALREADY_ROUTED');
      }
      if (fax.status !== 'USED') {
        throw httpError('سعر النقل يُحدَّد بعد التحميل فقط', 400, 'TRANSPORT_NOT_ALLOWED_YET');
      }
      if (fax.transport_rate !== null && fax.transport_rate !== undefined) {
        throw httpError('تم تحديد خط السير وأجرة النقل لهذا الفاكس مسبقًا', 400, 'ALREADY_ROUTED');
      }
      if (!fax.driver_id) throw httpError('لا يوجد سائق مرتبط بالفاكس', 400, 'NO_DRIVER');
    }

    // 3) الكميات: (وجهات باقية لا يستبدلها replaceDestinations + الجديدة) ≤ سعة الفاكس
    const capacity = [fax.loaded_quantity, fax.approved_quantity, fax.requested_quantity]
      .find((v) => v !== null && v !== undefined);
    const capH = toMinor(capacity ?? 0);
    const kept = await client.query(
      `SELECT quantity, unit FROM delivery_destinations
       WHERE fax_id = $1 AND status <> 'CANCELLED'
         AND NOT (status = 'PENDING' AND fulfills_order_id IS NULL)`,
      [faxId]
    );
    const keptH = kept.rows.reduce((s, r) => s + bagsH(r.quantity, r.unit), 0);
    const newH = data.destinations.reduce((s, d) => s + bagsH(d.quantity, d.unit), 0);
    if (keptH + newH > capH) {
      throw httpError(
        `مجموع كميات الوجهات (${(keptH + newH) / 100} كيس) يتجاوز كمية الفاكس (${capH / 100} كيس)`,
        400, 'QUANTITY_EXCEEDS_LOADED'
      );
    }

    // 4) متحمّل الأجرة (قبل أي كتابة)
    let payer = 'institution';
    let payerTraderId = null;
    if (hasPrice) {
      payer = data.transportPayer || 'institution';
      if (payer === 'trader') {
        payerTraderId = data.transportPayerTraderId || null;
        if (!payerTraderId) {
          const ids = [...new Set(
            data.destinations.filter((d) => d.destinationType === 'trader' && d.traderId).map((d) => d.traderId)
          )];
          if (ids.length === 1) payerTraderId = ids[0];
          else {
            throw httpError(
              ids.length === 0
                ? 'لا توجد وجهة تاجر — حدّد transportPayerTraderId'
                : 'عدة تجار في الوجهات — حدّد transportPayerTraderId',
              400, 'TRANSPORT_PAYER_TRADER_REQUIRED'
            );
          }
        }
      }
    }

    // 5) استبدال الوجهات (الدالة الحالية كما هي)
    await replaceDestinations(client, faxId, data.destinations, userId);
    const all = (await client.query(
      `SELECT * FROM delivery_destinations
       WHERE fax_id = $1 AND status <> 'CANCELLED'
       ORDER BY sort_order, created_at`,
      [faxId]
    )).rows;

    // 6) المحافظة/المنطقة من أول وجهة — إن لم تحمل محافظة تبقى القيمة القديمة
    const first = all[0];
    const hasGov = !!(first && first.governorate);
    const newGov = hasGov ? first.governorate : fax.delivery_governorate;
    const newArea = hasGov ? (first.area || null) : fax.delivery_area;

    if (hasPrice) {
      const route = data.route || deriveRoute(all);
      if (!route) {
        throw httpError('تعذّر اشتقاق خط السير (لا محافظات في الوجهات) — أرسل route', 400, 'ROUTE_REQUIRED');
      }
      const applied = await applyTransportAndRoute(client, fax, {
        route,
        rate: data.transportRate,
        unit: data.transportRateUnit || 'bag',
        baseOn: data.transportBaseOn,
        transportPayer: payer,
        transportPayerTraderId: payerTraderId,
        transportPayerNote: data.transportPayerNote,
        deliveryGovernorate: newGov,
        deliveryArea: newArea,
        deliveryAddress: fax.delivery_address, // لا نمسح العنوان الحالي
      }, userId, { deferPush: true });
      push = applied._push || null;
      result = {
        transport_total: applied.transport_total,
        base_quantity: applied.base_quantity,
        new_status: applied.new_status,
        route: applied.route,
        warnings: [],
      };
    } else {
      if (hasGov) {
        await client.query(
          `UPDATE loading_faxes SET delivery_governorate = $2, delivery_area = $3, updated_at = NOW() WHERE id = $1`,
          [faxId, newGov, newArea]
        );
      }
      result = {
        transport_total: fax.transport_total !== null && fax.transport_total !== undefined ? Number(fax.transport_total) : null,
        base_quantity: null,
        new_status: fax.status,
        route: fax.route || null,
        warnings: fax.status === 'USED' ? ['TRANSPORT_NOT_SET'] : [],
      };
    }

    await client.query('COMMIT');
    result = { destinations: all, ...result };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* تجاهل */ }
    throw err;
  } finally {
    client.release();
  }

  // 10) Push بعد COMMIT فقط — فشله لا يؤثر على الحفظ
  if (push) {
    Promise.resolve()
      .then(() => sendPushNotification(...push))
      .catch((e) => console.error('FCM error:', e.message));
  }
  return result;
};

const deliverDestination = async (destinationId, userId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const d = await client.query(`
      SELECT d.*, f.fax_number, f.driver_id, f.order_id AS fax_order_id, f.factory_id,
             f.status AS fax_status, f.is_managed_by_institution AS fax_is_managed
      FROM delivery_destinations d
      JOIN loading_faxes f ON f.id = d.fax_id
      WHERE d.id = $1
      FOR UPDATE OF d, f
    `, [destinationId]);

    if (!d.rows.length) { const e = new Error('الوجهة غير موجودة'); e.status = 404; throw e; }
    const dest = d.rows[0];

    // الصلاحية أولًا (لا نكشف حالة فاكس غير المالك)، ثم حالة الوجهة، ثم بوابة حالة الفاكس.
    // القفل FOR UPDATE OF d, f أعلاه: يمنع التسليم المزدوج للوجهة، ويُسلسل تسليم وجهتين
    // لنفس الفاكس حتى يرى العدّ الأخير (PENDING) النتيجة الصحيحة.
    const drv = await client.query(`SELECT id FROM drivers WHERE user_id = $1`, [userId]);
    if (!drv.rows.length || drv.rows[0].id !== dest.driver_id) {
      const e = new Error('غير مصرح'); e.status = 403; throw e;
    }
    if (dest.status === 'DELIVERED') throw httpError('تم التسليم مسبقًا', 400, 'DESTINATION_ALREADY_DELIVERED');
    if (dest.status === 'CANCELLED') throw httpError('الوجهة ملغاة', 400, 'DESTINATION_CANCELLED');
    if (dest.status !== 'PENDING') throw httpError(`حالة الوجهة لا تسمح بالتسليم: ${dest.status}`, 400, 'INVALID_DESTINATION_STATUS');
    assertFaxDeliverable({ status: dest.fax_status, is_managed_by_institution: dest.fax_is_managed });

    let createdOrder = null;

    // وجهة مرتبطة بطلب موجود ومدفوع: لا ننشئ طلبًا جديدًا (منع ازدواج الفوترة)
    if (dest.fulfills_order_id) {
      await client.query(`UPDATE orders SET status = 'DELIVERED', updated_at = NOW()
                          WHERE id = $1 AND status IN ('PREPARING','LOADED','IN_TRANSIT','PAYMENT_APPROVED')`, [dest.fulfills_order_id]);
      await client.query(`INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, reason)
                          VALUES ($1, NULL, 'DELIVERED', $2, $3)`,
        [dest.fulfills_order_id, userId, `تسليم الوجهة من فاكس ${dest.fax_number || ''}`]);
      // وجهة تاجر بطلب تلقائي: يُرحَّل بيعها إلى حساب التاجر (مرة واحدة)
      const ord = await client.query(
        `SELECT id, customer_id, subtotal, currency, auto_for_destination FROM orders WHERE id = $1`,
        [dest.fulfills_order_id]
      );
      if (ord.rows[0] && ord.rows[0].auto_for_destination) {
        await postDestinationSale(client, ord.rows[0], dest, userId);
      }
    } else if (dest.destination_type === 'trader' && dest.trader_id) {
      const orderNumber = await generateOrderNumber(client);

      const orderRes = await client.query(`
        INSERT INTO orders
          (order_number, customer_id, status, source, delivery_type,
           factory_id, created_by, notes, payment_terms,
           source_fax_id, source_destination_id)
        VALUES ($1,$2,'PENDING_PRICING','ONLINE','alghouli_delivery',
                $3,$4,$5,'on_account',$6,$7)
        RETURNING id, order_number
      `, [orderNumber, dest.trader_id, dest.factory_id, userId,
          `تسليم فاكس ${dest.fax_number || ''} — ${dest.quantity} كيس`,
          dest.fax_id, dest.id]);
      createdOrder = orderRes.rows[0];

      await client.query(`
        INSERT INTO order_items
          (order_id, source_id, packaging_type, quantity, unit, unit_price, discount, line_total)
        VALUES ($1, $2, 'bagged', $3, $4, NULL, 0, NULL)
      `, [createdOrder.id, dest.factory_id, dest.quantity, dest.unit || 'bag']);

      await client.query(`
        INSERT INTO order_status_history
          (order_id, from_status, to_status, changed_by, reason)
        VALUES ($1, NULL, 'PENDING_PRICING', $2, $3)
      `, [createdOrder.id, userId,
          `تسليم من فاكس ${dest.fax_number || ''} — ${dest.quantity}`]);

      const traderUser = await client.query(`SELECT user_id FROM customers WHERE id = $1`, [dest.trader_id]);
      if (traderUser.rows.length) {
        await client.query(`
          INSERT INTO notifications
            (user_id, title_ar, body_ar, type, reference_type, reference_id)
          VALUES ($1, $2, $3, 'ORDER_CREATED', 'orders', $4)
        `, [traderUser.rows[0].user_id,
            'شحنة جديدة بانتظار التسعير',
            `تم تسليم ${dest.quantity} ${dest.unit === 'ton' ? 'طن' : 'كيس'} أسمنت لحسابك — طلب رقم ${createdOrder.order_number}`,
            createdOrder.id]);
      }
    }

    if (dest.destination_type === 'warehouse' && dest.warehouse_id) {
      await client.query(`
        INSERT INTO institution_warehouse_ledger
          (warehouse_id, source_id, quantity, unit, direction,
           reference_type, reference_id, description, created_by)
        VALUES ($1, $2, $3, $4, 'in', 'delivery_destination', $5, $6, $7)
      `, [dest.warehouse_id, dest.factory_id, dest.quantity, dest.unit || 'bag',
          dest.id, `استلام من فاكس ${dest.fax_number || ''}`, userId]);
    }

    await client.query(`
      UPDATE delivery_destinations
      SET status = 'DELIVERED', delivered_at = NOW(), delivered_by = $1,
          order_id = $2, updated_at = NOW()
      WHERE id = $3
    `, [userId, createdOrder?.id || null, destinationId]);

    const remaining = await client.query(`
      SELECT COUNT(*)::int AS count FROM delivery_destinations
      WHERE fax_id = $1 AND status = 'PENDING'
    `, [dest.fax_id]);

    if (remaining.rows[0].count === 0) {
      await client.query(`
        UPDATE loading_faxes SET status = 'DELIVERED', updated_at = NOW()
        WHERE id = $1
      `, [dest.fax_id]);
    }

    await client.query('COMMIT');
    return {
      ok: true,
      destination_id: destinationId,
      order_created: !!createdOrder,
      order_number: createdOrder?.order_number || null,
      all_delivered: remaining.rows[0].count === 0,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const listWarehouses = async () => {
  const r = await query(`
    SELECT id, code, name_ar, governorate, area, address_text,
           contact_phone, manager_name, status
    FROM institution_warehouses WHERE status = 'active' ORDER BY name_ar
  `);
  return r.rows;
};

const listTraders = async () => {
  const r = await query(`
    SELECT c.id, u.full_name, u.phone, c.governorate, c.area, c.default_address
    FROM customers c
    JOIN users u ON u.id = c.user_id
    WHERE u.status = 'active' AND c.customer_type IN ('trader', 'contractor')
    ORDER BY u.full_name
  `);
  return r.rows;
};

module.exports = { listDestinations, replaceDestinations, replaceDestinationsAndTransport, deliverDestination, listWarehouses, listTraders, suggestDestinationPrice };
