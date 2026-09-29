const { query } = require('../../config/db');
const { checkAll } = require('./ceilings.calc');

const listRules = async () => {
  const r = await query(`SELECT * FROM order_ceilings ORDER BY is_active DESC, created_at DESC`);
  return r.rows;
};

const createRule = async (d, userId) => {
  const r = await query(
    `INSERT INTO order_ceilings (name_ar, period, customer_id, source_id, category_id, max_bags, max_amount, is_active, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [d.nameAr, d.period, d.customerId || null, d.sourceId || null, d.categoryId || null,
      d.maxBags ?? null, d.maxAmount ?? null, d.isActive !== false, userId]
  );
  return r.rows[0];
};

const updateRule = async (id, d) => {
  const map = { nameAr: 'name_ar', period: 'period', customerId: 'customer_id', sourceId: 'source_id',
    categoryId: 'category_id', maxBags: 'max_bags', maxAmount: 'max_amount', isActive: 'is_active' };
  const sets = []; const params = [];
  for (const [k, col] of Object.entries(map)) {
    if (d[k] !== undefined) { params.push(d[k]); sets.push(`${col} = $${params.length}`); }
  }
  if (!sets.length) { const e = new Error('لا توجد بيانات للتحديث'); e.status = 400; throw e; }
  params.push(id);
  const r = await query(`UPDATE order_ceilings SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`, params);
  if (!r.rows.length) { const e = new Error('السقف غير موجود'); e.status = 404; throw e; }
  return r.rows[0];
};

const periodStart = (period, now = new Date()) =>
  period === 'daily'
    ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

/**
 * يفحص طلبًا مقترحًا مقابل كل السقوف الفعّالة المطابقة. لا يرمي أبدًا؛ يعيد { exceeded, results }.
 * يُستدعى اختياريًا من مسار إنشاء الطلب — لن يمنع أي طلب ما لم تُضِف الإدارة سقفًا فعّالًا فعليًا.
 */
const checkOrderCeilings = async (client, { customerId, sourceId, categoryId, requestedBags, requestedAmount }) => {
  const rulesRes = await client.query(
    `SELECT * FROM order_ceilings WHERE is_active = true
     AND (customer_id IS NULL OR customer_id = $1)
     AND (source_id IS NULL OR source_id = $2)
     AND (category_id IS NULL OR category_id = $3)`,
    [customerId, sourceId || null, categoryId || null]
  );
  if (rulesRes.rows.length === 0) return { exceeded: false, results: [] };

  const usageByRule = {};
  for (const rule of rulesRes.rows) {
    const start = periodStart(rule.period);
    const u = await client.query(
      `SELECT COALESCE(SUM(oi.quantity), 0) AS bags, COALESCE(SUM(o.total_amount), 0) AS amount
       FROM orders o JOIN order_items oi ON oi.order_id = o.id
       WHERE o.customer_id = $1 AND o.created_at >= $2
         AND o.status NOT IN ('CANCELLED', 'CREDIT_REJECTED')
         ${rule.source_id ? 'AND oi.source_id = $3' : ''}`,
      rule.source_id ? [customerId, start, rule.source_id] : [customerId, start]
    );
    usageByRule[rule.id] = { usedBags: parseFloat(u.rows[0].bags) || 0, usedAmount: parseFloat(u.rows[0].amount) || 0 };
  }

  return checkAll(rulesRes.rows, { customerId, sourceId, categoryId, requestedBags, requestedAmount }, usageByRule);
};

const requestOverride = async (client, { customerId, ceilingId, requestedBags, requestedAmount, reason }) => {
  const r = await client.query(
    `INSERT INTO ceiling_overrides (customer_id, ceiling_id, requested_bags, requested_amount, reason)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [customerId, ceilingId || null, requestedBags ?? null, requestedAmount ?? null, reason || null]
  );
  return r.rows[0];
};

const listOverrides = async (status) => {
  const params = []; let where = '';
  if (status) { params.push(status); where = `WHERE status = $1`; }
  const r = await query(
    `SELECT ov.*, u.full_name AS customer_name, u.phone AS customer_phone
     FROM ceiling_overrides ov
     JOIN customers c ON c.id = ov.customer_id
     JOIN users u ON u.id = c.user_id
     ${where} ORDER BY ov.created_at DESC`,
    params
  );
  return r.rows;
};

const decideOverride = async (id, approve, userId) => {
  const r = await query(
    `UPDATE ceiling_overrides SET status = $1, decided_by = $2, decided_at = NOW()
     WHERE id = $3 AND status = 'PENDING' RETURNING *`,
    [approve ? 'APPROVED' : 'REJECTED', userId, id]
  );
  if (!r.rows.length) { const e = new Error('الطلب غير موجود أو تم البت فيه مسبقًا'); e.status = 404; throw e; }
  return r.rows[0];
};

module.exports = { listRules, createRule, updateRule, checkOrderCeilings, requestOverride, listOverrides, decideOverride, periodStart };
