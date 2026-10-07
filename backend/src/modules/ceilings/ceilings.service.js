const { pool, query } = require('../../config/db');
const { checkAll } = require('./ceilings.calc');
const { logAudit } = require('../audit/audit.service');

/**
 * حالات فحص السقف (ceiling_status):
 *   WITHIN_LIMIT | LIMIT_EXCEEDED | PENDING_EXCEPTION_APPROVAL | APPROVED_EXCEPTION | REJECTED_EXCEPTION
 * أكواد الأخطاء: CEILING_EXCEEDED (= LIMIT_EXCEEDED، كما كانت للتوافق)، PENDING_EXCEPTION_APPROVAL،
 *   REJECTED_EXCEPTION، OVERRIDE_ALREADY_USED، CEILING_CHECK_FAILED (فشل الفحص نفسه ⇒ الرفض، لا التجاوز الصامت).
 */

const coded = (message, code, status, ceilingStatus, data) => {
  const e = new Error(message);
  e.code = code; e.status = status; e.ceilingHandled = true;
  if (ceilingStatus) e.ceiling_status = ceilingStatus;
  if (data !== undefined) e.data = data;
  return e;
};

/** فشل الفحص نفسه ⇒ نرفض (لا نبتلع). السبب الأصلي يبقى في السجل. */
const failClosed = (err) => {
  if (err && err.ceilingHandled) return err;
  console.error('تعذّر فحص السقوف — الطلب مرفوض (فشل مغلق):', err && err.message);
  return coded('تعذّر التحقق من السقوف حاليًا، لم يُنشأ الطلب. حاول لاحقًا أو راجع الإدارة.', 'CEILING_CHECK_FAILED', 503, null);
};

/** يُستدعى بعد ROLLBACK: ينفّذ ما يجب أن يبقى رغم التراجع (طلب الاستثناء التلقائي). لا يرمي أبدًا. */
const runAfterRollback = async (err) => {
  if (err && typeof err.afterRollback === 'function') {
    try { await err.afterRollback(); } catch (e) { console.error('[ceilings] afterRollback:', e.message); }
  }
};

const listRules = async () => {
  const r = await query(`SELECT * FROM order_ceilings ORDER BY is_active DESC, created_at DESC`);
  return r.rows;
};

