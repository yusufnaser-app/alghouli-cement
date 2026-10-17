'use strict';
/**
 * إشعارات الأحداث بالأسماء والأنواع: الإدارة تعرف الطرف والصنف والكمية، والتاجر يعرف شحنته.
 * الدوال النصية (build*) خالصة وتُختبر بلا قاعدة بيانات. دوال notify* تقرأ الأسماء وتكتب الإشعارات
 * داخل المعاملة نفسها (لا Push قبل COMMIT لأن المشغّل في القاعدة يرسل بعده).
 */

const fmtQty = (qty, unit) => `${Number(qty)} ${unit === 'ton' ? 'طن' : 'كيس'}`;
const fmtMoney = (v) => (v === null || v === undefined || v === '' ? '—' : `${Number(v).toLocaleString('en-US')} ر.ي`);

/** نص إشعار الإدارة عند إنشاء طلب شراء جديد. */
const buildOrderCreatedAdmin = ({ orderNumber, customerName, customerType, items }) => {
  const typeAr = { trader: 'تاجر', distributor: 'موزع', contractor: 'مقاول', individual: 'فرد' }[customerType] || 'عميل';
  const lines = items.map((i) => `${i.product || 'صنف'} ${fmtQty(i.quantity, i.unit)}`).join('، ');
  return {
    title: 'طلب شراء جديد',
    body: `طلب شراء رقم ${orderNumber} من ${typeAr} ${customerName || ''}: ${lines || '—'} — بانتظار التسعير`,
  };
};

/** نص إشعار التاجر عند تسليم وجهته: الكمية والصنف والسائق والمبلغ. */
const buildDestinationDeliveredTrader = ({ qty, unit, product, driverName, factory, amount, faxNumber }) => ({
  title: 'تم تسليم شحنتك',
  body: `تم تسليم ${fmtQty(qty, unit)} من ${product || 'الأسمنت'}${factory ? ` (${factory})` : ''} بواسطة السائق ${driverName || '—'}، بموجب الفاكس ${faxNumber || '—'}${amount !== undefined ? `، المبلغ المستحق ${fmtMoney(amount)}` : ''}`,
});

/** نص إشعار الإدارة عند تسليم وجهة: من استلم، ما الصنف، بأي سائق، لأي تاجر. */
const buildDestinationDeliveredAdmin = ({ qty, unit, product, traderName, driverName, factory, faxNumber, place }) => ({
  title: 'تم تسليم وجهة',
  body: `تم تسليم ${fmtQty(qty, unit)} من ${product || 'الأسمنت'}${factory ? ` (${factory})` : ''} إلى التاجر ${traderName || '—'}${place ? ` في ${place}` : ''} بواسطة السائق ${driverName || '—'}، فاكس ${faxNumber || '—'}`,
});

/** المستخدمون الذين لهم دور الإدارة وحساباتهم فعّالة. */
const adminUserIds = async (client) => {
  const r = await client.query(
    `SELECT DISTINCT u.id FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id
     WHERE r.name = 'admin' AND u.status = 'active'`
  );
  return r.rows.map((x) => x.id);
};

