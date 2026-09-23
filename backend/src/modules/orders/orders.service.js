const { pool, query } = require('../../config/db');
const transportService = require('./transport.service');
const ledgerService = require('../customers/ledger.service');

const generateOrderNumber = async () => {
  const year = new Date().getFullYear();
  const r = await query(
    `SELECT COUNT(*) FROM orders WHERE order_number LIKE $1`,
    [`GHO-${year}-%`]
  );
  return `GHO-${year}-${String(parseInt(r.rows[0].count, 10) + 1).padStart(6, '0')}`;
};

const checkCreditAvailability = async (client, customerId, additionalAmount) => {
  const cust = await client.query(
    `SELECT current_balance, credit_limit FROM customers WHERE id = $1`,
    [customerId]
  );
  if (cust.rows.length === 0) {
    const err = new Error('العميل غير موجود');
    err.status = 404;
    throw err;
  }
  const balance = parseFloat(cust.rows[0].current_balance || 0);
  const limit = parseFloat(cust.rows[0].credit_limit || 0);

  const pending = await client.query(
    `SELECT COALESCE(SUM(credit_amount), 0) AS total FROM orders
     WHERE customer_id = $1 AND status = 'PENDING_ADMIN_APPROVAL'`,
    [customerId]
  );
  const pendingBalance = parseFloat(pending.rows[0].total || 0);
  const total = balance + pendingBalance + additionalAmount;
  const unlimited = limit === 0;

  return {
    current_balance: balance,
    pending_balance: pendingBalance,
    additional_amount: additionalAmount,
    total_after: total,
    credit_limit: limit,
    has_limit: !unlimited,
    can_approve: unlimited || total <= limit,
    available_credit: unlimited ? null : Math.max(0, limit - balance - pendingBalance),
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

    let addressId = data.addressId;
    let gov = customer.governorate;
    let area = customer.area;

    if (data.deliveryType === 'alghouli_delivery') {
      if (!addressId) {
        const err = new Error('عنوان التسليم مطلوب');
        err.status = 400;
        throw err;
      }
      const a = await client.query(
        `SELECT id, governorate, area FROM customer_addresses
         WHERE id = $1 AND customer_id = $2`,
        [addressId, customerId]
      );
      if (a.rows.length === 0) {
        const err = new Error('العنوان غير موجود');
        err.status = 404;
        throw err;
      }
      gov = a.rows[0].governorate;
      area = a.rows[0].area;
    } else if (data.deliveryType === 'trader_pickup') {
      if (!data.traderTruckPlate || !data.traderDriverName) {
        const err = new Error('رقم الشاحنة واسم السائق مطلوبان');
        err.status = 400;
        throw err;
      }
      const ex = await client.query(
        `SELECT id FROM customer_addresses WHERE customer_id = $1 AND is_default = true LIMIT 1`,
        [customerId]
      );
      if (ex.rows.length > 0) {
        addressId = ex.rows[0].id;
      } else {
        const n = await client.query(
          `INSERT INTO customer_addresses
           (customer_id, label, governorate, area, address_text, is_default)
           VALUES ($1, 'افتراضي', $2, $3, 'يُحدد', true) RETURNING id`,
          [customerId, customer.governorate || 'صنعاء', customer.area || '']
        );
        addressId = n.rows[0].id;
      }
    }

    let subtotal = 0;
    let transportTotal = 0;
    const items = [];

    for (const item of data.items) {
      const p = await client.query(
        `SELECT p.id, p.source_id, p.packaging_type, p.name_ar,
                COALESCE(i.unit, CASE WHEN p.packaging_type = 'bagged' THEN 'bag' ELSE 'ton' END) AS unit,
                COALESCE(i.available_qty, 0) AS available_qty
         FROM products p
         LEFT JOIN inventory i ON i.product_id = p.id
         WHERE p.id = $1`,
        [item.productId]
      );
      if (p.rows.length === 0) {
        const err = new Error('المنتج غير موجود');
        err.status = 404;
        throw err;
      }
      const product = p.rows[0];

      if (parseFloat(product.available_qty) < item.quantity) {
        const err = new Error(`الكمية غير كافية من: ${product.name_ar}`);
        err.status = 400;
        err.code = 'INSUFFICIENT_STOCK';
        throw err;
      }

      // 1. سعر خاص للعميل
      let price = await transportService.getCustomerProductPrice(
        customerId, product.id, item.quantity
      );

      // 2. سعر عام حسب النوع
      if (price === null) {
        const pr = await client.query(
          `SELECT pp.price FROM product_prices pp
           JOIN price_lists pl ON pl.id = pp.price_list_id
           WHERE pp.product_id = $1 AND pl.customer_type = $2
             AND $3 >= pp.min_qty
             AND ($3 <= pp.max_qty OR pp.max_qty IS NULL)
           ORDER BY pp.min_qty DESC LIMIT 1`,
          [product.id, customer.customer_type, item.quantity]
        );
        if (pr.rows.length === 0) {
          const err = new Error('لا يوجد سعر متاح');
          err.status = 400;
          throw err;
        }
        price = parseFloat(pr.rows[0].price);
      }

      const lineTotal = price * item.quantity;
      subtotal += lineTotal;

      let lineTransport = 0;
      if (data.deliveryType === 'alghouli_delivery') {
        const t = await transportService.calculateTransport({
          customerId,
          sourceId: product.source_id,
          governorate: gov,
          area,
          packagingType: product.packaging_type,
          quantity: item.quantity,
          unit: product.unit,
        });
        lineTransport = t.amount;
      }
      transportTotal += lineTransport;

      items.push({
        productId: product.id,
        sourceId: product.source_id,
        packagingType: product.packaging_type,
        quantity: item.quantity,
        unit: product.unit,
        unitPrice: price,
        lineTotal,
      });
    }

    const totalAmount = subtotal + transportTotal;
    const paymentTerms = data.paymentTerms || 'cash';

    let paidNow = 0;
    let creditAmount = 0;

    if (paymentTerms === 'cash') {
      paidNow = totalAmount;
    } else if (paymentTerms === 'credit') {
      creditAmount = totalAmount;
    } else if (paymentTerms === 'partial') {
      paidNow = parseFloat(data.paidAmountNow || 0);
      if (paidNow < 0 || paidNow > totalAmount) {
        const err = new Error('المبلغ المدفوع غير صحيح');
        err.status = 400;
        throw err;
      }
      creditAmount = totalAmount - paidNow;
    }

    let creditCheck = null;
    if (creditAmount > 0) {
      creditCheck = await checkCreditAvailability(client, customerId, creditAmount);
      if (!creditCheck.can_approve) {
        const err = new Error(
          `تجاوز الحد الائتماني. الرصيد: ${creditCheck.current_balance}، الحد: ${creditCheck.credit_limit}`
        );
        err.status = 400;
        err.code = 'CREDIT_LIMIT_EXCEEDED';
        err.data = creditCheck;
        throw err;
      }
    }

    const initialStatus = creditAmount > 0 ? 'PENDING_ADMIN_APPROVAL' : 'PENDING_PAYMENT';
    const orderNumber = await generateOrderNumber();

    const o = await client.query(
      `INSERT INTO orders
       (order_number, customer_id, address_id, status, source,
        subtotal, discount_amount, shipping_amount, total_amount,
        paid_amount, remaining_amount, notes, created_by,
        delivery_type, trader_truck_plate, trader_driver_name, trader_driver_phone,
        transport_unit, payment_terms, paid_amount_now, credit_amount)
       VALUES ($1, $2, $3, $4, 'ONLINE',
               $5, 0, $6, $7, 0, $7, $8, $9,
               $10, $11, $12, $13, $14, $15, $16, $17)
       RETURNING id, order_number, status, subtotal, shipping_amount, total_amount, created_at`,
      [
        orderNumber, customerId, addressId, initialStatus,
        subtotal, transportTotal, totalAmount, data.notes || null, userId,
        data.deliveryType, data.traderTruckPlate || null,
        data.traderDriverName || null, data.traderDriverPhone || null,
        items[0]?.unit || 'bag', paymentTerms, paidNow, creditAmount,
      ]
    );
    const order = o.rows[0];

    for (const it of items) {
      await client.query(
        `INSERT INTO order_items
         (order_id, product_id, source_id, packaging_type, quantity, unit,
          unit_price, discount, line_total)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8)`,
        [order.id, it.productId, it.sourceId, it.packagingType,
         it.quantity, it.unit, it.unitPrice, it.lineTotal]
      );
      await client.query(
        `UPDATE inventory SET reserved_qty = reserved_qty + $1, updated_at = NOW()
         WHERE product_id = $2`,
        [it.quantity, it.productId]
      );
    }

    // سجّل الجزء الآجل فقط في كشف الحساب
    if (creditAmount > 0) {
      await ledgerService.addTransaction(client, {
        customerId, orderId: order.id,
        transactionType: 'purchase',
        debit: creditAmount,
        description: `طلب ${orderNumber} - ${paymentTerms === 'partial' ? 'دفع جزئي' : 'آجل'}`,
        createdBy: userId,
      });
    }

    await client.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, reason)
       VALUES ($1, NULL, $2, $3, $4)`,
      [order.id, initialStatus, userId,
       paymentTerms === 'credit' ? 'طلب آجل' :
       paymentTerms === 'partial' ? 'دفع جزئي' : 'طلب فوري']
    );

    await client.query('COMMIT');
    return {
      ...order,
      delivery_type: data.deliveryType,
      payment_terms: paymentTerms,
      paid_amount_now: paidNow,
      credit_amount: creditAmount,
      credit_check: creditCheck,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const approveCreditOrder = async (orderId, adminId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const o = await client.query(
      `SELECT id, status FROM orders WHERE id = $1 FOR UPDATE`,
      [orderId]
    );
    if (o.rows.length === 0) {
      const err = new Error('الطلب غير موجود');
      err.status = 404;
      throw err;
    }
    if (o.rows[0].status !== 'PENDING_ADMIN_APPROVAL') {
      const err = new Error('الطلب ليس بانتظار الموافقة');
      err.status = 400;
      throw err;
    }
    await client.query(
      `UPDATE orders SET status = 'PREPARING', credit_approved_by = $1,
       credit_approved_at = NOW(), updated_at = NOW() WHERE id = $2`,
      [adminId, orderId]
    );
    await client.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, reason)
       VALUES ($1, 'PENDING_ADMIN_APPROVAL', 'PREPARING', $2, 'موافقة المدير')`,
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

const rejectCreditOrder = async (orderId, adminId, reason) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const o = await client.query(
      `SELECT id, status, customer_id, credit_amount FROM orders WHERE id = $1 FOR UPDATE`,
      [orderId]
    );
    if (o.rows.length === 0) {
      const err = new Error('الطلب غير موجود');
      err.status = 404;
      throw err;
    }
    const order = o.rows[0];
    if (order.status !== 'PENDING_ADMIN_APPROVAL') {
      const err = new Error('الطلب ليس بانتظار الموافقة');
      err.status = 400;
      throw err;
    }
    await client.query(
      `UPDATE orders SET status = 'CREDIT_REJECTED',
       credit_rejection_reason = $1, updated_at = NOW() WHERE id = $2`,
      [reason, orderId]
    );

    // أعد الكميات
    const its = await client.query(
      `SELECT product_id, quantity FROM order_items WHERE order_id = $1`,
      [orderId]
    );
    for (const it of its.rows) {
      await client.query(
        `UPDATE inventory SET reserved_qty = GREATEST(0, reserved_qty - $1),
         updated_at = NOW() WHERE product_id = $2`,
        [it.quantity, it.product_id]
      );
    }

    // اعكس الدين
    if (parseFloat(order.credit_amount || 0) > 0) {
      await ledgerService.addTransaction(client, {
        customerId: order.customer_id,
        orderId, transactionType: 'cancellation',
        credit: parseFloat(order.credit_amount),
        description: `رفض طلب آجل`,
        createdBy: adminId,
      });
    }

    await client.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, reason)
       VALUES ($1, 'PENDING_ADMIN_APPROVAL', 'CREDIT_REJECTED', $2, $3)`,
      [orderId, adminId, `رفض: ${reason}`]
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

const listPendingCreditOrders = async () => {
  const r = await query(
    `SELECT o.id, o.order_number, o.status, o.total_amount, o.created_at,
            o.delivery_type, o.payment_terms,
            o.credit_amount, o.paid_amount_now,
            c.id AS customer_id, c.customer_type, c.current_balance, c.credit_limit,
            u.full_name AS customer_name, u.phone AS customer_phone
     FROM orders o
     JOIN customers c ON c.id = o.customer_id
     JOIN users u ON u.id = c.user_id
     WHERE o.status = 'PENDING_ADMIN_APPROVAL'
     ORDER BY o.created_at ASC`
  );
  return r.rows;
};

const getMyOrders = async (userId) => {
  const r = await query(
    `SELECT o.id, o.order_number, o.status, o.source,
            o.subtotal, o.shipping_amount, o.total_amount,
            o.paid_amount, o.remaining_amount,
            o.delivery_type, o.payment_terms, o.credit_rejection_reason,
            o.paid_amount_now, o.credit_amount, o.created_at,
            (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) AS items_count
     FROM orders o
     JOIN customers c ON c.id = o.customer_id
     WHERE c.user_id = $1
     ORDER BY o.created_at DESC`,
    [userId]
  );
  return r.rows;
};

const getOrderById = async (orderId, userId = null, isAdmin = false) => {
  let sql = `
    SELECT o.*, c.current_balance, c.credit_limit, c.customer_type,
           u.full_name AS customer_name, u.phone AS customer_phone,
           a.label AS address_label, a.governorate, a.area,
           a.address_text, a.alt_phone
    FROM orders o
    JOIN customers c ON c.id = o.customer_id
    JOIN users u ON u.id = c.user_id
    JOIN customer_addresses a ON a.id = o.address_id
    WHERE o.id = $1`;
  const params = [orderId];
  if (!isAdmin && userId) {
    sql += ` AND c.user_id = $2`;
    params.push(userId);
  }
  const r = await query(sql, params);
  if (r.rows.length === 0) return null;
  const order = r.rows[0];
  const its = await query(
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
  order.items = its.rows;
  return order;
};

const cancelOrder = async (orderId, userId, reason) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `SELECT o.id, o.status, o.customer_id, o.credit_amount
       FROM orders o JOIN customers c ON c.id = o.customer_id
       WHERE o.id = $1 AND c.user_id = $2`,
      [orderId, userId]
    );
    if (r.rows.length === 0) {
      const err = new Error('الطلب غير موجود');
      err.status = 404;
      throw err;
    }
    const order = r.rows[0];
    if (!['PENDING_PAYMENT', 'RECEIPT_UPLOADED', 'CREATED', 'PENDING_ADMIN_APPROVAL'].includes(order.status)) {
      const err = new Error('لا يمكن الإلغاء في هذه الحالة');
      err.status = 400;
      throw err;
    }
    const its = await client.query(
      `SELECT product_id, quantity FROM order_items WHERE order_id = $1`,
      [orderId]
    );
    for (const it of its.rows) {
      await client.query(
        `UPDATE inventory SET reserved_qty = GREATEST(0, reserved_qty - $1),
         updated_at = NOW() WHERE product_id = $2`,
        [it.quantity, it.product_id]
      );
    }
    await client.query(
      `UPDATE orders SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1`,
      [orderId]
    );
    if (parseFloat(order.credit_amount || 0) > 0) {
      await ledgerService.addTransaction(client, {
        customerId: order.customer_id, orderId,
        transactionType: 'cancellation',
        credit: parseFloat(order.credit_amount),
        description: 'إلغاء طلب',
        createdBy: userId,
      });
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
  createOrder, approveCreditOrder, rejectCreditOrder,
  listPendingCreditOrders, checkCreditAvailability,
  getMyOrders, getOrderById, cancelOrder,
};
