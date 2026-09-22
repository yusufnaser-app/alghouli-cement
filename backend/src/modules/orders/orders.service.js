const { pool, query } = require('../../config/db');
const transportService = require('./transport.service');
const ledgerService = require('../customers/ledger.service');

const generateOrderNumber = async () => {
  const year = new Date().getFullYear();
  const result = await query(
    `SELECT COUNT(*) FROM orders WHERE order_number LIKE $1`,
    [`GHO-${year}-%`]
  );
  const count = parseInt(result.rows[0].count, 10) + 1;
  return `GHO-${year}-${String(count).padStart(6, '0')}`;
};

/**
 * التحقق من إمكانية الطلب الآجل
 * يُحسب: الرصيد الحالي + الطلبات المعلقة + قيمة الطلب الجديد
 */
const checkCreditAvailability = async (client, customerId, newOrderAmount) => {
  const cust = await client.query(
    `SELECT current_balance, credit_limit, customer_type
     FROM customers WHERE id = $1`,
    [customerId]
  );
  if (cust.rows.length === 0) {
    const err = new Error('العميل غير موجود');
    err.status = 404;
    throw err;
  }

  const customer = cust.rows[0];
  const currentBalance = parseFloat(customer.current_balance || 0);
  const creditLimit = parseFloat(customer.credit_limit || 0);

  // احسب الطلبات الآجلة المعلقة (بانتظار موافقة المدير)
  const pendingResult = await client.query(
    `SELECT COALESCE(SUM(total_amount), 0) AS pending
     FROM orders
     WHERE customer_id = $1
       AND payment_terms = 'credit'
       AND status = 'PENDING_ADMIN_APPROVAL'`,
    [customerId]
  );
  const pendingBalance = parseFloat(pendingResult.rows[0].pending || 0);

  const totalCommitted = currentBalance + pendingBalance + newOrderAmount;

  return {
    current_balance: currentBalance,
    pending_balance: pendingBalance,
    new_order_amount: newOrderAmount,
    total_after: totalCommitted,
    credit_limit: creditLimit,
    can_approve: creditLimit === 0 || totalCommitted <= creditLimit,
    available_credit: creditLimit > 0
      ? Math.max(0, creditLimit - currentBalance - pendingBalance)
      : Infinity,
  };
};

