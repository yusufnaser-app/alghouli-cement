'use strict';
const { pool, query } = require('../../config/db');
const core = require('../accounting/ledger.core');
const engine = require('../accounting/accounting.engine');
const { logAudit } = require('../audit/audit.service');

const wrap = (e) => {
  if (!(e instanceof engine.AccountingError)) return e;
  const x = new Error(e.message); x.status = e.status || 400; x.code = e.code; return x;
};

/**
 * توافق مع الاستدعاءات القديمة: أي قيد يمر الآن من ledger.core
 * (عملة إلزامية، مرجع إلزامي، قفل، عدم تكرار). لا كتابة مباشرة على الرصيد.
 */
const addTransaction = async (client, p) => {
  try {
    const r = await core.postCustomerEntry(client, {
      customerId: p.customerId, orderId: p.orderId, currency: p.currency || 'YER',
      debit: p.debit || 0, credit: p.credit || 0, transactionType: p.transactionType,
      description: p.description, paymentMethod: p.paymentMethod,
      referenceCode: p.referenceCode || `${String(p.transactionType).toUpperCase()}-${Date.now()}`,
      createdBy: p.createdBy, idempotencyKey: p.idempotencyKey, reason: p.reason,
      sourceType: p.sourceType, sourceId: p.sourceId,
    });
    return r.balance;
  } catch (e) { throw wrap(e); }
};

/** الأرصدة لكل عملة (من customer_balances = مجموع الدفتر). */
const getBalances = async (customerId) => core.getBalances({ query }, customerId);

/**
 * تفصيل الحساب لكل عملة من الدفتر نفسه (لا خلط عملات). القيد العاكس يُنسب لنوع الأصل.
 *  opening_balance: الرصيد الافتتاحي (مدين موجب)
 *  sales:           البيع الفعلي للأسمنت صافيًا بعد الخصم وبدون أجور النقل
 *  discounts:       الخصومات المطبّقة داخل البيع (معلومة — لا تُطرح مرة ثانية)
 *  transport_fees:  أجور النقل المحمّلة على العميل (داخل قيد البيع الفعلي)
 *  payments:        المدفوعات (دفعات معتمدة + يدوية) صافية
 *  adjustments:     التسويات اليدوية (موجب يزيد الرصيد)
 *  reconciled:      الرصيد المحسوب من الدفتر = customer_balances
 */
const loadBreakdown = async (customerId, balances) => {
  const kinds = await query(
    `SELECT cl.currency, COALESCE(orig.transaction_type, cl.transaction_type) AS kind,
            COALESCE(SUM(cl.debit), 0) AS debit, COALESCE(SUM(cl.credit), 0) AS credit
     FROM customer_ledger cl LEFT JOIN customer_ledger orig ON orig.id = cl.reversal_of_id
     WHERE cl.customer_id = $1
     GROUP BY cl.currency, COALESCE(orig.transaction_type, cl.transaction_type)`, [customerId]);
  // أجور النقل والخصومات من ترحيل الطلبات التي ما زال بيعها قائمًا (صافي البيع > 0)
  const tx = await query(
    `SELECT p.currency, COALESCE(SUM(p.trader_transport_amount), 0) AS transport, COALESCE(SUM(disc.amount), 0) AS discounts
     FROM order_accounting_postings p
     JOIN orders o ON o.id = p.order_id
     LEFT JOIN LATERAL (SELECT ROUND(SUM(COALESCE(oi.discount, 0)) * p.loaded_quantity / NULLIF(SUM(oi.quantity), 0), 2) AS amount
                        FROM order_items oi WHERE oi.order_id = o.id) disc ON TRUE
     WHERE o.customer_id = $1
       AND (SELECT COALESCE(SUM(l.debit - l.credit), 0) FROM customer_ledger l
            LEFT JOIN customer_ledger ro ON ro.id = l.reversal_of_id
            WHERE l.order_id = o.id AND COALESCE(ro.transaction_type, l.transaction_type) = 'actual_sale') > 0
     GROUP BY p.currency`, [customerId]);

  const out = {};
  for (const cur of engine.CURRENCIES) {
    const rows = kinds.rows.filter((r) => r.currency === cur);
    const t = tx.rows.find((r) => r.currency === cur);
    if (!rows.length && balances[cur] === undefined) continue;
    const m = {}; let total = 0;
    for (const r of rows) {
      const net = engine.toMinor(r.debit) - engine.toMinor(r.credit);   // مدين موجب
      m[r.kind] = (m[r.kind] || 0) + net; total += net;
    }
    const net = (...ks) => ks.reduce((sum, k) => sum + (m[k] || 0), 0);
    const transport = t ? engine.toMinor(t.transport) : 0;
    const opening = net('opening_balance');
    const sales = net('actual_sale') - transport;
    const payments = -net('payment', 'manual_payment');
    const adjustments = net('adjustment');
    const other = total - (opening + sales + transport - payments + adjustments);
    out[cur] = {
      opening_balance: engine.fromMinor(opening), sales: engine.fromMinor(sales),
      discounts: engine.fromMinor(t ? engine.toMinor(t.discounts) : 0),
      transport_fees: engine.fromMinor(transport), payments: engine.fromMinor(payments),
      adjustments: engine.fromMinor(adjustments), other: engine.fromMinor(other),
      reconciled: total === engine.toMinor(balances[cur] || 0),
    };
  }
  return out;
};