const createRule = async (d, userId, ctx = {}) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `INSERT INTO order_ceilings
         (name_ar, period, customer_id, source_id, category_id, max_bags, max_amount, max_orders, max_vehicles, is_active, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [d.nameAr, d.period, d.customerId || null, d.sourceId || null, d.categoryId || null,
        d.maxBags ?? null, d.maxAmount ?? null, d.maxOrders ?? null, d.maxVehicles ?? null, d.isActive !== false, userId]
    );
    await logAudit(client, {
      userId, action: 'CEILING_RULE_CREATED', entityType: 'order_ceilings', entityId: r.rows[0].id,
      newValues: r.rows[0], reason: d.reason || null, ip: ctx.ip, userAgent: ctx.userAgent,
    });
    await client.query('COMMIT');
    return r.rows[0];
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
};

const RULE_COLUMNS = { nameAr: 'name_ar', period: 'period', customerId: 'customer_id', sourceId: 'source_id',
  categoryId: 'category_id', maxBags: 'max_bags', maxAmount: 'max_amount', maxOrders: 'max_orders',
  maxVehicles: 'max_vehicles', isActive: 'is_active' };

const updateRule = async (id, d, userId, ctx = {}) => {
  const sets = []; const params = [];
  for (const [k, col] of Object.entries(RULE_COLUMNS)) {
    if (d[k] !== undefined) { params.push(d[k]); sets.push(`${col} = $${params.length}`); }
  }
  if (!sets.length) { const e = new Error('لا توجد بيانات للتحديث'); e.status = 400; throw e; }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const old = await client.query(`SELECT * FROM order_ceilings WHERE id = $1 FOR UPDATE`, [id]);
    if (!old.rows.length) { const e = new Error('السقف غير موجود'); e.status = 404; throw e; }
    params.push(id);
    const r = await client.query(`UPDATE order_ceilings SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`, params);
    await logAudit(client, {
      userId, action: 'CEILING_RULE_UPDATED', entityType: 'order_ceilings', entityId: id,
      oldValues: old.rows[0], newValues: r.rows[0], reason: d.reason || null, ip: ctx.ip, userAgent: ctx.userAgent,
    });
    await client.query('COMMIT');
    return r.rows[0];
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
};

/** ماذا يحدث عند تجاوز السقف لهذا الحساب: reject | request_approval. */
const setCustomerCeilingAction = async (customerId, action, userId, { reason, ip, userAgent } = {}) => {
  if (!['reject', 'request_approval'].includes(action)) { const e = new Error('إجراء غير صالح'); e.status = 400; throw e; }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const old = await client.query(`SELECT id, ceiling_action FROM customers WHERE id = $1 FOR UPDATE`, [customerId]);
    if (!old.rows.length) { const e = new Error('العميل غير موجود'); e.status = 404; throw e; }
    await client.query(`UPDATE customers SET ceiling_action = $1 WHERE id = $2`, [action, customerId]);
    await logAudit(client, {
      userId, action: 'CEILING_ACTION_CHANGED', entityType: 'customers', entityId: customerId,
      oldValues: { ceiling_action: old.rows[0].ceiling_action }, newValues: { ceiling_action: action },
      reason: reason || null, ip, userAgent,
    });
    await client.query('COMMIT');
    return { customer_id: customerId, ceiling_action: action };
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
};

const periodStart = (period, now = new Date()) =>
  period === 'daily'
    ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

const EXCLUDED = `('CANCELLED', 'CREDIT_REJECTED')`;

/** استهلاك العميل في فترة القاعدة (قبل هذا الطلب). الطن = 20 كيسًا. المبلغ من الطلبات (لا من صفوف البنود). */
const loadUsage = async (client, rule, customerId, requestedVehicleIds) => {
  const start = periodStart(rule.period);
  const src = rule.source_id ? [rule.source_id] : [];
  const srcItems = rule.source_id ? 'AND oi.source_id = $3' : '';
  const srcOrders = rule.source_id ? 'AND EXISTS (SELECT 1 FROM order_items y WHERE y.order_id = x.id AND y.source_id = $3)' : '';
  const u = await client.query(
    `SELECT COALESCE(SUM(oi.quantity * CASE WHEN oi.unit = 'ton' THEN 20 ELSE 1 END), 0) AS bags,
            (SELECT COALESCE(SUM(x.total_amount), 0) FROM orders x
             WHERE x.customer_id = $1 AND x.created_at >= $2 AND x.status NOT IN ${EXCLUDED} ${srcOrders}) AS amount,
            (SELECT COUNT(*) FROM orders x
             WHERE x.customer_id = $1 AND x.created_at >= $2 AND x.status NOT IN ${EXCLUDED} ${srcOrders}) AS orders_count
     FROM orders o JOIN order_items oi ON oi.order_id = o.id
     WHERE o.customer_id = $1 AND o.created_at >= $2 AND o.status NOT IN ${EXCLUDED} ${srcItems}`,
    [customerId, start, ...src]
  );
  const usage = {
    usedBags: parseFloat(u.rows[0].bags) || 0,
    usedAmount: parseFloat(u.rows[0].amount) || 0,
    usedOrders: parseInt(u.rows[0].orders_count, 10) || 0,
  };
  if (rule.max_vehicles !== null && rule.max_vehicles !== undefined) {
    // هوية القاطرة: المعرّف إن وُجد وإلا رقم اللوحة (الطلب الجماعي يحمل اللوحة فقط)
    const v = await client.query(
      `SELECT DISTINCT COALESCE(x.trader_vehicle_id::text, x.trader_truck_plate) AS vid FROM orders x
       WHERE x.customer_id = $1 AND x.created_at >= $2 AND x.status NOT IN ${EXCLUDED}
         AND COALESCE(x.trader_vehicle_id::text, x.trader_truck_plate) IS NOT NULL ${srcOrders}`,
      [customerId, start, ...src]
    );
    const seen = new Set(v.rows.map((r) => String(r.vid)));
    usage.usedVehicles = seen.size;
    usage.requestedVehicles = [...new Set((requestedVehicleIds || []).map(String))].filter((id) => !seen.has(id)).length;
  }
  return usage;
};

/**
 * يفحص طلبًا مقترحًا مقابل كل السقوف الفعّالة المطابقة. لا يرمي لتجاوز السقف؛ يعيد { exceeded, results }.
 * results[].checks[]: { type: bags|amount|orders|vehicles, max, used, after, available, excess, exceeded }.
 */
const checkOrderCeilings = async (client, {
  customerId, sourceId, categoryId, requestedBags, requestedAmount, requestedOrders = 0, requestedVehicleIds = [],
}) => {
  const rulesRes = await client.query(
    `SELECT * FROM order_ceilings WHERE is_active = true
     AND (customer_id IS NULL OR customer_id = $1)
     AND (source_id IS NULL OR source_id = $2)
     AND (category_id IS NULL OR category_id = $3)`,
    [customerId, sourceId || null, categoryId || null]
  );
  if (rulesRes.rows.length === 0) return { exceeded: false, results: [] };

  const usageByRule = {};
  for (const rule of rulesRes.rows) usageByRule[rule.id] = await loadUsage(client, rule, customerId, requestedVehicleIds);

  return checkAll(rulesRes.rows, { customerId, sourceId, categoryId, requestedBags, requestedAmount, requestedOrders }, usageByRule);
};

const covers = (ov, item) => {
  const types = item.checks.filter((c) => c.exceeded).map((c) => c.type);
  if (types.includes('bags') && ov.requested_bags != null && Number(ov.requested_bags) < item.requestedBags) return false;
  if (types.includes('amount') && ov.requested_amount != null && Number(ov.requested_amount) < item.requestedAmount) return false;
  return true;
};

const requestOverride = async (client, { customerId, ceilingId, requestedBags, requestedAmount, reason }) => {
  const r = await client.query(
    `INSERT INTO ceiling_overrides (customer_id, ceiling_id, requested_bags, requested_amount, reason)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [customerId, ceilingId || null, requestedBags ?? null, requestedAmount ?? null, reason || null]
  );
  return r.rows[0];
};

