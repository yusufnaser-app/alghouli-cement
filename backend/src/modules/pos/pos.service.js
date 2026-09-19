const { pool, query } = require('../../config/db');

const listPoints = async () => {
  const r = await query(`SELECT * FROM sales_points ORDER BY created_at DESC`);
  return r.rows;
};

const createPoint = async (data) => {
  const r = await query(
    `INSERT INTO sales_points (name_ar, location, manager_id)
     VALUES ($1, $2, $3) RETURNING *`,
    [data.nameAr, data.location || null, data.managerId || null]
  );
  return r.rows[0];
};

const openSession = async (userId, salesPointId, openingCash) => {
  // تحقق من عدم وجود جلسة مفتوحة
  const existing = await query(
    `SELECT id FROM pos_sessions WHERE user_id = $1 AND closed_at IS NULL`,
    [userId]
  );
  if (existing.rows.length > 0) {
    const err = new Error('لديك جلسة مفتوحة بالفعل');
    err.status = 400;
    throw err;
  }
  const r = await query(
    `INSERT INTO pos_sessions (sales_point_id, user_id, opening_cash)
     VALUES ($1, $2, $3) RETURNING *`,
    [salesPointId, userId, openingCash || 0]
  );
  return r.rows[0];
};

const closeSession = async (sessionId, userId, closingCash) => {
  const r = await query(
    `UPDATE pos_sessions SET closed_at = NOW(), closing_cash = $1
     WHERE id = $2 AND user_id = $3 AND closed_at IS NULL
     RETURNING *`,
    [closingCash, sessionId, userId]
  );
  return r.rows[0];
};

const createPosSale = async (userId, data) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // تحقق من وجود جلسة مفتوحة
    const session = await client.query(
      `SELECT id, sales_point_id FROM pos_sessions
       WHERE user_id = $1 AND closed_at IS NULL LIMIT 1`,
      [userId]
    );
    if (session.rows.length === 0) {
      const err = new Error('لا توجد جلسة مفتوحة');
      err.status = 400;
      throw err;
    }

    // أنشئ/احصل على العميل
    let customerId;
    if (data.customerId) {
      customerId = data.customerId;
    } else {
      // عميل نقدي — يجب أن يكون موجودًا
      const err = new Error('معرف العميل مطلوب');
      err.status = 400;
      throw err;
    }

    // احسب الإجمالي
    let subtotal = 0;
    const itemsData = [];

    for (const item of data.items) {
      const prod = await client.query(
        `SELECT p.id, p.source_id, p.packaging_type,
                COALESCE(i.unit, CASE WHEN p.packaging_type = 'bagged' THEN 'bag' ELSE 'ton' END) AS unit,
                COALESCE(i.available_qty, 0) AS available_qty
         FROM products p
         LEFT JOIN inventory i ON i.product_id = p.id
         WHERE p.id = $1`,
        [item.productId]
      );
      if (prod.rows.length === 0) {
        const err = new Error('المنتج غير موجود');
        err.status = 404;
        throw err;
      }
      const product = prod.rows[0];
      const lineTotal = item.unitPrice * item.quantity;
      subtotal += lineTotal;
      itemsData.push({ ...product, quantity: item.quantity, unitPrice: item.unitPrice, lineTotal });
    }

    const totalAmount = subtotal + (data.shippingAmount || 0);

    // رقم الطلب
    const year = new Date().getFullYear();
    const cntRes = await client.query(
      `SELECT COUNT(*) FROM orders WHERE order_number LIKE $1`,
      [`GHO-${year}-%`]
    );
    const orderNumber = `GHO-${year}-${String(parseInt(cntRes.rows[0].count, 10) + 1).padStart(6, '0')}`;

    // احصل على عنوان افتراضي للعميل
    const addrRes = await client.query(
      `SELECT id FROM customer_addresses WHERE customer_id = $1 ORDER BY is_default DESC LIMIT 1`,
      [customerId]
    );
    let addressId = addrRes.rows[0]?.id;
    if (!addressId) {
      const err = new Error('العميل ليس لديه عنوان');
      err.status = 400;
      throw err;
    }

    // أنشئ الطلب
    const orderRes = await client.query(
      `INSERT INTO orders
       (order_number, customer_id, address_id, status, source,
        subtotal, discount_amount, shipping_amount, total_amount,
        paid_amount, remaining_amount, created_by)
       VALUES ($1, $2, $3, 'COMPLETED', 'POS',
               $4, 0, $5, $6, $6, 0, $7)
       RETURNING id, order_number, total_amount, status`,
      [orderNumber, customerId, addressId, subtotal, data.shippingAmount || 0, totalAmount, userId]
    );
    const order = orderRes.rows[0];

    // أضف العناصر واخصم المخزون
    for (const item of itemsData) {
      await client.query(
        `INSERT INTO order_items
         (order_id, product_id, source_id, packaging_type, quantity, unit,
          unit_price, discount, line_total)
         VALUES ($1,$2,$3,$4,$5,$6,$7,0,$8)`,
        [order.id, item.id, item.source_id, item.packaging_type,
         item.quantity, item.unit, item.unitPrice, item.lineTotal]
      );
      await client.query(
        `UPDATE inventory SET
          available_qty = available_qty - $1,
          sold_qty = sold_qty + $1,
          updated_at = NOW()
         WHERE product_id = $2`,
        [item.quantity, item.id]
      );
    }

    await client.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, reason)
       VALUES ($1, NULL, 'COMPLETED', $2, 'بيع POS')`,
      [order.id, userId]
    );

    await client.query('COMMIT');
    return order;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

module.exports = { listPoints, createPoint, openSession, closeSession, createPosSale };
