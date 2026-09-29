// حساب نقي (بلا قاعدة بيانات) لفحص تجاوز سقف واحد.
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// usedBags/usedAmount = المستهلك فعليًا في الفترة قبل هذا الطلب (لا يشمله)
const checkOne = (ceiling, { requestedBags = 0, requestedAmount = 0, usedBags = 0, usedAmount = 0 }) => {
  const checks = [];
  if (ceiling.max_bags !== null && ceiling.max_bags !== undefined) {
    const max = parseFloat(ceiling.max_bags);
    const after = round2(usedBags + requestedBags);
    checks.push({ type: 'bags', max, used: round2(usedBags), after, exceeded: after > max });
  }
  if (ceiling.max_amount !== null && ceiling.max_amount !== undefined) {
    const max = parseFloat(ceiling.max_amount);
    const after = round2(usedAmount + requestedAmount);
    checks.push({ type: 'amount', max, used: round2(usedAmount), after, exceeded: after > max });
  }
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
