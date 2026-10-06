'use strict';
const { query } = require('../../config/db');
const engine = require('./accounting.engine');

/** يجمع البيانات (قراءة فقط) ثم يمرّرها للمحرك النقي. لا يعدّل شيئًا. */
const runIntegrityCheck = async ({ customerId = null } = {}) => {
  const cp = customerId ? [customerId] : [];
  const cw = customerId ? 'WHERE customer_id = $1' : '';
  const [ledger, orders, payments, postings, faxes, driverLedger, items, balances] = await Promise.all([
    query(`SELECT id, customer_id, order_id, transaction_type, debit, credit, balance_after, currency, reference_code,
                  source_type, source_id, reversal_of_id, idempotency_key, entry_date, created_at, seq
           FROM customer_ledger ${cw}`, cp),
    query(`SELECT id, status, currency, accounting_status, shipping_amount, transport_mode, transport_unit, transport_beneficiary, customer_id
           FROM orders ${customerId ? 'WHERE customer_id = $1' : ''}`, cp),
    query(`SELECT p.id, p.order_id, p.status, p.payment_currency, p.amount_transferred
           FROM payments p ${customerId ? 'JOIN orders o ON o.id = p.order_id WHERE o.customer_id = $1' : ''}`, cp),
    query(`SELECT ap.* FROM order_accounting_postings ap ${customerId ? 'JOIN orders o ON o.id = ap.order_id WHERE o.customer_id = $1' : ''}`, cp),
    query(`SELECT f.order_id, f.status, f.loaded_quantity, f.transport_total, f.requested_quantity, f.transport_rate_unit
           FROM loading_faxes f ${customerId ? 'JOIN orders o ON o.id = f.order_id WHERE o.customer_id = $1' : ''}`, cp),
    query(`SELECT order_id, transaction_type, debit, credit, driver_id FROM driver_ledger WHERE order_id IS NOT NULL`),
    query(`SELECT oi.order_id, oi.quantity, oi.unit_price AS "unitPrice", oi.discount FROM order_items oi
           ${customerId ? 'JOIN orders o ON o.id = oi.order_id WHERE o.customer_id = $1' : ''}`, cp),
    query(`SELECT customer_id, currency, balance FROM customer_balances ${cw}`, cp),
  ]);
  const balMap = {};
  balances.rows.forEach((b) => { (balMap[b.customer_id] = balMap[b.customer_id] || {})[b.currency] = b.balance; });
  // حساب إعادة التحقق من المبلغ يحتاج مجموع النقل الفعلي من الفاكس
  const faxByOrder = new Map(faxes.rows.filter((f) => f.status === 'USED').map((f) => [f.order_id, f]));
  const ordersEx = orders.rows.map((o) => {
    const f = faxByOrder.get(o.id);
    return { ...o, transport_total_for_check: f && f.transport_total !== null ? f.transport_total : o.shipping_amount,
      transport_unit: (f && f.transport_rate_unit) || o.transport_unit, transport_requested_quantity: f ? f.requested_quantity : null };
  });
  const findings = engine.runIntegrityChecks({
    ledger: ledger.rows, orders: ordersEx, payments: payments.rows, postings: postings.rows,
    faxes: faxes.rows, driverLedger: driverLedger.rows, items: items.rows, balances: balMap,
  });
  const bySeverity = findings.reduce((a, f) => { a[f.severity] = (a[f.severity] || 0) + 1; return a; }, {});
  const byCode = findings.reduce((a, f) => { a[f.code] = (a[f.code] || 0) + 1; return a; }, {});
  return {
    ok: findings.length === 0, checked_at: new Date().toISOString(),
    scope: customerId ? { customer_id: customerId } : 'all',
    counts: { ledger_entries: ledger.rows.length, orders: orders.rows.length, payments: payments.rows.length, postings: postings.rows.length },
    summary: { total: findings.length, by_severity: bySeverity, by_code: byCode },
    findings,
  };
};

/** إعادة بناء رصيد عميل من الصفر ومقارنته بالمخزّن (يعرض الفرق دائمًا). */
const rebuildCustomerBalance = async (customerId) => {
  const r = await query(
    `SELECT id, customer_id, transaction_type, debit, credit, currency, reference_code, entry_date, created_at, seq
     FROM customer_ledger WHERE customer_id = $1`, [customerId]);
  const stored = await query(`SELECT currency, balance FROM customer_balances WHERE customer_id = $1`, [customerId]);
  const map = {}; stored.rows.forEach((x) => { map[x.currency] = x.balance; });
  const legacy = await query(`SELECT current_balance FROM customers WHERE id = $1`, [customerId]);
  return {
    customer_id: customerId,
    accounts: engine.rebuildAndCompare(r.rows, map),
    legacy_customers_current_balance_YER: legacy.rows[0] ? legacy.rows[0].current_balance : null,
    chain_problems: engine.verifyRunningChain(r.rows),
  };
};

module.exports = { runIntegrityCheck, rebuildCustomerBalance };
