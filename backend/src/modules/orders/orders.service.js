const { pool, query } = require('../../config/db');

const generateOrderNumber = async () => {
  const year = new Date().getFullYear();
  const result = await query(
    `SELECT COUNT(*) FROM orders WHERE order_number LIKE $1`,
    [`GHO-${year}-%`]
  );
  const count = parseInt(result.rows[0].count, 10) + 1;
  const padded = String(count).padStart(6, '0');
  return `GHO-${year}-${padded}`;
};

const calculateShipping = async (governorate, area, totalAmount) => {
  const result = await query(
    `SELECT sr.base_price
     FROM shipping_rates sr
     JOIN shipping_zones sz ON sz.id = sr.zone_id
     WHERE sz.governorate = $1
       AND (sz.area IS NULL OR sz.area = $2)
       AND sr.status = 'active'
     ORDER BY sr.base_price ASC
     LIMIT 1`,
    [governorate, area]
  );
  if (result.rows.length > 0) return parseFloat(result.rows[0].base_price);
  // قيمة افتراضية
  return 50000;
};

const createOrder = async (userId, data) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // احصل على customer_id
    const cust = await client.query(
      `SELECT id FROM customers WHERE user_id = $1`,
      [userId]
    );
    if (cust.rows.length === 0) {
      const err = new Error('العميل غير موجود');
      err.status = 404;
      throw err;
    }
    const customerId = cust.rows[0].id;

    // تحقق من العنوان
    const addr = await client.query(
      `SELECT id, governorate, area FROM customer_addresses
       WHERE id = $1 AND customer_id = $2`,
      [data.addressId, customerId]
    );
    if (addr.rows.length === 0) {
      const err = new Error('العنوان غير موجود');
      err.status = 404;
      throw err;
    }
    const address = addr.rows[0];

    // احسب الأسعار
    let subtotal = 0;
    let discountAmount = 0;
    const itemsWithPrice = [];

    for (const item of data.items) {
      // احصل على المنتج
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
        const err = new Error(`المنتج غير موجود: ${item.productId}`);
        err.status = 404;
        throw err;
      }
      const product = prod.rows[0];

      // تحقق من الكمية
      if (parseFloat(product.available_qty) < item.quantity) {
        const err = new Error(`الكمية غير كافية من: ${product.name_ar}`);
        err.status = 400;
        err.code = 'INSUFFICIENT_STOCK';
        throw err;
      }

      // احسب السعر حسب نوع العميل
      const customerType = (await client.query(
        `SELECT customer_type FROM customers WHERE id = $1`,
        [customerId]
      )).rows[0].customer_type;

      const price = await client.query(
        `SELECT pp.price
         FROM product_prices pp
         JOIN price_lists pl ON pl.id = pp.price_list_id
         WHERE pp.product_id = $1 AND pl.customer_type = $2
           AND $3 >= pp.min_qty
           AND ($3 <= pp.max_qty OR pp.max_qty IS NULL)
         ORDER BY pp.min_qty DESC
         LIMIT 1`,
        [product.id, customerType, item.quantity]
      );

      if (price.rows.length === 0) {
        const err = new Error(`لا يوجد سعر متاح للمنتج: ${product.name_ar}`);
        err.status = 400;
        throw err;
      }

      const unitPrice = parseFloat(price.rows[0].price);
      const lineTotal = unitPrice * item.quantity;
      subtotal += lineTotal;

      itemsWithPrice.push({
        productId: product.id,
        sourceId: product.source_id,
        packagingType: product.packaging_type,
        quantity: item.quantity,
        unit: product.unit,
        unitPrice,
        discount: 0,
        lineTotal,
      });
    }

    // احسب النقل
    const shippingAmount = await calculateShipping(
      address.governorate,
      address.area,
      subtotal
    );

    const totalAmount = subtotal - discountAmount + shippingAmount;

    // أنشئ الطلب
    const orderNumber = await generateOrderNumber();

    const orderResult = await client.query(
      `INSERT INTO orders
       (order_number, customer_id, address_id, status, source,
        subtotal, discount_amount, shipping_amount, total_amount,
        paid_amount, remaining_amount, notes, created_by)
       VALUES ($1, $2, $3, 'PENDING_PAYMENT', 'ONLINE',
               $4, $5, $6, $7, 0, $7, $8, $9)
       RETURNING id, order_number, status, subtotal, discount_amount,
                 shipping_amount, total_amount, created_at`,
      [
        orderNumber,
        customerId,
        data.addressId,
        subtotal,
        discountAmount,
        shippingAmount,
        totalAmount,
        data.notes || null,
        userId,
      ]
    );
    const order = orderResult.rows[0];

    // أضف العناصر
    for (const item of itemsWithPrice) {
      await client.query(
        `INSERT INTO order_items
         (order_id, product_id, source_id, packaging_type, quantity, unit,
          unit_price, discount, line_total)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          order.id,
          item.productId,
          item.sourceId,
          item.packagingType,
          item.quantity,
          item.unit,
          item.unitPrice,
          item.discount,
          item.lineTotal,
        ]
      );

      // احجز الكمية
      await client.query(
        `UPDATE inventory
         SET reserved_qty = reserved_qty + $1, updated_at = NOW()
         WHERE product_id = $2`,
        [item.quantity, item.productId]
      );
    }

    await client.query('COMMIT');
    return order;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const getMyOrders = async (userId) => {
  const result = await query(
    `SELECT o.id, o.order_number, o.status, o.source,
            o.subtotal, o.discount_amount, o.shipping_amount,
            o.total_amount, o.paid_amount, o.remaining_amount,
            o.created_at,
            (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS items_count,
            (SELECT json_agg(json_build_object(
              'name', p.name_ar,
              'packaging_type', oi.packaging_type,
              'quantity', oi.quantity,
              'unit', oi.unit,
              'unit_price', oi.unit_price,
              'line_total', oi.line_total
            ))
            FROM order_items oi
            JOIN products p ON p.id = oi.product_id
            WHERE oi.order_id = o.id) AS items
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
    SELECT o.id, o.order_number, o.status, o.source,
           o.subtotal, o.discount_amount, o.shipping_amount,
           o.total_amount, o.paid_amount, o.remaining_amount,
           o.notes, o.created_at, o.updated_at,
           c.id AS customer_id, c.customer_type,
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
    `SELECT oi.id, oi.quantity, oi.unit, oi.unit_price,
            oi.discount, oi.line_total, oi.packaging_type,
            p.name_ar AS product_name, p.grade,
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

    // تحقق من الطلب
    const result = await client.query(
      `SELECT o.id, o.status FROM orders o
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
    const cancellableStatuses = ['PENDING_PAYMENT', 'RECEIPT_UPLOADED', 'CREATED'];
    if (!cancellableStatuses.includes(order.status)) {
      const err = new Error('لا يمكن إلغاء الطلب في حالته الحالية');
      err.status = 400;
      throw err;
    }

    // أعد الكميات من الحجز
    const items = await client.query(
      `SELECT product_id, quantity FROM order_items WHERE order_id = $1`,
      [orderId]
    );
    for (const item of items.rows) {
      await client.query(
        `UPDATE inventory
         SET reserved_qty = GREATEST(0, reserved_qty - $1), updated_at = NOW()
         WHERE product_id = $2`,
        [item.quantity, item.product_id]
      );
    }

    await client.query(
      `UPDATE orders SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1`,
      [orderId]
    );

    await client.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, reason)
       VALUES ($1, $2, 'CANCELLED', $3, $4)`,
      [orderId, order.status, userId, reason || 'إلغاء من العميل']
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
  getMyOrders,
  getOrderById,
  cancelOrder,
  calculateShipping,
};
