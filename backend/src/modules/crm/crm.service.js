const { query } = require('../../config/db');
const { buildConfig, classify, pickBigCustomers } = require('./crm.calc');

const VALID = `o.status NOT IN ('CANCELLED', 'CREDIT_REJECTED')`;

const listCustomers = async ({ segment, search } = {}) => {
  const cfgRes = await query(`SELECT key, value FROM settings WHERE key LIKE 'crm\\_%'`);
  const cfg = buildConfig(cfgRes.rows);

  const now = new Date();
  const d = (days) => new Date(now.getTime() - days * 86400000);
  const recentStart = d(30);
  const baselineStart = d(30 + cfg.baseline_days);
  const yearStart = d(365);

  const r = await query(
    `SELECT c.id, c.customer_type, c.governorate, c.created_at, u.full_name, u.phone,
            COUNT(o.id) FILTER (WHERE ${VALID})::int AS orders_count,
            COALESCE(SUM(o.total_amount) FILTER (WHERE ${VALID}), 0) AS total_amount,
            COALESCE(AVG(o.total_amount) FILTER (WHERE ${VALID}), 0) AS avg_order,
            MAX(o.created_at) FILTER (WHERE ${VALID}) AS last_order_at,
            COUNT(o.id) FILTER (WHERE ${VALID} AND o.created_at >= $1)::int AS recent_count,
            COUNT(o.id) FILTER (WHERE ${VALID} AND o.created_at >= $2 AND o.created_at < $1)::int AS baseline_count,
            COALESCE(SUM(o.total_amount) FILTER (WHERE ${VALID} AND o.created_at >= $3), 0) AS total_365
     FROM customers c
     JOIN users u ON u.id = c.user_id
     LEFT JOIN orders o ON o.customer_id = c.id
     GROUP BY c.id, c.customer_type, c.governorate, c.created_at, u.full_name, u.phone
     LIMIT 5000`,
    [recentStart, baselineStart, yearStart]
  );

  const bigIds = pickBigCustomers(r.rows, cfg.big_top_n);
  let rows = r.rows.map((row) => ({ ...row, ...classify(row, cfg, bigIds, now) }));

  const summary = {};
  for (const row of rows) for (const s of row.segments) summary[s] = (summary[s] || 0) + 1;
  summary.all = rows.length;

  if (segment && segment !== 'all') rows = rows.filter((row) => row.segments.includes(segment));
  if (search) {
    const q = String(search).trim().toLowerCase();
    rows = rows.filter((row) => (row.full_name || '').toLowerCase().includes(q) || (row.phone || '').includes(q));
  }
  rows.sort((a, b) => parseFloat(b.total_amount) - parseFloat(a.total_amount));

  return { config: cfg, summary, customers: rows };
};

module.exports = { listCustomers };
