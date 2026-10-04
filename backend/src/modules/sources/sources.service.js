const { query } = require('../../config/db');

const httpError = (status, message) => { const e = new Error(message); e.status = status; return e; };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// default_product_id أُضيف في migration لاحق؛ نتحقق من وجوده كي لا ينكسر الكود قبل تطبيقه
let _hasDefaultProduct = null;
const hasDefaultProductCol = async () => {
  if (_hasDefaultProduct === null) {
    const r = await query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_name = 'product_sources' AND column_name = 'default_product_id'`
    );
    _hasDefaultProduct = r.rows.length > 0;
  }
  return _hasDefaultProduct;
};

const validateCode = (code) => {
  const c = String(code || '').trim();
  if (c.length < 2 || c.length > 10) throw httpError(400, 'الكود يجب أن يكون من 2 إلى 10 أحرف');
  return c.toUpperCase();
};

const assertCodeFree = async (code, exceptId = null) => {
  const r = await query(
    `SELECT id FROM product_sources WHERE UPPER(code) = $1 AND ($2::uuid IS NULL OR id <> $2::uuid)`,
    [code, exceptId]
  );
  if (r.rows.length) throw httpError(409, 'الكود مستخدم مسبقًا');
};

const assertProductExists = async (productId) => {
  if (!UUID_RE.test(String(productId))) throw httpError(400, 'معرّف المنتج الافتراضي غير صالح');
  const r = await query(`SELECT 1 FROM products WHERE id = $1`, [productId]);
  if (!r.rows.length) throw httpError(400, 'المنتج الافتراضي غير موجود');
};

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

// إنشاء مصنع — تحقق يدوي بدون مكتبات خارجية
const create = async (data = {}) => {
  const code = validateCode(data.code);
  const nameAr = String(data.nameAr || '').trim();
  if (!nameAr) throw httpError(400, 'اسم المصنع مطلوب');
  await assertCodeFree(code);

  const cols = ['code', 'name_ar', 'governorate', 'area', 'supports_bagged', 'supports_bulk', 'display_order'];
  const vals = [code, nameAr, data.governorate || null, data.area || null,
    data.supportsBagged ?? true, data.supportsBulk ?? true, data.displayOrder || 0];
  if (data.status) { cols.push('status'); vals.push(data.status); }
  if (data.defaultProductId && await hasDefaultProductCol()) {
    await assertProductExists(data.defaultProductId);
    cols.push('default_product_id'); vals.push(data.defaultProductId);
  }
  const result = await query(
    `INSERT INTO product_sources (${cols.join(', ')})
     VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
    vals
  );

  if (Array.isArray(data.categoryIds)) {
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

// تعديل جزئي — الحقول المرسلة فقط
const update = async (id, data = {}) => {
  if (!UUID_RE.test(String(id))) return null;
  const exists = await query(`SELECT id FROM product_sources WHERE id = $1`, [id]);
  if (!exists.rows.length) return null;

  const fields = [];
  const params = [];
  const set = (col, val) => { params.push(val); fields.push(`${col} = $${params.length}`); };

  if (data.code !== undefined) {
    const code = validateCode(data.code);
    await assertCodeFree(code, id);
    set('code', code);
  }
  if (data.nameAr !== undefined) {
    const n = String(data.nameAr || '').trim();
    if (!n) throw httpError(400, 'اسم المصنع مطلوب');
    set('name_ar', n);
  }
  const map = {
    governorate: 'governorate', area: 'area', supportsBagged: 'supports_bagged',
    supportsBulk: 'supports_bulk', status: 'status', displayOrder: 'display_order',
  };
  for (const [key, col] of Object.entries(map)) {
    if (data[key] !== undefined) set(col, data[key]);
  }
  if (data.defaultProductId !== undefined && await hasDefaultProductCol()) {
    if (data.defaultProductId !== null) await assertProductExists(data.defaultProductId);
    set('default_product_id', data.defaultProductId);
  }
  if (fields.length > 0) {
    fields.push('updated_at = NOW()');
    params.push(id);
    await query(`UPDATE product_sources SET ${fields.join(', ')} WHERE id = $${params.length}`, params);
  }

  if (Array.isArray(data.categoryIds)) {
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

// حذف — يُمنع إن كان للمصنع منتجات أو فاكسات
const remove = async (id) => {
  if (!UUID_RE.test(String(id))) return false;
  const p = await query(`SELECT COUNT(*)::int AS n FROM products WHERE source_id = $1`, [id]);
  if (p.rows[0].n > 0) throw httpError(409, 'لا يمكن حذف مصنع لديه منتجات');
  const f = await query(`SELECT COUNT(*)::int AS n FROM loading_faxes WHERE factory_id = $1`, [id]);
  if (f.rows[0].n > 0) throw httpError(409, 'لا يمكن حذف مصنع مرتبط بفاكسات');
  try {
    await query(`DELETE FROM source_categories WHERE source_id = $1`, [id]);
    const r = await query(`DELETE FROM product_sources WHERE id = $1 RETURNING id`, [id]);
    return r.rows.length > 0;
  } catch (e) {
    // مفتاح أجنبي من جدول آخر (طلبات، حوافز...) — لا نحذف
    if (e.code === '23503') throw httpError(409, 'لا يمكن حذف مصنع مرتبط ببيانات أخرى');
    throw e;
  }
};

module.exports = { listSources, getSourceById, create, update, remove };