/** طلب استثناء تلقائي: لا يُكرَّر إن وُجد طلب PENDING لنفس العميل والسقف. */
const requestOverrideOnce = async (client, p) => {
  const ex = await client.query(
    `SELECT id FROM ceiling_overrides WHERE customer_id = $1 AND status = 'PENDING'
     AND ceiling_id IS NOT DISTINCT FROM $2 LIMIT 1`, [p.customerId, p.ceilingId || null]);
  if (ex.rows.length) return ex.rows[0];
  return requestOverride(client, p);
};

const enforceInner = async (client, ctx) => {
  const { customerId } = ctx;
  const cust = await client.query(`SELECT ceiling_action FROM customers WHERE id = $1`, [customerId]);
  const action = (cust.rows[0] && cust.rows[0].ceiling_action) || 'reject';
  const entries = ctx.entries && ctx.entries.length ? ctx.entries : [{ sourceId: null, requestedBags: 0, requestedAmount: 0 }];

  // الطلبات والقاطرات تُحتسب مرة واحدة (مع أول مدخل) لا لكل مصنع
  const exceeded = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const r = await checkOrderCeilings(client, {
      customerId, sourceId: e.sourceId, categoryId: null,
      requestedBags: e.requestedBags || 0, requestedAmount: e.requestedAmount || 0,
      requestedOrders: i === 0 ? (ctx.requestedOrders || 0) : 0,
      requestedVehicleIds: i === 0 ? (ctx.requestedVehicleIds || []) : [],
    });
    for (const res of r.results) {
      if (res.exceeded && !exceeded.some((x) => x.ceiling_id === res.ceiling_id)) {
        exceeded.push({ ...res, requestedBags: e.requestedBags || 0, requestedAmount: e.requestedAmount || 0 });
      }
    }
  }
  if (!exceeded.length) return { status: 'WITHIN_LIMIT', overrideIds: [], results: [] };

  // استثناءات معتمدة غير مستهلكة (قفل الصفوف: طلبان متزامنان لا يستهلكان الاستثناء نفسه)
  const cands = (await client.query(
    `SELECT * FROM ceiling_overrides WHERE customer_id = $1 AND status = 'APPROVED' AND used_at IS NULL
     ORDER BY decided_at ASC, created_at ASC FOR UPDATE`, [customerId])).rows;
  const chosen = new Set(); const uncovered = [];
  for (const item of exceeded) {
    const specific = cands.find((o) => o.ceiling_id === item.ceiling_id && !chosen.has(o.id) && covers(o, item));
    const general = cands.find((o) => o.ceiling_id === null && covers(o, item));
    const ov = specific || general;
    if (ov) chosen.add(ov.id); else uncovered.push(item);
  }
  if (!uncovered.length) return { status: 'APPROVED_EXCEPTION', overrideIds: [...chosen], results: exceeded };

  const ids = uncovered.map((u) => u.ceiling_id);
  if (action === 'reject') {
    throw coded('تم تجاوز السقف المسموح به لهذا الطلب.', 'CEILING_EXCEEDED', 400, 'LIMIT_EXCEEDED', uncovered);
  }

  // request_approval
  const pending = await client.query(
    `SELECT id FROM ceiling_overrides WHERE customer_id = $1 AND status = 'PENDING'
     AND (ceiling_id IS NULL OR ceiling_id = ANY($2::uuid[])) LIMIT 1`, [customerId, ids]);
  if (pending.rows.length) {
    throw coded('تجاوز الطلب السقف المسموح، وطلب الموافقة الاستثنائية قيد المراجعة لدى الإدارة.',
      'PENDING_EXCEPTION_APPROVAL', 409, 'PENDING_EXCEPTION_APPROVAL', uncovered);
  }
  const since = periodStart(uncovered.some((u) => u.period === 'daily') ? 'daily' : 'monthly');
  const rejected = await client.query(
    `SELECT id FROM ceiling_overrides WHERE customer_id = $1 AND status = 'REJECTED' AND decided_at >= $2
     AND (ceiling_id IS NULL OR ceiling_id = ANY($3::uuid[])) LIMIT 1`, [customerId, since, ids]);
  if (rejected.rows.length) {
    throw coded('رُفض طلب الاستثناء لهذا السقف في الفترة الحالية.', 'REJECTED_EXCEPTION', 409, 'REJECTED_EXCEPTION', uncovered);
  }

  // لا ننشئ الطلب ولا نكتب طلب الاستثناء داخل المعاملة (ستتراجع)؛ يُكتب بعد ROLLBACK بالاتصال العام
  const err = coded('تجاوز الطلب السقف المسموح. أُرسل طلب موافقة استثنائية للإدارة وسيُبَتّ فيه.',
    'PENDING_EXCEPTION_APPROVAL', 409, 'PENDING_EXCEPTION_APPROVAL', uncovered);
  err.afterRollback = async () => {
    for (const u of uncovered) {
      await requestOverrideOnce({ query }, {
        customerId, ceilingId: u.ceiling_id, requestedBags: u.requestedBags || null,
        requestedAmount: u.requestedAmount || null, reason: 'طلب تلقائي عند تجاوز السقف',
      });
    }
  };
  throw err;
};