/** ملخص الحساب لكل عملة على حدة — بلا جمع عملات + الائتمان وحالة الحساب (الحد بالريال). */
const getSummary = async (customerId) => {
  const r = await query(
    `SELECT cl.currency,
            COALESCE(SUM(cl.debit),0) AS total_debit,
            COALESCE(SUM(cl.credit),0) AS total_credit,
            COUNT(DISTINCT cl.order_id) AS total_orders
     FROM customer_ledger cl WHERE cl.customer_id = $1 GROUP BY cl.currency`, [customerId]);
  const c = await query(
    `SELECT c.credit_limit, u.status AS user_status FROM customers c LEFT JOIN users u ON u.id = c.user_id WHERE c.id = $1`, [customerId]);
  const balances = await getBalances(customerId);
  const breakdown = await loadBreakdown(customerId, balances);
  const pending = await query(
    `SELECT COALESCE(SUM(credit_amount), 0) AS total FROM orders WHERE customer_id = $1 AND status = 'PENDING_ADMIN_APPROVAL'`, [customerId]);

  const byCurrency = {};
  for (const cur of engine.CURRENCIES) {
    const row = r.rows.find((x) => x.currency === cur);
    if (!row && balances[cur] === undefined) continue;
    byCurrency[cur] = {
      balance: balances[cur] || '0.00',
      side: engine.balanceSide(engine.toMinor(balances[cur] || 0)),
      total_debit: row ? engine.fromMinor(engine.toMinor(row.total_debit)) : '0.00',
      total_credit: row ? engine.fromMinor(engine.toMinor(row.total_credit)) : '0.00',
      ...(breakdown[cur] || {}),
    };
  }

  const limitMinor = engine.toMinor(c.rows[0] ? c.rows[0].credit_limit : 0);
  const hasLimit = limitMinor > 0;
  const balYer = engine.toMinor(balances.YER || 0);
  const pendingMinor = engine.toMinor(pending.rows[0] ? pending.rows[0].total : 0);
  const availableMinor = hasLimit ? Math.max(0, limitMinor - balYer - pendingMinor) : null;
  let accountStatus = 'active';
  if (c.rows[0] && c.rows[0].user_status && c.rows[0].user_status !== 'active') accountStatus = 'blocked';
  else if (hasLimit && balYer > limitMinor) accountStatus = 'over_limit';
  else if (hasLimit && balYer * 5 >= limitMinor * 4) accountStatus = 'near_limit';

  return {
    credit_limit: c.rows[0] ? c.rows[0].credit_limit : 0,
    has_limit: hasLimit,
    available_credit: availableMinor === null ? null : engine.fromMinor(availableMinor),
    pending_credit: engine.fromMinor(pendingMinor),
    account_status: accountStatus,
    balances: byCurrency,
  };
};

/** قائمة الحركات الخام (للتوافق). المصدر الرسمي للكشف: accounting-statements.service. */
const getLedger = async (customerId, { from, to, currency, limit = 100 } = {}) => {
  const params = [customerId];
  let sql = `SELECT cl.*, o.order_number FROM customer_ledger cl
             LEFT JOIN orders o ON o.id = cl.order_id WHERE cl.customer_id = $1`;
  if (currency) { params.push(engine.assertCurrency(currency)); sql += ` AND cl.currency = $${params.length}`; }
  if (from) { params.push(engine.periodStart(from)); sql += ` AND cl.entry_date >= $${params.length}`; }
  if (to) { params.push(engine.periodEnd(to)); sql += ` AND cl.entry_date <= $${params.length}`; }
  params.push(Math.min(Number(limit) || 100, 500));
  sql += ` ORDER BY cl.entry_date DESC, cl.seq DESC LIMIT $${params.length}`;
  return (await query(sql, params)).rows;
};

