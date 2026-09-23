const { query } = require('../../config/db');

const calculateTransport = async ({
  customerId, sourceId, governorate, area, packagingType, quantity, unit,
}) => {
  const tryQuery = async (table, extraWhere = '', extraParams = []) => {
    const p = extraParams.length;
    const sql = `
      SELECT rate_unit, rate_amount
      FROM ${table}
      WHERE status = 'active'
        ${extraWhere}
        AND (source_id = $${p + 1} OR source_id IS NULL)
        AND (governorate = $${p + 2} OR governorate IS NULL)
        AND (area = $${p + 3} OR area IS NULL)
        AND (packaging_type = $${p + 4} OR packaging_type IS NULL)
        AND $${p + 5} >= min_quantity
        AND ($${p + 5} <= max_quantity OR max_quantity IS NULL)
      ORDER BY
        (source_id IS NOT NULL)::int DESC,
        (area IS NOT NULL)::int DESC,
        (governorate IS NOT NULL)::int DESC
      LIMIT 1
    `;
    const r = await query(sql, [
      ...extraParams, sourceId || null, governorate || null,
      area || null, packagingType || null, quantity,
    ]);
    return r.rows[0] || null;
  };

  let matched = null;
  let level = null;

  if (customerId) {
    matched = await tryQuery('customer_transport_rates', 'AND customer_id = $1', [customerId]);
    if (matched) level = 'customer_specific';
  }

  if (!matched) {
    matched = await tryQuery('transport_rates');
    if (matched) level = 'general';
  }

  if (!matched) {
    return { rate: 0, amount: 0, unit, has_rate: false, level: null };
  }

  const rate = parseFloat(matched.rate_amount);
  let qty = quantity;
  if (matched.rate_unit === 'ton' && unit === 'bag') qty = (quantity * 50) / 1000;
  else if (matched.rate_unit === 'bag' && unit === 'ton') qty = (quantity * 1000) / 50;

  return {
    rate, amount: Math.round(rate * qty),
    unit: matched.rate_unit, has_rate: true, level,
  };
};

const getCustomerProductPrice = async (customerId, productId, quantity) => {
  const r = await query(
    `SELECT price FROM customer_product_prices
     WHERE customer_id = $1 AND product_id = $2 AND status = 'active'
       AND $3 >= min_qty
       AND ($3 <= max_qty OR max_qty IS NULL)
       AND (valid_from IS NULL OR valid_from <= CURRENT_DATE)
       AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)
     ORDER BY min_qty DESC LIMIT 1`,
    [customerId, productId, quantity]
  );
  return r.rows.length > 0 ? parseFloat(r.rows[0].price) : null;
};

const listRates = async () => {
  const r = await query(`
    SELECT tr.*, ps.name_ar AS source_name
    FROM transport_rates tr
    LEFT JOIN product_sources ps ON ps.id = tr.source_id
    WHERE tr.status = 'active'
    ORDER BY ps.display_order ASC, tr.governorate ASC
  `);
  return r.rows;
};

const createRate = async (d) => {
  const r = await query(
    `INSERT INTO transport_rates
     (source_id, governorate, area, packaging_type, rate_unit, rate_amount, min_quantity, max_quantity, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [d.sourceId || null, d.governorate || null, d.area || null,
     d.packagingType || null, d.rateUnit, d.rateAmount,
     d.minQuantity || 0, d.maxQuantity || null, d.notes || null]
  );
  return r.rows[0];
};

const updateRate = async (id, d) => {
  const map = {
    sourceId: 'source_id', governorate: 'governorate', area: 'area',
    rateUnit: 'rate_unit', rateAmount: 'rate_amount',
    minQuantity: 'min_quantity', maxQuantity: 'max_quantity',
    notes: 'notes', status: 'status',
  };
  const fields = [];
  const params = [];
  for (const [k, col] of Object.entries(map)) {
    if (d[k] !== undefined) {
      params.push(d[k]);
      fields.push(`${col} = $${params.length}`);
    }
  }
  if (!fields.length) return null;
  params.push(id);
  const r = await query(
    `UPDATE transport_rates SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  );
  return r.rows[0];
};

const removeRate = async (id) => {
  const r = await query(`DELETE FROM transport_rates WHERE id = $1 RETURNING id`, [id]);
  return r.rows.length > 0;
};

const listCustomerTransportRates = async (customerId) => {
  const r = await query(
    `SELECT ctr.*, ps.name_ar AS source_name
     FROM customer_transport_rates ctr
     LEFT JOIN product_sources ps ON ps.id = ctr.source_id
     WHERE ctr.customer_id = $1
     ORDER BY ctr.created_at DESC`,
    [customerId]
  );
  return r.rows;
};

const createCustomerTransportRate = async (customerId, d) => {
  const r = await query(
    `INSERT INTO customer_transport_rates
     (customer_id, source_id, governorate, area, packaging_type, rate_unit, rate_amount, min_quantity, max_quantity, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [customerId, d.sourceId || null, d.governorate || null, d.area || null,
     d.packagingType || null, d.rateUnit, d.rateAmount,
     d.minQuantity || 0, d.maxQuantity || null, d.notes || null]
  );
  return r.rows[0];
};

const removeCustomerTransportRate = async (id, customerId) => {
  const r = await query(
    `DELETE FROM customer_transport_rates WHERE id = $1 AND customer_id = $2 RETURNING id`,
    [id, customerId]
  );
  return r.rows.length > 0;
};

const listCustomerProductPrices = async (customerId) => {
  const r = await query(
    `SELECT cpp.*, p.name_ar AS product_name, ps.name_ar AS source_name
     FROM customer_product_prices cpp
     JOIN products p ON p.id = cpp.product_id
     JOIN product_sources ps ON ps.id = p.source_id
     WHERE cpp.customer_id = $1
     ORDER BY cpp.created_at DESC`,
    [customerId]
  );
  return r.rows;
};

const createCustomerProductPrice = async (customerId, d) => {
  const r = await query(
    `INSERT INTO customer_product_prices
     (customer_id, product_id, price, min_qty, max_qty, valid_from, valid_to, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (customer_id, product_id, min_qty)
     DO UPDATE SET price = EXCLUDED.price, max_qty = EXCLUDED.max_qty,
                   status = 'active', notes = EXCLUDED.notes
     RETURNING *`,
    [customerId, d.productId, d.price, d.minQty || 1,
     d.maxQty || null, d.validFrom || null, d.validTo || null, d.notes || null]
  );
  return r.rows[0];
};

const removeCustomerProductPrice = async (id, customerId) => {
  const r = await query(
    `DELETE FROM customer_product_prices WHERE id = $1 AND customer_id = $2 RETURNING id`,
    [id, customerId]
  );
  return r.rows.length > 0;
};

module.exports = {
  calculateTransport, getCustomerProductPrice,
  listRates, createRate, updateRate, removeRate,
  listCustomerTransportRates, createCustomerTransportRate, removeCustomerTransportRate,
  listCustomerProductPrices, createCustomerProductPrice, removeCustomerProductPrice,
};
