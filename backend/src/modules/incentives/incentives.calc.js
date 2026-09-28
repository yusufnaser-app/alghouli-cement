// حساب نقي (بلا قاعدة بيانات) — سهل الاختبار.
// افتراض: الكميات في الفاكس بالكيس، والكيس = 50 كجم (حسب وثيقة المشروع)، والطن = 1000 كجم.
const KG_PER_BAG = 50;
const bagsToTons = (bags) => (bags * KG_PER_BAG) / 1000;

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// يعيد مبلغ الحافز لقاعدة واحدة على مجموع كميات سائق
const calcIncentive = ({ bags }, rule) => {
  const b = Number(bags) || 0;
  const rate = Number(rule.rate_per_unit) || 0;
  const qty = rule.unit === 'ton' ? bagsToTons(b) : b;
  return { quantity: round2(qty), rate, amount: round2(qty * rate) };
};

// القواعد المنطبقة على سائق (نوع السائق null = الكل)
const rulesFor = (driverType, rules) =>
  rules.filter((r) => !r.driver_type || r.driver_type === driverType);

// حدود الفترة [start, end) بالتوقيت العالمي
const periodRange = (period, year, month) => {
  if (period === 'monthly') {
    if (!(month >= 1 && month <= 12)) throw new Error('الشهر يجب أن يكون بين 1 و12');
    return { start: new Date(Date.UTC(year, month - 1, 1)), end: new Date(Date.UTC(year, month, 1)) };
  }
  return { start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year + 1, 0, 1)) };
};

module.exports = { KG_PER_BAG, bagsToTons, calcIncentive, rulesFor, periodRange, round2 };
