const { query } = require('../../config/db');

const listCategories = async () => {
  const result = await query(
    `SELECT id, code, name_ar, color_code, color_name_ar, description, usage_ar, display_order, status
     FROM product_categories
     ORDER BY display_order ASC`
  );
  return result.rows;
};

const create = async (data) => {
  const r = await query(
    `INSERT INTO product_categories
     (code, name_ar, color_code, color_name_ar, description, usage_ar, display_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [data.code, data.nameAr, data.colorCode, data.colorNameAr,
     data.description || null, data.usageAr || null, data.displayOrder || 0]
  );
  return r.rows[0];
};

const update = async (id, data) => {
  const fields = [];
  const params = [];
  const map = {
    code: 'code', nameAr: 'name_ar', colorCode: 'color_code',
    colorNameAr: 'color_name_ar', description: 'description',
    usageAr: 'usage_ar', displayOrder: 'display_order', status: 'status',
  };
  for (const [k, col] of Object.entries(map)) {
    if (data[k] !== undefined) {
      params.push(data[k]);
      fields.push(`${col} = $${params.length}`);
    }
  }
  if (!fields.length) return null;
  params.push(id);
  const r = await query(
    `UPDATE product_categories SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  );
  return r.rows[0];
};

const remove = async (id) => {
  const r = await query(`DELETE FROM product_categories WHERE id = $1 RETURNING id`, [id]);
  return r.rows.length > 0;
};

module.exports = { listCategories, create, update, remove };