/**
 * دفعة يدوية يسجلها المحاسب مباشرة على الحساب (دفعة على الحساب، غير مرتبطة بطلب).
 * لا نفترض أنها تخص آخر طلب. idempotencyKey من العميل (الواجهة) يمنع التكرار عند الضغط المزدوج.
 */
const recordPayment = async (customerId, { amount, currency, method, reference, notes, createdBy, orderId, idempotencyKey }, ctx = {}) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = engine.assertCurrency(currency);
    if (engine.toMinor(amount) <= 0) throw new engine.AccountingError('مبلغ الدفعة يجب أن يكون أكبر من صفر', 'INVALID_AMOUNT');
    if (!reference || !String(reference).trim()) throw new engine.AccountingError('مرجع الدفعة مطلوب', 'REFERENCE_REQUIRED');
    if (orderId) {
      const o = await client.query(`SELECT id FROM orders WHERE id = $1 AND customer_id = $2`, [orderId, customerId]);
      if (!o.rows.length) throw new engine.AccountingError('الطلب لا يخص هذا العميل', 'ORDER_MISMATCH', 400);
    }
    const r = await core.postCustomerEntry(client, {
      customerId, orderId: orderId || null, currency: cur, debit: 0, credit: amount,
      transactionType: 'manual_payment', description: notes || `دفعة على الحساب - ${method || 'نقدي'}`,
      paymentMethod: method, referenceCode: String(reference).trim(), sourceType: 'manual_payment',
      idempotencyKey: idempotencyKey ? `manual-payment:${customerId}:${idempotencyKey}` : undefined,
      createdBy,
    });
    if (!r.duplicate) {
      await logAudit(client, {
        userId: createdBy, action: 'LEDGER_MANUAL_PAYMENT', entityType: 'customer_ledger', entityId: r.entry.id,
        newValues: { customer_id: customerId, amount: String(amount), currency: cur, order_id: orderId || null, reference },
        reason: notes || null, ip: ctx.ip, userAgent: ctx.userAgent,
      });
    }
    await client.query('COMMIT');
    return { entry_id: r.entry.id, currency: cur, new_balance: r.balance, duplicate: r.duplicate };
  } catch (err) {
    await client.query('ROLLBACK');
    throw wrap(err);
  } finally { client.release(); }
};

/** رصيد افتتاحي: واحد لكل (عميل، عملة). المدين = عليه، الدائن = له. */
const setOpeningBalance = async (customerId, { amount, side, currency, asOf, notes }, userId, ctx = {}) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = engine.assertCurrency(currency);
    if (!['debit', 'credit'].includes(side)) throw new engine.AccountingError('الجانب يجب أن يكون debit أو credit', 'INVALID_SIDE');
    if (engine.toMinor(amount) <= 0) throw new engine.AccountingError('مبلغ غير صالح', 'INVALID_AMOUNT');
    const r = await core.postCustomerEntry(client, {
      customerId, currency: cur, debit: side === 'debit' ? amount : 0, credit: side === 'credit' ? amount : 0,
      transactionType: 'opening_balance', description: notes || 'رصيد افتتاحي',
      referenceCode: `OPEN-${cur}`, sourceType: 'opening_balance', idempotencyKey: `opening:${customerId}:${cur}`,
      entryDate: asOf || null, createdBy: userId,
    });
    if (r.duplicate) throw new engine.AccountingError(`يوجد رصيد افتتاحي ${cur} لهذا العميل؛ صحّحه بتسوية أو عكس`, 'OPENING_EXISTS', 409);
    await logAudit(client, {
      userId, action: 'OPENING_BALANCE_SET', entityType: 'customer_ledger', entityId: r.entry.id,
      newValues: { customer_id: customerId, amount: String(amount), side, currency: cur, as_of: asOf || null },
      reason: notes || null, ip: ctx.ip, userAgent: ctx.userAgent,
    });
    // YemenSoft: القيد المحلي فوري، والترحيل الرسمي PENDING في الطابور (نفس المعاملة، idempotent)
    await require('../accounting/accounting-integration.service').enqueueSync({
      client, operation: 'POST_OPENING_BALANCE', entityType: 'customer_ledger', entityId: r.entry.id,
      payload: { party: 'customer', customer_id: customerId, amount: String(amount), side, currency: cur, as_of: asOf || null, reference: `OPEN-${cur}` },
      idempotencyKey: `sync:opening:customer:${customerId}:${cur}`, createdBy: userId,
    });
    await client.query('COMMIT');
    return { entry_id: r.entry.id, currency: cur, balance: r.balance, sync_status: 'PENDING' };
  } catch (err) { await client.query('ROLLBACK'); throw wrap(err); } finally { client.release(); }
};