/**
 * فحص إلزامي عند إنشاء طلب العميل. يرجع { status, overrideIds } أو يرمي خطأً بكود واضح.
 * أي فشل في الفحص ذاته ⇒ CEILING_CHECK_FAILED (رفض).
 * @param ctx { customerId, entries:[{sourceId, requestedBags, requestedAmount}], requestedOrders, requestedVehicleIds }
 */
const enforceOrderCeilings = async (client, ctx) => {
  try { return await enforceInner(client, ctx); } catch (e) { throw failClosed(e); }
};

/** يستهلك الاستثناءات المعتمدة بعد إدراج الطلب (داخل المعاملة نفسها). مرة واحدة فقط. */
const consumeOverrides = async (client, overrideIds, orderId, userId) => {
  if (!overrideIds || !overrideIds.length) return;
  const r = await client.query(
    `UPDATE ceiling_overrides SET used_at = NOW(), order_id = $2
     WHERE id = ANY($1::uuid[]) AND status = 'APPROVED' AND used_at IS NULL RETURNING id`, [overrideIds, orderId]);
  if (r.rows.length !== overrideIds.length) {
    throw coded('الموافقة الاستثنائية استُهلكت مسبقًا', 'OVERRIDE_ALREADY_USED', 409, null);
  }
  await client.query(`UPDATE orders SET ceiling_status = 'APPROVED_EXCEPTION' WHERE id = $1`, [orderId]);
  await logAudit(client, {
    userId, action: 'CEILING_EXCEPTION_USED', entityType: 'ceiling_overrides', entityId: overrideIds[0],
    newValues: { override_ids: overrideIds, order_id: orderId }, reason: 'استهلاك استثناء معتمد عند إنشاء طلب',
  });
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

const decideOverride = async (id, approve, userId, { reason, ip, userAgent } = {}) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `UPDATE ceiling_overrides SET status = $1, decided_by = $2, decided_at = NOW()
       WHERE id = $3 AND status = 'PENDING' RETURNING *`,
      [approve ? 'APPROVED' : 'REJECTED', userId, id]
    );
    if (!r.rows.length) { const e = new Error('الطلب غير موجود أو تم البت فيه مسبقًا'); e.status = 404; throw e; }
    await logAudit(client, {
      userId, action: approve ? 'CEILING_OVERRIDE_APPROVED' : 'CEILING_OVERRIDE_REJECTED',
      entityType: 'ceiling_overrides', entityId: id,
      oldValues: { status: 'PENDING' }, newValues: { status: r.rows[0].status, customer_id: r.rows[0].customer_id, ceiling_id: r.rows[0].ceiling_id },
      reason: reason || null, ip, userAgent,
    });
    await client.query('COMMIT');
    return r.rows[0];
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
};

module.exports = {
  listRules, createRule, updateRule, setCustomerCeilingAction,
  checkOrderCeilings, enforceOrderCeilings, consumeOverrides, runAfterRollback, failClosed,
  requestOverride, listOverrides, decideOverride, periodStart,
};
