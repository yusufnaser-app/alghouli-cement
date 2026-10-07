// حساب نقي (بلا قاعدة بيانات) لفحص تجاوز سقف واحد.
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// used* = المستهلك فعليًا في الفترة قبل هذا الطلب (لا يشمله). requested* = ما يضيفه هذا الطلب.
// orders = عدد الطلبات، vehicles = عدد القاطرات المختلفة (الجديدة فقط في requestedVehicles).
// كل فحص يعيد: max / used / after / exceeded / available (المتاح قبل الطلب) / excess (مقدار التجاوز).
const mk = (type, max, used, requested) => {
  const after = round2(used + requested);
  return { type, max, used: round2(used), after, exceeded: after > max,
    available: round2(Math.max(0, max - used)), excess: round2(Math.max(0, after - max)) };
};

const checkOne = (ceiling, {
  requestedBags = 0, requestedAmount = 0, usedBags = 0, usedAmount = 0,
  requestedOrders = 0, usedOrders = 0, requestedVehicles = 0, usedVehicles = 0,
}) => {
  const has = (v) => v !== null && v !== undefined;
  const checks = [];
  if (has(ceiling.max_bags)) checks.push(mk('bags', parseFloat(ceiling.max_bags), usedBags, requestedBags));
  if (has(ceiling.max_amount)) checks.push(mk('amount', parseFloat(ceiling.max_amount), usedAmount, requestedAmount));
  if (has(ceiling.max_orders)) checks.push(mk('orders', parseInt(ceiling.max_orders, 10), usedOrders, requestedOrders));
  if (has(ceiling.max_vehicles)) checks.push(mk('vehicles', parseInt(ceiling.max_vehicles, 10), usedVehicles, requestedVehicles));
  return { ceiling_id: ceiling.id, name_ar: ceiling.name_ar, period: ceiling.period, checks,
    exceeded: checks.some((c) => c.exceeded) };
};

// أخص قاعدة تنطبق أولًا: عميل+مصنع+نوع، ثم عميل+مصنع، ثم عميل+نوع، ثم عميل، ثم مصنع+نوع، ثم مصنع، ثم نوع، ثم عام.
// لكن كل السقوف المطابقة (وليس الأخص فقط) يجب أن تُفحص جميعًا — تجاوز أي واحد منها يكفي لرفض الطلب.
const matches = (rule, { customerId, sourceId, categoryId }) =>
  (!rule.customer_id || rule.customer_id === customerId) &&
  (!rule.source_id || rule.source_id === sourceId) &&
  (!rule.category_id || rule.category_id === categoryId);

const checkAll = (rules, ctx, usageByRule) => {
  const applicable = rules.filter((r) => matches(r, ctx));
  const results = applicable.map((r) => checkOne(r, { ...ctx, ...(usageByRule[r.id] || {}) }));
  return { exceeded: results.some((r) => r.exceeded), results };
};

module.exports = { checkOne, checkAll, matches, round2 };