const insertNotifications = async (client, userIds, n, refType, refId) => {
  const ids = [...new Set(userIds.filter(Boolean))];
  for (const uid of ids) {
    await client.query(
      `INSERT INTO notifications (user_id, title_ar, body_ar, type, reference_type, reference_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [uid, n.title, n.body, n.type || 'INFO', refType, refId]
    );
  }
  return ids.length;
};

/** إشعار الإدارة عند إنشاء طلب شراء (بالاسم والصنف والكمية). */
const notifyOrderCreated = async (client, orderId) => {
  const o = await client.query(
    `SELECT o.order_number, u.full_name, c.customer_type
     FROM orders o JOIN customers c ON c.id = o.customer_id JOIN users u ON u.id = c.user_id
     WHERE o.id = $1`, [orderId]);
  if (!o.rows.length) return 0;
  const items = await client.query(
    `SELECT p.name_ar AS product, oi.quantity, oi.unit FROM order_items oi
     LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = $1 ORDER BY oi.id`, [orderId]);
  const n = buildOrderCreatedAdmin({
    orderNumber: o.rows[0].order_number, customerName: o.rows[0].full_name,
    customerType: o.rows[0].customer_type, items: items.rows,
  });
  return insertNotifications(client, await adminUserIds(client), { ...n, type: 'ORDER_CREATED' }, 'orders', orderId);
};

/** إشعارات تسليم وجهة: للتاجر وللإدارة، بالأسماء. */
const notifyDestinationDelivered = async (client, destId, driverUserId) => {
  const d = await client.query(
    `SELECT x.id, x.quantity, x.unit, x.trader_id, x.governorate, x.fulfills_order_id,
            f.fax_number, f.product_id, ps.name_ar AS factory, p.name_ar AS product,
            cu.user_id AS trader_user_id, tu.full_name AS trader_name,
            (SELECT dr.full_name FROM drivers dr WHERE dr.user_id = $2 LIMIT 1) AS driver_name
     FROM delivery_destinations x
     JOIN loading_faxes f ON f.id = x.fax_id
     LEFT JOIN product_sources ps ON ps.id = f.factory_id
     LEFT JOIN products p ON p.id = f.product_id
     LEFT JOIN customers cu ON cu.id = x.trader_id
     LEFT JOIN users tu ON tu.id = cu.user_id
     WHERE x.id = $1`, [destId, driverUserId]);
  if (!d.rows.length) return 0;
  const r = d.rows[0];
  const common = { qty: r.quantity, unit: r.unit, product: r.product, factory: r.factory,
    driverName: r.driver_name, faxNumber: r.fax_number };
  let sent = 0;
  if (r.trader_user_id) {
    sent += await insertNotifications(client, [r.trader_user_id],
      { ...buildDestinationDeliveredTrader(common), type: 'DESTINATION_DELIVERED' }, 'delivery_destinations', destId);
  }
  sent += await insertNotifications(client, await adminUserIds(client),
    { ...buildDestinationDeliveredAdmin({ ...common, traderName: r.trader_name, place: r.governorate }),
      type: 'DESTINATION_DELIVERED' }, 'delivery_destinations', destId);
  return sent;
};


const PAYMENT_LABEL = { on_account: 'آجل', network_transfer: 'تحويل شبكة', partial: 'دفع جزئي', e_wallet: 'محفظة إلكترونية', bank_transfer: 'تحويل شبكة', cash: 'نقدًا', credit: 'آجل' };

/** نص إشعار التاجر بتسعير طلبه: كل صنف بكميته وسعره، ثم الإجمالي. */
const buildOrderPricedTrader = ({ orderNumber, lines, total, currency }) => {
  const detail = lines.map((l) => `${l.product || 'صنف'} ${fmtQty(l.quantity, l.unit)} × ${fmtMoney(l.unitPrice)}`).join('، ');
  return {
    title: 'تم تسعير طلبك',
    body: `طلبك رقم ${orderNumber}: ${detail}. الإجمالي ${Number(total).toLocaleString('en-US')} ${currency || 'ر.ي'} — اختر طريقة الدفع`,
  };
};

/** نص إشعار الإدارة عند اختيار التاجر طريقة الدفع. */
const buildPaymentChosenAdmin = ({ orderNumber, customerName, paymentTerms, total }) => ({
  title: 'اختيار طريقة الدفع',
  body: `${customerName || 'التاجر'} اختار ${PAYMENT_LABEL[paymentTerms] || paymentTerms || 'طريقة دفع'} للطلب ${orderNumber}، الإجمالي ${fmtMoney(total)}`,
});

/** إشعار التاجر بتسعير طلبه (بالأسماء والأسعار). */
const notifyOrderPriced = async (client, orderId) => {
  const o = await client.query(
    `SELECT o.order_number, o.total_amount, o.currency, cu.user_id
     FROM orders o JOIN customers cu ON cu.id = o.customer_id WHERE o.id = $1`, [orderId]);
  if (!o.rows.length || !o.rows[0].user_id) return 0;
  const items = await client.query(
    `SELECT p.name_ar AS product, oi.quantity, oi.unit, oi.unit_price FROM order_items oi
     LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = $1 ORDER BY oi.id`, [orderId]);
  const n = buildOrderPricedTrader({ orderNumber: o.rows[0].order_number, lines: items.rows,
    total: o.rows[0].total_amount, currency: o.rows[0].currency });
  return insertNotifications(client, [o.rows[0].user_id], { ...n, type: 'ORDER_PRICED' }, 'orders', orderId);
};

/** إشعار الإدارة عند اختيار طريقة الدفع. */
const notifyPaymentChosen = async (client, orderId, paymentTerms) => {
  const o = await client.query(
    `SELECT o.order_number, o.total_amount, u.full_name FROM orders o
     JOIN customers cu ON cu.id = o.customer_id JOIN users u ON u.id = cu.user_id WHERE o.id = $1`, [orderId]);
  if (!o.rows.length) return 0;
  const n = buildPaymentChosenAdmin({ orderNumber: o.rows[0].order_number, customerName: o.rows[0].full_name,
    paymentTerms, total: o.rows[0].total_amount });
  return insertNotifications(client, await adminUserIds(client), { ...n, type: 'PAYMENT_CHOSEN' }, 'orders', orderId);
};

module.exports = {
  buildOrderPricedTrader, buildPaymentChosenAdmin, notifyOrderPriced, notifyPaymentChosen,
  buildOrderCreatedAdmin, buildDestinationDeliveredTrader, buildDestinationDeliveredAdmin,
  adminUserIds, notifyOrderCreated, notifyDestinationDelivered,
};
