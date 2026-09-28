// تصنيف العملاء (CRM) — حساب نقي بلا قاعدة بيانات. كل الحدود قابلة للتعديل من جدول settings.
const DEFAULTS = {
  new_days: 30,        // عميل جديد: سُجّل خلال آخر N يوم
  active_days: 30,     // نشط: له طلب خلال آخر N يوم
  inactive_days: 90,   // غير نشط: آخر طلب أقدم من N يوم
  baseline_days: 180,  // نافذة المقارنة السابقة لقياس انخفاض النشاط
  drop_ratio: 0.5,     // انخفاض: طلبات آخر 30 يومًا أقل من هذه النسبة من المتوسط الشهري السابق
  big_top_n: 10,       // عملاء كبار: أعلى N عميل بإجمالي مشتريات آخر 365 يومًا
};

const num = (v, d) => {
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? n : d;
};

// يبني الإعدادات من صفوف settings (key/value) مع القيم الافتراضية
const buildConfig = (rows = []) => {
  const m = {};
  for (const r of rows) m[r.key] = r.value;
  const cfg = {};
  for (const [k, d] of Object.entries(DEFAULTS)) cfg[k] = num(m[`crm_${k}`], d);
  return cfg;
};

const daysBetween = (a, b) => Math.floor((a.getTime() - b.getTime()) / 86400000);

// الأعداد: recent_count (آخر 30 يومًا)، baseline_count (النافذة السابقة لها بطول baseline_days)
const classify = (c, cfg, bigIds, now = new Date()) => {
  const segments = [];
  const lastOrder = c.last_order_at ? new Date(c.last_order_at) : null;
  const daysSinceLast = lastOrder ? daysBetween(now, lastOrder) : null;
  const daysSinceCreated = c.created_at ? daysBetween(now, new Date(c.created_at)) : null;
  const ordersCount = Number(c.orders_count) || 0;

  if (daysSinceCreated !== null && daysSinceCreated <= cfg.new_days) segments.push('new');
  if (daysSinceLast !== null && daysSinceLast <= cfg.active_days) segments.push('active');

  const inactive =
    (daysSinceLast !== null && daysSinceLast > cfg.inactive_days) ||
    (ordersCount === 0 && !segments.includes('new'));
  if (inactive) segments.push('inactive');

  // انخفاض النشاط: كان له معدل طلبات شهري ≥ 1 والآن أقل من drop_ratio منه، وليس غير نشط تمامًا
  const months = cfg.baseline_days / 30;
  const baselineMonthly = months > 0 ? (Number(c.baseline_count) || 0) / months : 0;
  const recent = Number(c.recent_count) || 0;
  if (!inactive && baselineMonthly >= 1 && recent < baselineMonthly * cfg.drop_ratio) {
    segments.push('low_activity');
  }

  if (bigIds && bigIds.has(c.id)) segments.push('big');
  if (['trader', 'distributor', 'contractor'].includes(c.customer_type)) segments.push(c.customer_type);

  return {
    segments,
    days_since_last_order: daysSinceLast,
    baseline_monthly_orders: Math.round(baselineMonthly * 100) / 100,
  };
};

// أعلى N عميل بإجمالي مشتريات 365 يومًا (يستثني من إجماليه صفر)
const pickBigCustomers = (rows, topN) =>
  new Set(
    [...rows]
      .filter((r) => (parseFloat(r.total_365) || 0) > 0)
      .sort((a, b) => parseFloat(b.total_365) - parseFloat(a.total_365))
      .slice(0, topN)
      .map((r) => r.id)
  );

const SEGMENT_LABELS = {
  new: 'جديد', active: 'نشط', inactive: 'غير نشط', low_activity: 'انخفاض نشاط',
  big: 'كبير', trader: 'تاجر', distributor: 'موزع', contractor: 'مقاول',
};

module.exports = { DEFAULTS, buildConfig, classify, pickBigCustomers, SEGMENT_LABELS };
