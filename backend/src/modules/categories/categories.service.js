const { query } = require('../../config/db');

const listCategories = async () => {
  const result = await query(
    `SELECT id, code, name_ar, color_code, color_name_ar, description, usage_ar, display_order
     FROM product_categories
     WHERE status = 'active'
     ORDER BY display_order ASC`
  );
  return result.rows;
};

module.exports = { listCategories };
