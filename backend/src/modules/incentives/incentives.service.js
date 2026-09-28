const { query } = require('../../config/db');
const { calcIncentive, rulesFor, periodRange, round2 } = require('./incentives.calc');

const listRules = async () => {
  const r = await query(`SELECT * FROM incentive_rules ORDER BY is_active DESC, period, created_at DESC`);
  return r.rows;
};

const createRule = async (d, userId) => {
  const r = await query(
    `INSERT INTO incentive_rules (name_ar, period, unit, rate_per_unit, driver_type, valid_from, valid_to, is_active, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [d.nameAr, d.period, d.unit, d.ratePerUnit, d.driverType || null, d.validFrom || null, d.validTo || null,
      d.isActive !== false, userId]
  );
  return r.rows[0];
};

const updateRule = async (id, d) => {
  const map = { nameAr: 'name_ar', period: 'period', unit: 'unit', ratePerUnit: 'rate_per_unit',
    driverType: 'driver_type', validFrom: 'valid_from', validTo: 'valid_to', isActive: 'is_active' };
  const sets = [];
  const params = [];
  for (const [k, col] of Object.entries(map)) {
    if (d[k] !== undefined) { params.push(d[k]); sets.push(`${col} = $${params.length}`); }
  }
  if (!sets.length) { const e = new Error('لا توجد بيانات للتحديث'); e.status = 400; throw e; }
  params.push(id);
  const r = await query(
    `UPDATE incentive_rules SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`,
    params
  );
  if (!r.rows.length) { const e = new Error('القاعدة غير موجودة'); e.status = 404; throw e; }
  return r.rows[0];
};

// تقرير الحوافز: الكمية المحملة فعليًا (loaded_quantity) للفاكسات التي أُكمل تحميلها ضمن الفترة
const report = async ({ period, year, month }) => {
  const { start, end } = periodRange(period, year, month);

  const rulesRes = await query(
    `SELECT * FROM incentive_rules
     WHERE is_active = true AND period = $1
       AND (valid_from IS NULL OR valid_from < $3::date)
       AND (valid_to IS NULL OR valid_to >= $2::date)`,
    [period, start, end]
  );
  const rules = rulesRes.rows;

  const totals = await query(
    `SELECT d.id AS driver_id, d.full_name, d.driver_type,
            COUNT(f.id)::int AS trips,
            COALESCE(SUM(f.loaded_quantity), 0) AS bags
     FROM loading_faxes f
     JOIN drivers d ON d.id = f.driver_id
     WHERE f.used_at >= $1 AND f.used_at < $2
       AND f.status IN ('USED', 'READY_FOR_TRANSIT')
     GROUP BY d.id, d.full_name, d.driver_type
     ORDER BY bags DESC`,
    [start, end]
  );

  const drivers = totals.rows.map((row) => {
    const bags = parseFloat(row.bags) || 0;
    const applied = rulesFor(row.driver_type, rules).map((rule) => ({
      rule_id: rule.id, rule_name: rule.name_ar, unit: rule.unit, ...calcIncentive({ bags }, rule),
    }));
    return {
      driver_id: row.driver_id, full_name: row.full_name, driver_type: row.driver_type,
      trips: row.trips, total_bags: bags,
      applied_rules: applied,
      total_incentive: round2(applied.reduce((s, a) => s + a.amount, 0)),
    };
  });

  return {
    period, year, month: period === 'monthly' ? month : null,
    rules_count: rules.length,
    grand_total: round2(drivers.reduce((s, d) => s + d.total_incentive, 0)),
    drivers,
    note: rules.length === 0
      ? 'لا توجد قواعد حوافز فعّالة لهذه الفترة — أضف قاعدة من الإدارة.'
      : 'الأرقام تقديرية للعرض والمتابعة ولا تُقيَّد تلقائيًا في حساب السائق.',
  };
};

module.exports = { listRules, createRule, updateRule, report };
