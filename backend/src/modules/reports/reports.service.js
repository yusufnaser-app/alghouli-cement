const { query } = require('../../config/db');

const salesSummary = async (from, to) => {
  const result = await query(
    `SELECT
       COUNT(*) AS total_orders,
       COALESCE(SUM(total_amount), 0) AS total_sales,
       COALESCE(SUM(paid_amount), 0) AS total_collected,
       COALESCE(SUM(remaining_amount), 0) AS total_remaining,
       COUNT(CASE WHEN status = 'COMPLETED' OR status = 'DELIVERED' THEN 1 END) AS completed_orders,
       COUNT(CASE WHEN status IN ('PENDING_PAYMENT', 'PENDING_PAYMENT_REVIEW') THEN 1 END) AS pending_orders,
       COUNT(CASE WHEN status = 'CANCELLED' THEN 1 END) AS cancelled_orders
     FROM orders
     WHERE created_at BETWEEN $1 AND $2`,
    [from, to]
  );
  return result.rows[0];
};

const salesBySource = async (from, to) => {
  const result = await query(
    `SELECT s.code, s.name_ar,
            COUNT(DISTINCT o.id) AS orders_count,
            COALESCE(SUM(oi.quantity), 0) AS total_quantity,
            COALESCE(SUM(oi.line_total), 0) AS total_sales
     FROM product_sources s
     LEFT JOIN order_items oi ON oi.source_id = s.id
     LEFT JOIN orders o ON o.id = oi.order_id AND o.created_at BETWEEN $1 AND $2
     GROUP BY s.id, s.code, s.name_ar
     ORDER BY total_sales DESC`,
    [from, to]
  );
  return result.rows;
};

const salesByCategory = async (from, to) => {
  const result = await query(
    `SELECT c.code, c.name_ar, c.color_name_ar,
            COUNT(DISTINCT o.id) AS orders_count,
            COALESCE(SUM(oi.quantity), 0) AS total_quantity,
            COALESCE(SUM(oi.line_total), 0) AS total_sales
     FROM product_categories c
     LEFT JOIN products p ON p.category_id = c.id
     LEFT JOIN order_items oi ON oi.product_id = p.id
     LEFT JOIN orders o ON o.id = oi.order_id AND o.created_at BETWEEN $1 AND $2
     GROUP BY c.id, c.code, c.name_ar, c.color_name_ar
     ORDER BY total_sales DESC`,
    [from, to]
  );
  return result.rows;
};

const salesByPackaging = async (from, to) => {
  const result = await query(
    `SELECT oi.packaging_type,
            COUNT(DISTINCT o.id) AS orders_count,
            COALESCE(SUM(oi.quantity), 0) AS total_quantity,
            COALESCE(SUM(oi.line_total), 0) AS total_sales
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE o.created_at BETWEEN $1 AND $2
     GROUP BY oi.packaging_type`,
    [from, to]
  );
  return result.rows;
};

const topProducts = async (from, to, limit = 10) => {
  const result = await query(
    `SELECT p.id, p.name_ar, p.grade, p.packaging_type,
            s.name_ar AS source_name, c.name_ar AS category_name,
            COALESCE(SUM(oi.quantity), 0) AS total_quantity,
            COALESCE(SUM(oi.line_total), 0) AS total_sales
     FROM products p
     JOIN product_sources s ON s.id = p.source_id
     JOIN product_categories c ON c.id = p.category_id
     JOIN order_items oi ON oi.product_id = p.id
     JOIN orders o ON o.id = oi.order_id
     WHERE o.created_at BETWEEN $1 AND $2
     GROUP BY p.id, p.name_ar, p.grade, p.packaging_type, s.name_ar, c.name_ar
     ORDER BY total_sales DESC
     LIMIT $3`,
    [from, to, limit]
  );
  return result.rows;
};

const dailySales = async (from, to) => {
  const result = await query(
    `SELECT DATE(created_at) AS sale_date,
            COUNT(*) AS orders_count,
            SUM(total_amount) AS total_sales
     FROM orders
     WHERE created_at BETWEEN $1 AND $2
     GROUP BY DATE(created_at)
     ORDER BY sale_date ASC`,
    [from, to]
  );
  return result.rows;
};

const pendingPayments = async () => {
  const result = await query(
    `SELECT p.id, p.reference_code, p.amount_transferred,
            p.transaction_ref, p.created_at,
            o.order_number, u.full_name AS customer_name
     FROM payments p
     JOIN orders o ON o.id = p.order_id
     JOIN customers c ON c.id = o.customer_id
     JOIN users u ON u.id = c.user_id
     WHERE p.status = 'under_review'
     ORDER BY p.created_at ASC`
  );
  return result.rows;
};

const lowStock = async (threshold = 100) => {
  const result = await query(
    `SELECT p.id, p.name_ar, p.packaging_type,
            s.name_ar AS source_name,
            i.available_qty, i.unit
     FROM inventory i
     JOIN products p ON p.id = i.product_id
     JOIN product_sources s ON s.id = p.source_id
     WHERE i.available_qty <= $1
     ORDER BY i.available_qty ASC`,
    [threshold]
  );
  return result.rows;
};

module.exports = {
  salesSummary,
  salesBySource,
  salesByCategory,
  salesByPackaging,
  topProducts,
  dailySales,
  pendingPayments,
  lowStock,
};
