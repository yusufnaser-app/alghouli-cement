const { query } = require('../../config/db');

// === Campaigns ===

const listCampaigns = async () => {
  const r = await query(
    `SELECT mc.*, p.name_ar AS product_name
     FROM marketing_campaigns mc
     LEFT JOIN products p ON p.id = mc.product_id
     ORDER BY mc.created_at DESC`
  );
  return r.rows;
};

const createCampaign = async (data, userId) => {
  const r = await query(
    `INSERT INTO marketing_campaigns
     (title_ar, body_ar, image_url, product_id, target_customer_type,
      target_governorate, target_area, start_date, end_date, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      data.titleAr, data.bodyAr || null, data.imageUrl || null, data.productId || null,
      data.targetCustomerType || null, data.targetGovernorate || null, data.targetArea || null,
      data.startDate, data.endDate, data.status || 'draft', userId,
    ]
  );
  return r.rows[0];
};

const updateCampaign = async (id, data) => {
  const fields = [];
  const params = [];
  const map = {
    titleAr: 'title_ar', bodyAr: 'body_ar', imageUrl: 'image_url',
    productId: 'product_id', targetCustomerType: 'target_customer_type',
    targetGovernorate: 'target_governorate', targetArea: 'target_area',
    startDate: 'start_date', endDate: 'end_date', status: 'status',
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
    `UPDATE marketing_campaigns SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  );
  return r.rows[0];
};

const deleteCampaign = async (id) => {
  const r = await query(`DELETE FROM marketing_campaigns WHERE id = $1 RETURNING id`, [id]);
  return r.rows.length > 0;
};

// === Offers ===

const listActiveOffers = async (customerType = null) => {
  let sql = `
    SELECT o.*, p.name_ar AS product_name, p.grade, p.packaging_type,
           s.name_ar AS source_name
    FROM offers o
    JOIN products p ON p.id = o.product_id
    JOIN product_sources s ON s.id = p.source_id
    WHERE o.status = 'active'
      AND CURRENT_DATE BETWEEN o.start_date AND o.end_date`;
  const params = [];
  if (customerType) {
    sql += ` AND (
      o.campaign_id IS NULL
      OR (SELECT target_customer_type FROM marketing_campaigns WHERE id = o.campaign_id) IS NULL
      OR (SELECT target_customer_type FROM marketing_campaigns WHERE id = o.campaign_id) = $1
    )`;
    params.push(customerType);
  }
  sql += ` ORDER BY o.created_at DESC`;
  const r = await query(sql, params);
  return r.rows;
};

const createOffer = async (data) => {
  const r = await query(
    `INSERT INTO offers
     (campaign_id, product_id, offer_type, discount_value, min_qty, max_qty,
      special_price, start_date, end_date, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      data.campaignId || null, data.productId, data.offerType,
      data.discountValue || null, data.minQty || null, data.maxQty || null,
      data.specialPrice || null, data.startDate, data.endDate,
      data.status || 'active',
    ]
  );
  return r.rows[0];
};

const deleteOffer = async (id) => {
  const r = await query(`DELETE FROM offers WHERE id = $1 RETURNING id`, [id]);
  return r.rows.length > 0;
};

module.exports = {
  listCampaigns, createCampaign, updateCampaign, deleteCampaign,
  listActiveOffers, createOffer, deleteOffer,
};
