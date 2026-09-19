const { query } = require('../../config/db');

const buildPriceQuery = () => `
  COALESCE(
    (SELECT json_agg(json_build_object(
      'customer_type', pl.customer_type,
      'unit', pp.pricing_unit,
      'price', pp.price,
      'min_qty', pp.min_qty,
      'max_qty', pp.max_qty
    ) ORDER BY pl.priority)
    FROM product_prices pp
    JOIN price_lists pl ON pl.id = pp.price_list_id
    WHERE pp.product_id = p.id),
    '[]'
  ) AS prices
`;

const listProducts = async (filters = {}) => {
  let sql = `
    SELECT p.id, p.name_ar, p.grade, p.packaging_type, p.bag_weight_kg,
           p.description, p.image_url, p.status, p.min_order_qty,
           s.code AS source_code, s.name_ar AS source_name,
           c.code AS category_code, c.name_ar AS category_name,
           c.color_code AS category_color, c.color_name_ar AS category_color_name,
           COALESCE(i.available_qty, 0) AS available_qty,
           COALESCE(i.unit, CASE WHEN p.packaging_type = 'bagged' THEN 'bag' ELSE 'ton' END) AS unit,
           ${buildPriceQuery()}
    FROM products p
    JOIN product_sources s ON s.id = p.source_id
    JOIN product_categories c ON c.id = p.category_id
    LEFT JOIN inventory i ON i.product_id = p.id
    WHERE 1=1
  `;
  const params = [];

  if (filters.source_code) {
    params.push(filters.source_code);
    sql += ` AND s.code = $${params.length}`;
  }
  if (filters.category_code) {
    params.push(filters.category_code);
    sql += ` AND c.code = $${params.length}`;
  }
  if (filters.packaging_type) {
    params.push(filters.packaging_type);
    sql += ` AND p.packaging_type = $${params.length}`;
  }
  if (filters.grade) {
    params.push(filters.grade);
    sql += ` AND p.grade = $${params.length}`;
  }
  if (filters.status) {
    params.push(filters.status);
    sql += ` AND p.status = $${params.length}`;
  }
  if (filters.search) {
    params.push(`%${filters.search}%`);
    sql += ` AND (p.name_ar ILIKE $${params.length} OR s.name_ar ILIKE $${params.length})`;
  }

  sql += ` ORDER BY s.display_order ASC, c.display_order ASC, p.packaging_type ASC`;

  const result = await query(sql, params);
  return result.rows;
};

const getProductById = async (id) => {
  const result = await query(
    `SELECT p.id, p.name_ar, p.grade, p.packaging_type, p.bag_weight_kg,
            p.description, p.image_url, p.status, p.min_order_qty,
            s.id AS source_id, s.code AS source_code, s.name_ar AS source_name,
            s.governorate AS source_governorate,
            c.id AS category_id, c.code AS category_code, c.name_ar AS category_name,
            c.color_code AS category_color, c.color_name_ar AS category_color_name,
            c.usage_ar AS category_usage,
            COALESCE(i.available_qty, 0) AS available_qty,
            COALESCE(i.unit, CASE WHEN p.packaging_type = 'bagged' THEN 'bag' ELSE 'ton' END) AS unit,
            ${buildPriceQuery()}
     FROM products p
     JOIN product_sources s ON s.id = p.source_id
     JOIN product_categories c ON c.id = p.category_id
     LEFT JOIN inventory i ON i.product_id = p.id
     WHERE p.id = $1`,
    [id]
  );
  return result.rows[0] || null;
};

const calculatePrice = async (productId, customerType, quantity) => {
  const result = await query(
    `SELECT pp.price, pp.pricing_unit, pp.min_qty, pp.max_qty,
            pl.name_ar AS price_list_name
     FROM product_prices pp
     JOIN price_lists pl ON pl.id = pp.price_list_id
     WHERE pp.product_id = $1
       AND pl.customer_type = $2
       AND $3 >= pp.min_qty
       AND ($3 <= pp.max_qty OR pp.max_qty IS NULL)
     ORDER BY pp.min_qty DESC
     LIMIT 1`,
    [productId, customerType, quantity]
  );

  if (result.rows.length === 0) {
    // جرّب السعر الافتراضي للأفراد
    const fallback = await query(
      `SELECT pp.price, pp.pricing_unit
       FROM product_prices pp
       JOIN price_lists pl ON pl.id = pp.price_list_id
       WHERE pp.product_id = $1 AND pl.customer_type = 'individual'
       ORDER BY pp.min_qty ASC LIMIT 1`,
      [productId]
    );
    if (fallback.rows.length === 0) return null;
    return fallback.rows[0];
  }
  return result.rows[0];
};

module.exports = { listProducts, getProductById, calculatePrice };
