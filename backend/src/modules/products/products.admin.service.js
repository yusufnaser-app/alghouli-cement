const { query, pool } = require('../../config/db');

const create = async (data) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const r = await client.query(
      `INSERT INTO products
       (name_ar, source_id, category_id, grade, packaging_type, bag_weight_kg,
        description, image_url, status, min_order_qty)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        data.nameAr, data.sourceId, data.categoryId, data.grade || null,
        data.packagingType, data.bagWeightKg || null, data.description || null,
        data.imageUrl || null, data.status || 'available', data.minOrderQty || 1,
      ]
    );
    const product = r.rows[0];

    const unit = data.packagingType === 'bagged' ? 'bag' : 'ton';
    await client.query(
      `INSERT INTO inventory (product_id, available_qty, unit)
       VALUES ($1, $2, $3)`,
      [product.id, data.initialQty || 0, unit]
    );

    if (data.prices && Array.isArray(data.prices)) {
      for (const p of data.prices) {
        await client.query(
          `INSERT INTO product_prices
           (product_id, price_list_id, pricing_unit, price, min_qty, max_qty)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [product.id, p.priceListId, unit, p.price, p.minQty || 1, p.maxQty || null]
        );
      }
    }

    await client.query('COMMIT');
    return product;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const update = async (id, data) => {
  const fields = [];
  const params = [];

  const map = {
    nameAr: 'name_ar',
    sourceId: 'source_id',
    categoryId: 'category_id',
    grade: 'grade',
    packagingType: 'packaging_type',
    bagWeightKg: 'bag_weight_kg',
    description: 'description',
    imageUrl: 'image_url',
    status: 'status',
    minOrderQty: 'min_order_qty',
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
    await query(
      `UPDATE products SET ${fields.join(', ')} WHERE id = $${params.length}`,
      params
    );
  }

  // تحديث الأسعار إذا أُرسلت
  if (data.prices && Array.isArray(data.prices)) {
    await query(`DELETE FROM product_prices WHERE product_id = $1`, [id]);
    const unit = data.packagingType === 'bagged' ? 'bag' : 'ton';
    for (const p of data.prices) {
      await query(
        `INSERT INTO product_prices
         (product_id, price_list_id, pricing_unit, price, min_qty, max_qty)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, p.priceListId, unit, p.price, p.minQty || 1, p.maxQty || null]
      );
    }
  }

  const r = await query(`SELECT * FROM products WHERE id = $1`, [id]);
  return r.rows[0] || null;
};

const remove = async (id) => {
  const r = await query(`DELETE FROM products WHERE id = $1 RETURNING id`, [id]);
  return r.rows.length > 0;
};

const updatePrices = async (productId, prices) => {
  const p = await query(`SELECT packaging_type FROM products WHERE id = $1`, [productId]);
  if (p.rows.length === 0) return false;
  const unit = p.rows[0].packaging_type === 'bagged' ? 'bag' : 'ton';

  await query(`DELETE FROM product_prices WHERE product_id = $1`, [productId]);
  for (const price of prices) {
    await query(
      `INSERT INTO product_prices
       (product_id, price_list_id, pricing_unit, price, min_qty, max_qty)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [productId, price.priceListId, unit, price.price, price.minQty || 1, price.maxQty || null]
    );
  }
  return true;
};

const updateInventory = async (productId, quantity, reason, userId) => {
  await query(
    `UPDATE inventory SET available_qty = $1, updated_at = NOW() WHERE product_id = $2`,
    [quantity, productId]
  );
  await query(
    `INSERT INTO inventory_movements
     (product_id, movement_type, quantity, reason, user_id)
     VALUES ($1, 'adjustment', $2, $3, $4)`,
    [productId, quantity, reason || 'تعديل يدوي', userId]
  );
};

module.exports = { create, update, remove, updatePrices, updateInventory };