/** تسوية يدوية (قيد معلَّل). تتطلب سببًا، وتُسجَّل في التدقيق. */
const manualAdjustment = async (customerId, { amount, side, currency, reason, reference, orderId }, userId, ctx = {}) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (!reason || String(reason).trim().length < 3) throw new engine.AccountingError('سبب التسوية مطلوب', 'REASON_REQUIRED');
    if (!['debit', 'credit'].includes(side)) throw new engine.AccountingError('الجانب غير صالح', 'INVALID_SIDE');
    const cur = engine.assertCurrency(currency);
    const ref = reference || `ADJ-${Date.now()}`;
    const r = await core.postCustomerEntry(client, {
      customerId, orderId: orderId || null, currency: cur,
      debit: side === 'debit' ? amount : 0, credit: side === 'credit' ? amount : 0,
      transactionType: 'adjustment', description: `تسوية: ${reason}`, referenceCode: ref,
      sourceType: 'manual_adjustment', reason, createdBy: userId,
    });
    await logAudit(client, {
      userId, action: 'LEDGER_ADJUSTMENT', entityType: 'customer_ledger', entityId: r.entry.id, entityRef: ref,
      newValues: { customer_id: customerId, amount: String(amount), side, currency: cur },
      reason, ip: ctx.ip, userAgent: ctx.userAgent,
    });
    await client.query('COMMIT');
    return { entry_id: r.entry.id, currency: cur, balance: r.balance };
  } catch (err) { await client.query('ROLLBACK'); throw wrap(err); } finally { client.release(); }
};

const reverseEntry = async (entryId, { reason }, userId, ctx = {}) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await core.reverseCustomerEntry(client, entryId, { reason, userId });
    if (!r.duplicate) {
      await logAudit(client, {
        userId, action: 'LEDGER_ENTRY_REVERSED', entityType: 'customer_ledger', entityId: entryId,
        oldValues: { debit: r.original.debit, credit: r.original.credit, currency: r.original.currency, reference: r.original.reference_code },
        newValues: { reversal_entry_id: r.entry.id }, reason, ip: ctx.ip, userAgent: ctx.userAgent,
      });
    }
    await client.query('COMMIT');
    return { reversal_entry_id: r.entry.id, already_reversed: r.duplicate, currency: r.entry.currency, balance: r.balance };
  } catch (err) { await client.query('ROLLBACK'); throw wrap(err); } finally { client.release(); }
};

/** قائمة العملاء مع أرصدتهم لكل عملة (دون جمعها). */
const listCustomersWithBalance = async (filters = {}) => {
  const params = [];
  let sql = `
    SELECT c.id, c.customer_type, c.governorate, c.area, c.credit_limit,
           u.full_name, u.phone, u.status,
           COALESCE(json_object_agg(b.currency, b.balance) FILTER (WHERE b.currency IS NOT NULL), '{}') AS balances,
           (SELECT COUNT(*) FROM orders WHERE customer_id = c.id) AS orders_count
    FROM customers c
    JOIN users u ON u.id = c.user_id
    LEFT JOIN customer_balances b ON b.customer_id = c.id
    WHERE 1=1`;
  if (filters.customerType) { params.push(filters.customerType); sql += ` AND c.customer_type = $${params.length}`; }
  sql += ` GROUP BY c.id, u.full_name, u.phone, u.status ORDER BY u.full_name ASC`;
  let rows = (await query(sql, params)).rows;
  if (filters.hasBalance === 'true') {
    rows = rows.filter((r) => Object.values(r.balances || {}).some((v) => engine.toMinor(v) > 0));
  }
  return rows;
};

module.exports = {
  addTransaction, getBalances, getLedger, getSummary, recordPayment,
  setOpeningBalance, manualAdjustment, reverseEntry, listCustomersWithBalance,
};
