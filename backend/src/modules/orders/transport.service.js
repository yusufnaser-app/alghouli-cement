const { query } = require('../../config/db');

const calculateTransport = async ({ sourceId, governorate, area, packagingType, quantity, unit }) => {
  const sql = `
    SELECT rate_unit, rate_amount
    FROM transport_rates
    WHERE status = 'active'
      AND (source_id = $1 OR source_id IS NULL)
      AND (governorate = $2 OR governorate IS NULL)
      AND (area = $3 OR area IS NULL)
      AND (packaging_type = $4 OR packaging_type IS NULL)
      AND $5 >= min_quantity
      AND ($5 <= max_quantity OR max_quantity IS NULL)
    ORDER BY
      (source_id IS NOT NULL)::int DESC,
      (area IS NOT NULL)::int DESC,
      (governorate IS NOT NULL)::int DESC,
      (packaging_type IS NOT NULL)::int DESC
    LIMIT 1
  `;

  const result = await query(sql, [
    sourceId, governorate || null, area || null, packagingType || null, quantity,
  ]);

  if (result.rows.length === 0) {
    return { rate: 0, amount: 0, unit, has_rate: false };
  }

  const { rate_unit, rate_amount } = result.rows[0];
  const rate = parseFloat(rate_amount);
  let qty = quantity;
  if (rate_unit === 'ton' && unit === 'bag') {
    qty = (quantity * 50) / 1000;
  } else if (rate_unit === 'bag' && unit === 'ton') {
    qty = (quantity * 1000) / 50;
  }

  return {
    rate,
    amount: Math.round(rate * qty),
    unit: rate_unit,
    has_rate: true,
  };
};

const listRates = async () => {
  const r = await query(`
    SELECT tr.*, ps.name_ar AS source_name
    FROM transport_rates tr
    LEFT JOIN product_sources ps ON ps.id = tr.source_id
    ORDER BY tr.created_at DESC
  `);
  return r.rows;
};

const createRate = async (data) => {
  const r = await query(
    `INSERT INTO transport_rates
     (source_id, governorate, area, packaging_type, rate_unit, rate_amount, min_quantity, max_quantity)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [
      data.sourceId || null, data.governorate || null, data.area || null,
      data.packagingType || null, data.rateUnit, data.rateAmount,
      data.minQuantity || 0, data.maxQuantity || null,
    ]
  );
  return r.rows[0];
};

const updateRate = async (id, data) => {
  const fields = [];
  const params = [];
  const map = {
    rateUnit: 'rate_unit', rateAmount: 'rate_amount',
    minQuantity: 'min_quantity', maxQuantity: 'max_quantity', status: 'status',
  };
  for (const [k, col] of Object.entries(map)) {
    if (data[k] !== undefined) {
      params.push(data[k]);
      fields.push(`${col} = $${params.length}`);
    }
  }
  if (fields.length === 0) return null;
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

module.exports = { calculateTransport, listRates, createRate, updateRate, removeRate };
