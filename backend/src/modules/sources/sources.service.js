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
    `SELECT s.id, s.code, s.name_ar, s.governorate, s.area,
            s.supports_bagged, s.supports_bulk, s.status,
            COALESCE(
              json_agg(json_build_object('code', c.code, 'name_ar', c.name_ar))
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

module.exports = { listSources, getSourceById };
