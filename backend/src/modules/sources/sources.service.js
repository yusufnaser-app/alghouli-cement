const { query } = require('../../config/db');

const listSources = async (filters = {}) => {
  let sql = `
    SELECT s.id, s.code, s.name_ar, s.governorate, s.area,
           s.supports_bagged, s.supports_bulk, s.status, s.display_order,
           COALESCE(
             json_agg(
               json_build_object('code', c.code, 'name_ar', c.name_ar, 'color', c.color_code)
             ) FILTER (WHERE c.code IS NOT NULL),
             '[]'
           ) AS categories
    FROM product_sources s
    LEFT JOIN source_categories sc ON sc.source_id = s.id
    LEFT JOIN product_categories c ON c.id = sc.category_id
    WHERE 1=1
  `;
  const params = [];

  if (filters.status) {
    params.push(filters.status);
    sql += ` AND s.status = $${params.length}`;
  }
  if (filters.category) {
    params.push(filters.category);
    sql += ` AND c.code = $${params.length}`;
  }

  sql += ` GROUP BY s.id ORDER BY s.display_order ASC, s.name_ar ASC`;
  const result = await query(sql, params);
  return result.rows;
};

const getSourceById = async (id) => {
  const result = await query(
    `SELECT s.*,
            COALESCE(
              json_agg(json_build_object('id', c.id, 'code', c.code, 'name_ar', c.name_ar))
              FILTER (WHERE c.code IS NOT NULL),
              '[]'
            ) AS categories
     FROM product_sources s
     LEFT JOIN source_categories sc ON sc.source_id = s.id
     LEFT JOIN product_categories c ON c.id = sc.category_id
     WHERE s.id = $1
     GROUP BY s.id`,
    [id]
  );
  return result.rows[0] || null;
};

const create = async (data) => {
  const result = await query(
    `INSERT INTO product_sources
     (code, name_ar, governorate, area, supports_bagged, supports_bulk, display_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      data.code, data.nameAr, data.governorate || null, data.area || null,
      data.supportsBagged ?? true, data.supportsBulk ?? true, data.displayOrder || 0,
    ]
  );

  if (data.categoryIds && Array.isArray(data.categoryIds)) {
    for (const catId of data.categoryIds) {
      await query(
        `INSERT INTO source_categories (source_id, category_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [result.rows[0].id, catId]
      );
    }
  }

  return result.rows[0];
};

const update = async (id, data) => {
  const fields = [];
  const params = [];
  const map = {
    nameAr: 'name_ar', code: 'code', governorate: 'governorate', area: 'area',
    supportsBagged: 'supports_bagged', supportsBulk: 'supports_bulk',
    status: 'status', displayOrder: 'display_order',
  };
  for (const [key, col] of Object.entries(map)) {
    if (data[key] !== undefined) {
      params.push(data[key]);
      fields.push(`${col} = $${params.length}`);
    }
  }
  if (fields.length > 0) {
    fields.push(`updated_at = NOW()`);
    params.push(id);
    await query(`UPDATE product_sources SET ${fields.join(', ')} WHERE id = $${params.length}`, params);
  }

  if (data.categoryIds && Array.isArray(data.categoryIds)) {
    await query(`DELETE FROM source_categories WHERE source_id = $1`, [id]);
    for (const catId of data.categoryIds) {
      await query(
        `INSERT INTO source_categories (source_id, category_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [id, catId]
      );
    }
  }

  return getSourceById(id);
};

const remove = async (id) => {
  const r = await query(`DELETE FROM product_sources WHERE id = $1 RETURNING id`, [id]);
  return r.rows.length > 0;
};

module.exports = { listSources, getSourceById, create, update, remove };
