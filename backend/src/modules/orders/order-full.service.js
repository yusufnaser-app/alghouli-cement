const { query } = require('../../config/db');

/**
 * endpoint موحد: كل بيانات الطلب في استدعاء واحد.
 */
const getFullOrder = async (orderId, userId, userRoles = []) => {
  const isAdmin = userRoles.includes('admin');
  const isAccountant = userRoles.includes('accountant');
  const isSales = userRoles.includes('sales');
  const isTransport = userRoles.includes('transport');
  const isCustomer = userRoles.includes('customer');
  const isTrader = userRoles.includes('trader');

  const orderResult = await query(
    `SELECT o.*,
            c.id AS customer_id, c.user_id AS customer_user_id,
            c.governorate, c.area, c.default_address,
            u.full_name AS customer_name, u.phone AS customer_phone
     FROM orders o
     LEFT JOIN customers c ON c.id = o.customer_id
     LEFT JOIN users u ON u.id = c.user_id
     WHERE o.id = $1`,
    [orderId]
  );
  if (!orderResult.rows.length) {
    const e = new Error('الطلب غير موجود'); e.status = 404; throw e;
  }
  const order = orderResult.rows[0];

  // منع IDOR: غير الموظفين يرون طلباتهم فقط (العميل/التاجر: المالك — السائق: طلبات فاكسه فقط)
  const isStaff = ['admin', 'accountant', 'sales', 'transport', 'loading', 'auditor'].some((r) => userRoles.includes(r));
  if (!isStaff) {
    let allowed = (isCustomer || isTrader) && order.customer_user_id === userId;
    if (!allowed && userRoles.includes('driver')) {
      const d = await query(
        `SELECT 1 FROM loading_faxes f JOIN drivers dr ON dr.id = f.driver_id
         WHERE f.order_id = $1 AND dr.user_id = $2 LIMIT 1`, [orderId, userId]);
      allowed = d.rows.length > 0;
    }
    if (!allowed) { const e = new Error('غير مصرح'); e.status = 403; throw e; }
  }

  const itemsResult = await query(
    `SELECT oi.*,
            p.name_ar AS product_name,
            ps.name_ar AS source_name
     FROM order_items oi
     LEFT JOIN products p ON p.id = oi.product_id
     LEFT JOIN product_sources ps ON ps.id = oi.source_id
     WHERE oi.order_id = $1
     ORDER BY oi.id`,
    [orderId]
  );

  const paymentResult = await query(
    `SELECT p.*,
            pm.code AS method_code, pm.name_ar AS method_name
     FROM payments p
     LEFT JOIN payment_methods pm ON pm.id = p.method_id
     WHERE p.order_id = $1
     ORDER BY p.created_at DESC LIMIT 1`,
    [orderId]
  );

  const faxResult = await query(
    `SELECT lf.*,
            d.full_name AS driver_name, d.phone AS driver_phone,
            d.license_number AS driver_license,
            v.plate_number AS vehicle_plate, v.vehicle_type AS vehicle_type,
            f.name_ar AS factory_name
     FROM loading_faxes lf
     LEFT JOIN drivers d ON d.id = lf.driver_id
     LEFT JOIN vehicles v ON v.id = lf.vehicle_id
     LEFT JOIN product_sources f ON f.id = lf.factory_id
     WHERE lf.order_id = $1
     ORDER BY lf.created_at DESC LIMIT 1`,
    [orderId]
  ).catch(() => ({ rows: [] }));

  const orderedQtyResult = await query(
    `SELECT COALESCE(SUM(quantity), 0) AS ordered_quantity
     FROM order_items WHERE order_id = $1`,
    [orderId]
  );

  const statementResult = await query(
    `SELECT p.id, p.customer_debit, p.customer_payment_credit,
            p.loaded_quantity, p.posted_at,
            o.order_number,
            (p.customer_debit - p.customer_payment_credit) AS delta
     FROM order_accounting_postings p
     JOIN orders o ON o.id = p.order_id
     WHERE o.customer_id = $1
     ORDER BY p.posted_at DESC LIMIT 50`,
    [order.customer_id]
  ).catch(() => ({ rows: [] }));

  const balanceResult = await query(
    `SELECT COALESCE(SUM(p.customer_debit), 0) AS total_debit,
            COALESCE(SUM(p.customer_payment_credit), 0) AS total_credit
     FROM order_accounting_postings p
     JOIN orders o ON o.id = p.order_id
     WHERE o.customer_id = $1`,
    [order.customer_id]
  ).catch(() => ({ rows: [{ total_debit: 0, total_credit: 0 }] }));

  const historyResult = await query(
    `SELECT osh.*,
            u.full_name AS changed_by_name
     FROM order_status_history osh
     LEFT JOIN users u ON u.id = osh.changed_by
     WHERE osh.order_id = $1
     ORDER BY osh.created_at DESC LIMIT 20`,
    [orderId]
  ).catch(() => ({ rows: [] }));

  const totalDebit = parseFloat(balanceResult.rows[0].total_debit || 0);
  const totalCredit = parseFloat(balanceResult.rows[0].total_credit || 0);
  const customerBalance = totalDebit - totalCredit;

  const transactions = [];
  let running = customerBalance;
  for (const row of statementResult.rows) {
    transactions.push({
      id: row.id,
      order_number: row.order_number,
      debit: parseFloat(row.customer_debit || 0),
      credit: parseFloat(row.customer_payment_credit || 0),
      delta: parseFloat(row.delta || 0),
      loaded_quantity: parseFloat(row.loaded_quantity || 0),
      balance_after: running,
      posted_at: row.posted_at,
    });
    running -= parseFloat(row.delta || 0);
  }

  const orderedQty = parseFloat(orderedQtyResult.rows[0].ordered_quantity || 0);
  const loadedQty = parseFloat(order.final_loaded_quantity || 0);

  return {
    order,
    items: itemsResult.rows,
    pricing: {
      subtotal: parseFloat(order.final_subtotal || order.total_amount || 0),
      shipping: parseFloat(order.final_shipping_amount || 0),
      total: parseFloat(order.final_total_amount || order.total_amount || 0),
      paid_now: parseFloat(order.paid_amount_now || 0),
      credit_amount: parseFloat(order.credit_amount || 0),
      remaining: parseFloat(order.final_remaining_amount || 0),
    },
    payment: paymentResult.rows[0] || null,
    fax: faxResult.rows[0] || null,
    driver: faxResult.rows[0] ? {
      name: faxResult.rows[0].driver_name,
      phone: faxResult.rows[0].driver_phone,
      license: faxResult.rows[0].driver_license,
    } : null,
    vehicle: faxResult.rows[0] ? {
      plate: faxResult.rows[0].vehicle_plate || null,
      type: faxResult.rows[0].vehicle_type || null,
    } : null,
    quantities: {
      ordered: orderedQty,
      loaded: loadedQty,
      remaining: Math.max(0, orderedQty - loadedQty),
    },
    statement: {
      balance: customerBalance,
      total_debit: totalDebit,
      total_credit: totalCredit,
      transactions,
    },
    yemensoft: {
      accounting_status: order.accounting_status,
      accounting_note: order.accounting_note,
      accounting_posted_at: order.accounting_posted_at,
    },
    status_history: historyResult.rows,
    permissions: {
      can_price: isAdmin || isSales,
      can_approve_payment: isAdmin || isAccountant,
      can_post_accounting: isAdmin || isAccountant,
      can_manage_fax: isAdmin || isTransport,
      can_view_statement: isAdmin || isAccountant || isSales || isTrader || isCustomer,
    },
  };
};

module.exports = { getFullOrder };
