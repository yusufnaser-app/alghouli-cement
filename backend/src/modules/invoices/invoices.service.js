const { pool, query } = require('../../config/db');

const generateInvoiceNumber = async () => {
  const year = new Date().getFullYear();
  const result = await query(
    `SELECT COUNT(*) FROM invoices WHERE invoice_number LIKE $1`,
    [`INV-${year}-%`]
  );
  const count = parseInt(result.rows[0].count, 10) + 1;
  return `INV-${year}-${String(count).padStart(6, '0')}`;
};

const generateInvoiceForOrder = async (orderId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // تحقق إن كانت الفاتورة موجودة
    const existing = await client.query(
      `SELECT id, invoice_number FROM invoices WHERE order_id = $1`,
      [orderId]
    );
    if (existing.rows.length > 0) {
      await client.query('COMMIT');
      return existing.rows[0];
    }

    // احصل على الطلب
    const orderResult = await client.query(
      `SELECT id, order_number, customer_id, subtotal, discount_amount,
              shipping_amount, total_amount, paid_amount, remaining_amount,
              status
       FROM orders WHERE id = $1`,
      [orderId]
    );
    if (orderResult.rows.length === 0) {
      const err = new Error('الطلب غير موجود');
      err.status = 404;
      throw err;
    }
    const order = orderResult.rows[0];

    const invoiceNumber = await generateInvoiceNumber();

    const invResult = await client.query(
      `INSERT INTO invoices
       (invoice_number, order_id, customer_id, total_amount, paid_amount)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, invoice_number, issued_at`,
      [invoiceNumber, orderId, order.customer_id, order.total_amount, order.paid_amount]
    );
    const invoice = invResult.rows[0];

    // أضف عناصر الفاتورة
    const items = await client.query(
      `SELECT p.name_ar AS product_name, oi.quantity, oi.unit_price,
              oi.discount, oi.line_total
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = $1`,
      [orderId]
    );

    for (const item of items.rows) {
      await client.query(
        `INSERT INTO invoice_items
         (invoice_id, product_name, quantity, unit_price, discount, line_total)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [invoice.id, item.product_name, item.quantity, item.unit_price, item.discount, item.line_total]
      );
    }

    await client.query('COMMIT');
    return invoice;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const getMyInvoices = async (userId) => {
  const result = await query(
    `SELECT i.id, i.invoice_number, i.total_amount, i.paid_amount, i.issued_at,
            o.order_number, o.status AS order_status
     FROM invoices i
     JOIN orders o ON o.id = i.order_id
     JOIN customers c ON c.id = i.customer_id
     WHERE c.user_id = $1
     ORDER BY i.issued_at DESC`,
    [userId]
  );
  return result.rows;
};

const getInvoiceById = async (invoiceId, userId = null, isAdmin = false) => {
  let sql = `
    SELECT i.id, i.invoice_number, i.total_amount, i.paid_amount, i.issued_at,
           o.id AS order_id, o.order_number, o.status AS order_status,
           o.subtotal, o.discount_amount, o.shipping_amount,
           u.full_name AS customer_name, u.phone AS customer_phone,
           a.governorate, a.area, a.address_text
    FROM invoices i
    JOIN orders o ON o.id = i.order_id
    JOIN customers c ON c.id = i.customer_id
    JOIN users u ON u.id = c.user_id
    JOIN customer_addresses a ON a.id = o.address_id
    WHERE i.id = $1
  `;
  const params = [invoiceId];

  if (!isAdmin && userId) {
    sql += ` AND c.user_id = $2`;
    params.push(userId);
  }

  const result = await query(sql, params);
  if (result.rows.length === 0) return null;
  const invoice = result.rows[0];

  const items = await query(
    `SELECT product_name, quantity, unit_price, discount, line_total
     FROM invoice_items WHERE invoice_id = $1`,
    [invoiceId]
  );
  invoice.items = items.rows;
  invoice.remaining_amount = parseFloat(invoice.total_amount) - parseFloat(invoice.paid_amount);
  return invoice;
};

module.exports = { generateInvoiceForOrder, getMyInvoices, getInvoiceById };