const createOrder = async (userId, data) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const cust = await client.query(
      `SELECT id, customer_type, current_balance, credit_limit, governorate, area
       FROM customers WHERE user_id = $1`,
      [userId]
    );
    if (cust.rows.length === 0) {
      const err = new Error('العميل غير موجود');
      err.status = 404;
      throw err;
    }
    const customerId = cust.rows[0].id;
    const customer = cust.rows[0];

    // تحديد العنوان
    let addressId = data.addressId;
    let governorate = customer.governorate;
    let area = customer.area;

    if (data.deliveryType === 'alghouli_delivery') {
      if (!addressId) {
        const err = new Error('عنوان التسليم مطلوب');
        err.status = 400;
        throw err;
      }
      const addr = await client.query(
        `SELECT id, governorate, area FROM customer_addresses
         WHERE id = $1 AND customer_id = $2`,
        [addressId, customerId]
      );
      if (addr.rows.length === 0) {
        const err = new Error('العنوان غير موجود');
        err.status = 404;
        throw err;
      }
      governorate = addr.rows[0].governorate;
      area = addr.rows[0].area;
    } else if (data.deliveryType === 'trader_pickup') {
      // استلام ذاتي — بيانات السائق مطلوبة
      if (!data.traderTruckPlate || !data.traderDriverName) {
        const err = new Error('رقم الشاحنة واسم السائق مطلوبان');
        err.status = 400;
        throw err;
      }
      const existingAddr = await client.query(
        `SELECT id FROM customer_addresses WHERE customer_id = $1 AND is_default = true LIMIT 1`,
        [customerId]
      );
      if (existingAddr.rows.length > 0) {
        addressId = existingAddr.rows[0].id;
      } else {
        const newAddr = await client.query(
          `INSERT INTO customer_addresses
           (customer_id, label, governorate, area, address_text, is_default)
           VALUES ($1, 'افتراضي', $2, $3, 'يُحدد', true)
           RETURNING id`,
          [customerId, customer.governorate || 'صنعاء', customer.area || '']
        );
        addressId = newAddr.rows[0].id;
      }
    }

    // احسب الأسعار
    let subtotal = 0;
    let transportTotal = 0;
    const itemsWithPrice = [];

    for (const item of data.items) {
      const prod = await client.query(
        `SELECT p.id, p.source_id, p.packaging_type, p.name_ar,
                COALESCE(i.unit, CASE WHEN p.packaging_type = 'bagged' THEN 'bag' ELSE 'ton' END) AS unit,
                COALESCE(i.available_qty, 0) AS available_qty
         FROM products p
         LEFT JOIN inventory i ON i.product_id = p.id
         WHERE p.id = $1`,
        [item.productId]
      );
      if (prod.rows.length === 0) {
        const err = new Error(`المنتج غير موجود`);
        err.status = 404;
        throw err;
      }
      const product = prod.rows[0];

      if (parseFloat(product.available_qty) < item.quantity) {
        const err = new Error(`الكمية غير كافية من: ${product.name_ar}`);
        err.status = 400;
        err.code = 'INSUFFICIENT_STOCK';
        throw err;
      }

      const price = await client.query(
        `SELECT pp.price
         FROM product_prices pp
         JOIN price_lists pl ON pl.id = pp.price_list_id
         WHERE pp.product_id = $1 AND pl.customer_type = $2
           AND $3 >= pp.min_qty
           AND ($3 <= pp.max_qty OR pp.max_qty IS NULL)
         ORDER BY pp.min_qty DESC LIMIT 1`,
        [product.id, customer.customer_type, item.quantity]
      );

      if (price.rows.length === 0) {
        const err = new Error(`لا يوجد سعر متاح للمنتج`);
        err.status = 400;
        throw err;
      }

      const unitPrice = parseFloat(price.rows[0].price);
      const lineTotal = unitPrice * item.quantity;
      subtotal += lineTotal;

      let lineTransport = 0;
      if (data.deliveryType === 'alghouli_delivery') {
        const transport = await transportService.calculateTransport({
          sourceId: product.source_id,
          governorate,
          area,
          packagingType: product.packaging_type,
          quantity: item.quantity,
          unit: product.unit,
        });
        lineTransport = transport.amount;
      }
      transportTotal += lineTransport;

      itemsWithPrice.push({
        productId: product.id,
        sourceId: product.source_id,
        packagingType: product.packaging_type,
        quantity: item.quantity,
        unit: product.unit,
        unitPrice,
        lineTotal,
        transportAmount: lineTransport,
      });
    }

    const totalAmount = subtotal + transportTotal;
    const paymentTerms = data.paymentTerms || 'cash';

    // التحقق من الحد الائتماني إذا كان الطلب آجلًا
    let creditCheck = null;
    if (paymentTerms === 'credit') {
      creditCheck = await checkCreditAvailability(client, customerId, totalAmount);
      if (!creditCheck.can_approve) {
        const err = new Error(
          `الطلب يتجاوز الحد الائتماني. ` +
          `الرصيد الحالي: ${creditCheck.current_balance.toLocaleString()}، ` +
          `المعلق: ${creditCheck.pending_balance.toLocaleString()}، ` +
          `الحد: ${creditCheck.credit_limit.toLocaleString()}`
        );
        err.status = 400;
        err.code = 'CREDIT_LIMIT_EXCEEDED';
        err.data = creditCheck;
        throw err;
      }
    }

    // الحالة الأولية
    let initialStatus;
    if (paymentTerms === 'credit') {
      initialStatus = 'PENDING_ADMIN_APPROVAL';
    } else {
      initialStatus = 'PENDING_PAYMENT';
    }

    const orderNumber = await generateOrderNumber();

    const orderResult = await client.query(
      `INSERT INTO orders
       (order_number, customer_id, address_id, status, source,
        subtotal, discount_amount, shipping_amount, total_amount,
        paid_amount, remaining_amount, notes, created_by,
        delivery_type, trader_truck_plate, trader_driver_name, trader_driver_phone,
        transport_unit, payment_terms)
       VALUES ($1, $2, $3, $4, 'ONLINE',
               $5, 0, $6, $7, 0, $7, $8, $9,
               $10, $11, $12, $13, $14, $15)
       RETURNING id, order_number, status, subtotal, shipping_amount,
                 total_amount, created_at`,
      [
        orderNumber, customerId, addressId, initialStatus,
        subtotal, transportTotal, totalAmount, data.notes || null, userId,
        data.deliveryType, data.traderTruckPlate || null,
        data.traderDriverName || null, data.traderDriverPhone || null,
        itemsWithPrice[0]?.unit || 'bag',
        paymentTerms,
      ]
    );
    const order = orderResult.rows[0];

    // إضافة العناصر
    for (const item of itemsWithPrice) {
      await client.query(
        `INSERT INTO order_items
         (order_id, product_id, source_id, packaging_type, quantity, unit,
          unit_price, discount, line_total)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          order.id, item.productId, item.sourceId, item.packagingType,
          item.quantity, item.unit, item.unitPrice, 0, item.lineTotal,
        ]
      );

      await client.query(
        `UPDATE inventory SET reserved_qty = reserved_qty + $1, updated_at = NOW()
         WHERE product_id = $2`,
        [item.quantity, item.productId]
      );
    }

    // إذا كان دفعًا فوريًا: سجّل الدين
    // إذا كان آجلًا: لا تسجّل — في انتظار موافقة المدير
    if (paymentTerms === 'cash') {
      await ledgerService.addTransaction(client, {
        customerId,
        orderId: order.id,
        transactionType: 'purchase',
        debit: totalAmount,
        description: `طلب ${orderNumber} (دفع فوري)`,
        createdBy: userId,
      });
    }

    // سجّل الحالة
    await client.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, reason)
       VALUES ($1, NULL, $2, $3, $4)`,
      [order.id, initialStatus, userId,
       paymentTerms === 'credit' ? 'طلب آجل - بانتظار موافقة المدير' : 'طلب فوري']
    );

    await client.query('COMMIT');

    return {
      ...order,
      delivery_type: data.deliveryType,
      payment_terms: paymentTerms,
      credit_check: creditCheck,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * موافقة المدير على الطلب الآجل
 */
const approveCreditOrder = async (orderId, adminId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const orderResult = await client.query(
      `SELECT id, order_number, customer_id, status, total_amount, payment_terms
       FROM orders WHERE id = $1 FOR UPDATE`,
      [orderId]
    );
    if (orderResult.rows.length === 0) {
      const err = new Error('الطلب غير موجود');
      err.status = 404;
      throw err;
    }

    const order = orderResult.rows[0];

    if (order.status !== 'PENDING_ADMIN_APPROVAL') {
      const err = new Error('الطلب ليس بانتظار الموافقة');
      err.status = 400;
      throw err;
    }

    if (order.payment_terms !== 'credit') {
      const err = new Error('الطلب ليس آجلًا');
      err.status = 400;
      throw err;
    }

    // سجّل الدين
    await ledgerService.addTransaction(client, {
      customerId: order.customer_id,
      orderId: order.id,
      transactionType: 'purchase',
      debit: parseFloat(order.total_amount),
      description: `طلب آجل ${order.order_number} - موافقة المدير`,
      createdBy: adminId,
    });

    // حدّث الطلب
    await client.query(
      `UPDATE orders
       SET status = 'PREPARING',
           credit_approved_by = $1,
           credit_approved_at = NOW(),
           updated_at = NOW()
       WHERE id = $2`,
      [adminId, orderId]
    );

    // سجّل الحالة
    await client.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, reason)
       VALUES ($1, 'PENDING_ADMIN_APPROVAL', 'PREPARING', $2, 'موافقة المدير على الطلب الآجل')`,
      [orderId, adminId]
    );

    await client.query('COMMIT');
    return { id: orderId, status: 'PREPARING' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * رفض المدير للطلب الآجل
 */
const rejectCreditOrder = async (orderId, adminId, reason) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const orderResult = await client.query(
      `SELECT id, order_number, status, payment_terms FROM orders WHERE id = $1 FOR UPDATE`,
      [orderId]
    );
    if (orderResult.rows.length === 0) {
      const err = new Error('الطلب غير موجود');
      err.status = 404;
      throw err;
    }

    const order = orderResult.rows[0];
    if (order.status !== 'PENDING_ADMIN_APPROVAL') {
      const err = new Error('الطلب ليس بانتظار الموافقة');
      err.status = 400;
      throw err;
    }

    await client.query(
      `UPDATE orders
       SET status = 'CREDIT_REJECTED',
           credit_rejection_reason = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [reason, orderId]
    );

    // أعد الكميات
    const items = await client.query(
      `SELECT product_id, quantity FROM order_items WHERE order_id = $1`,
      [orderId]
    );
    for (const item of items.rows) {
      await client.query(
        `UPDATE inventory SET reserved_qty = GREATEST(0, reserved_qty - $1), updated_at = NOW()
         WHERE product_id = $2`,
        [item.quantity, item.product_id]
      );
    }

    await client.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, reason)
       VALUES ($1, 'PENDING_ADMIN_APPROVAL', 'CREDIT_REJECTED', $2, $3)`,
      [orderId, adminId, `رفض المدير: ${reason}`]
    );

    await client.query('COMMIT');
    return { id: orderId, status: 'CREDIT_REJECTED' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * الطلبات بانتظار موافقة المدير
 */
const listPendingCreditOrders = async () => {
  const r = await query(
    `SELECT o.id, o.order_number, o.status, o.total_amount, o.created_at,
            o.delivery_type, o.payment_terms, o.notes,
            c.id AS customer_id, c.customer_type, c.current_balance, c.credit_limit,
            u.full_name AS customer_name, u.phone AS customer_phone,
            (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS items_count
     FROM orders o
     JOIN customers c ON c.id = o.customer_id
     JOIN users u ON u.id = c.user_id
     WHERE o.status = 'PENDING_ADMIN_APPROVAL'
     ORDER BY o.created_at ASC`
  );
  return r.rows;
};

const getMyOrders = async (userId) => {
  const result = await query(
    `SELECT o.id, o.order_number, o.status, o.source,
            o.subtotal, o.discount_amount, o.shipping_amount,
            o.total_amount, o.paid_amount, o.remaining_amount,
            o.delivery_type, o.payment_terms, o.credit_rejection_reason,
            o.created_at,
            (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS items_count
     FROM orders o
     JOIN customers c ON c.id = o.customer_id
     WHERE c.user_id = $1
     ORDER BY o.created_at DESC`,
    [userId]
  );
  return result.rows;
};

const getOrderById = async (orderId, userId = null, isAdmin = false) => {
  let sql = `
    SELECT o.*,
           c.id AS customer_id, c.customer_type, c.current_balance, c.credit_limit,
           u.full_name AS customer_name, u.phone AS customer_phone,
           a.label AS address_label, a.governorate, a.area,
           a.address_text, a.alt_phone
    FROM orders o
    JOIN customers c ON c.id = o.customer_id
    JOIN users u ON u.id = c.user_id
    JOIN customer_addresses a ON a.id = o.address_id
    WHERE o.id = $1
  `;
  const params = [orderId];

  if (!isAdmin && userId) {
    sql += ` AND c.user_id = $2`;
    params.push(userId);
  }

  const orderResult = await query(sql, params);
  if (orderResult.rows.length === 0) return null;

  const order = orderResult.rows[0];

  const itemsResult = await query(
    `SELECT oi.*, p.name_ar AS product_name, p.grade,
            s.name_ar AS source_name, s.code AS source_code,
            cat.name_ar AS category_name, cat.color_code, cat.color_name_ar
     FROM order_items oi
     JOIN products p ON p.id = oi.product_id
     JOIN product_sources s ON s.id = oi.source_id
     JOIN product_categories cat ON cat.id = p.category_id
     WHERE oi.order_id = $1`,
    [orderId]
  );

  order.items = itemsResult.rows;
  return order;
};

const cancelOrder = async (orderId, userId, reason) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `SELECT o.id, o.status, o.customer_id, o.payment_terms, o.total_amount
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       WHERE o.id = $1 AND c.user_id = $2`,
      [orderId, userId]
    );
    if (result.rows.length === 0) {
      const err = new Error('الطلب غير موجود');
      err.status = 404;
      throw err;
    }

    const order = result.rows[0];
    const cancellable = ['PENDING_PAYMENT', 'RECEIPT_UPLOADED', 'CREATED', 'PENDING_ADMIN_APPROVAL'];
    if (!cancellable.includes(order.status)) {
      const err = new Error('لا يمكن إلغاء الطلب في حالته الحالية');
      err.status = 400;
      throw err;
    }

    // أعد الكميات
    const items = await client.query(
      `SELECT product_id, quantity FROM order_items WHERE order_id = $1`,
      [orderId]
    );
    for (const item of items.rows) {
      await client.query(
        `UPDATE inventory SET reserved_qty = GREATEST(0, reserved_qty - $1), updated_at = NOW()
         WHERE product_id = $2`,
        [item.quantity, item.product_id]
      );
    }

    await client.query(
      `UPDATE orders SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1`,
      [orderId]
    );

    // إذا كان الطلب دفعًا فوريًا، اعكس في ledger
    if (order.payment_terms === 'cash') {
      await client.query(
        `INSERT INTO customer_ledger
         (customer_id, order_id, transaction_type, debit, credit, balance_after,
          description, created_by)
         SELECT customer_id, id, 'cancellation', 0, total_amount,
                current_balance - total_amount, 'إلغاء طلب', $1
         FROM orders WHERE id = $2`,
        [userId, orderId]
      );
    }

    await client.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, reason)
       VALUES ($1, $2, 'CANCELLED', $3, $4)`,
      [orderId, order.status, userId, reason || 'إلغاء']
    );

    await client.query('COMMIT');
    return { id: orderId, status: 'CANCELLED' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

module.exports = {
  createOrder,
  approveCreditOrder,
  rejectCreditOrder,
  listPendingCreditOrders,
  checkCreditAvailability,
  getMyOrders,
  getOrderById,
  cancelOrder,
};
