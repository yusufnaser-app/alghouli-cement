'use strict';
const { pool, query } = require('../../config/db');
const { toMinor } = require('../accounting/accounting.engine');
const { sendPushNotification } = require('../../services/fcm.service');
const { generateOrderNumber } = require('../../utils/number-generator');

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

const replaceDestinations = async (client, faxId, destinations, userId) => {
  await client.query(
    `DELETE FROM delivery_destinations WHERE fax_id = $1 AND status = 'PENDING' AND fulfills_order_id IS NULL`,
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
    inserted.push(res.rows[0]);
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
      SELECT d.*, f.fax_number, f.driver_id, f.order_id AS fax_order_id, f.factory_id
      FROM delivery_destinations d
      JOIN loading_faxes f ON f.id = d.fax_id
      WHERE d.id = $1
    `, [destinationId]);

    if (!d.rows.length) { const e = new Error('الوجهة غير موجودة'); e.status = 404; throw e; }
    const dest = d.rows[0];

    if (dest.status === 'DELIVERED') { const e = new Error('تم التسليم مسبقًا'); e.status = 400; throw e; }

    const drv = await client.query(`SELECT id FROM drivers WHERE user_id = $1`, [userId]);
    if (!drv.rows.length || drv.rows[0].id !== dest.driver_id) {
      const e = new Error('غير مصرح'); e.status = 403; throw e;
    }

    let createdOrder = null;

    // وجهة مرتبطة بطلب موجود ومدفوع: لا ننشئ طلبًا جديدًا (منع ازدواج الفوترة)
    if (dest.fulfills_order_id) {
      await client.query(`UPDATE orders SET status = 'DELIVERED', updated_at = NOW()
                          WHERE id = $1 AND status IN ('PREPARING','IN_TRANSIT','PAYMENT_APPROVED')`, [dest.fulfills_order_id]);
      await client.query(`INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, reason)
                          VALUES ($1, NULL, 'DELIVERED', $2, $3)`,
        [dest.fulfills_order_id, userId, `تسليم الوجهة من فاكس ${dest.fax_number || ''}`]);
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

module.exports = { listDestinations, replaceDestinations, replaceDestinationsAndTransport, deliverDestination, listWarehouses, listTraders };
