'use strict';
/**
 * قاعدة بيانات وهمية في الذاكرة تحاكي الاستعلامات التي تستخدمها نواة الدفتر والترحيل والدفعات.
 * تدعم BEGIN/COMMIT/ROLLBACK بلقطة كاملة، وفهرسًا فريدًا لـ idempotency_key (كما في PostgreSQL).
 * ملاحظة: تختبر منطق JavaScript وتدفّق المعاملات؛ لا تنفّذ SQL حقيقيًا (لا يوجد PostgreSQL في بيئة الاختبار).
 */
const clone = (x) => JSON.parse(JSON.stringify(x));
const N = (v) => (v === null || v === undefined ? 0 : Number(v));

const makeDb = (seed = {}) => {
  let st = {
    seq: 0, customers: {}, balances: {}, ledger: [], payments: {}, orders: {}, items: [], faxes: {}, postings: {},
    factory: [], driverLedger: [], drivers: {}, inventory: {}, audit: [], history: [], ...clone(seed),
  };
  let snapshot = null;
  const calls = [];
  const norm = (s) => s.replace(/\s+/g, ' ').trim();

  const handlers = [
    [/^BEGIN/, () => { snapshot = clone(st); return { rows: [] }; }],
    [/^COMMIT/, () => { snapshot = null; return { rows: [] }; }],
    [/^ROLLBACK/, () => { if (snapshot) st = snapshot; snapshot = null; return { rows: [] }; }],

    // ── ledger.core ──
    [/^SELECT id FROM customers WHERE id = \$1 FOR UPDATE/, (p) => ({ rows: st.customers[p[0]] ? [{ id: p[0] }] : [] })],
    [/^SELECT \* FROM customer_ledger WHERE idempotency_key = \$1/, (p) => ({ rows: st.ledger.filter((l) => l.idempotency_key === p[0]) })],
    [/^SELECT balance FROM customer_balances WHERE customer_id = \$1 AND currency = \$2/, (p) => {
      const b = st.balances[`${p[0]}|${p[1]}`]; return { rows: b === undefined ? [] : [{ balance: b }] }; }],
    [/^INSERT INTO customer_ledger/, (p) => {
      const idem = p[13];
      if (idem && st.ledger.some((l) => l.idempotency_key === idem)) return { rows: [] };
      if (p[14] && st.ledger.some((l) => l.reversal_of_id === p[14])) { const e = new Error('duplicate reversal'); e.code = '23505'; throw e; }
      const row = { id: `L${++st.seq}`, seq: st.seq, customer_id: p[0], order_id: p[1], transaction_type: p[2], debit: p[3], credit: p[4],
        balance_after: p[5], currency: p[6], description: p[7], payment_method: p[8], reference_code: p[9], created_by: p[10],
        source_type: p[11], source_id: p[12], idempotency_key: idem, reversal_of_id: p[14], reason: p[15], entry_date: p[16] || new Date().toISOString() };
      st.ledger.push(row); return { rows: [row] }; }],
    [/^SELECT currency, balance FROM customer_balances WHERE customer_id = \$1/, (p) => ({
      rows: Object.entries(st.balances).filter(([k]) => k.startsWith(`${p[0]}|`)).map(([k, v]) => ({ currency: k.split('|')[1], balance: v })) })],
    [/^INSERT INTO customer_balances/, (p) => { st.balances[`${p[0]}|${p[1]}`] = p[2]; return { rows: [] }; }],
    [/^UPDATE customers SET current_balance/, () => ({ rows: [] })],
    [/^SELECT \* FROM customer_ledger WHERE id = \$1/, (p) => ({ rows: st.ledger.filter((l) => l.id === p[0]) })],

    // ── driver ledger ──
    [/^SELECT current_balance FROM drivers WHERE id = \$1 FOR UPDATE/, (p) => ({ rows: st.drivers[p[0]] ? [{ current_balance: st.drivers[p[0]].current_balance }] : [] })],
    [/^SELECT \* FROM driver_ledger WHERE idempotency_key/, (p) => ({ rows: st.driverLedger.filter((l) => l.idempotency_key === p[0]) })],
    [/^INSERT INTO driver_ledger/, (p) => {
      if (p[12] && st.driverLedger.some((l) => l.idempotency_key === p[12])) return { rows: [] };
      const row = { id: `D${++st.seq}`, driver_id: p[0], order_id: p[1], transaction_type: p[2], description: p[3], debit: p[4], credit: p[5],
        balance_after: p[6], currency: p[7], reference_code: p[8], idempotency_key: p[12], reversal_of_id: p[13] };
      st.driverLedger.push(row); return { rows: [row] }; }],
    [/^UPDATE drivers SET current_balance/, (p) => { st.drivers[p[1]].current_balance = p[0]; return { rows: [] }; }],
    [/^SELECT COALESCE\(SUM\(debit\),0\) - COALESCE\(SUM\(credit\),0\) AS net FROM driver_ledger/, (p) => ({
      rows: [{ net: st.driverLedger.filter((l) => l.order_id === p[0] && ['transport_due', 'transport_adjustment', 'transport_reversal'].includes(l.transaction_type))
        .reduce((s, l) => s + N(l.debit) - N(l.credit), 0).toFixed(2) }] })],

    // ── fulfillment ──
    [/^SELECT f\.\*, o\.order_number/, (p) => {
      const f = st.faxes[p[0]]; if (!f) return { rows: [] };
      const o = st.orders[f.order_id]; return { rows: [{ ...f, order_number: o.order_number, customer_id: o.customer_id, order_status: o.status,
        currency: o.currency, delivery_type: o.delivery_type, payment_terms: o.payment_terms, total_amount: o.total_amount,
        shipping_amount: o.shipping_amount, transport_beneficiary: o.transport_beneficiary, transport_mode: o.transport_mode,
        transport_unit: o.transport_unit, accounting_status: o.accounting_status }] }; }],
    [/^SELECT \* FROM order_accounting_postings WHERE order_id = \$1/, (p) => ({ rows: st.postings[p[0]] ? [st.postings[p[0]]] : [] })],
    [/^SELECT oi\.id, oi\.product_id/, (p) => ({ rows: st.items.filter((i) => i.order_id === p[0]).map((i) => ({ ...i, discount: i.discount || 0 })) })],
    [/^INSERT INTO factory_ledger/, (p) => {
      if (!st.factory.some((f) => f.order_id === p[1] && f.transaction_type === 'actual_loading')) st.factory.push({ order_id: p[1], transaction_type: 'actual_loading', quantity: p[3] });
      return { rows: [] }; }],
    [/^UPDATE inventory/, () => ({ rows: [] })],
    [/^SELECT COALESCE\(SUM\(amount_transferred\),0\) AS s FROM payments/, (p) => ({
      rows: [{ s: Object.values(st.payments).filter((x) => x.order_id === p[0] && x.status === 'approved' && x.payment_currency === p[1])
        .reduce((s, x) => s + N(x.amount_transferred), 0).toFixed(2) }] })],
    [/^UPDATE orders SET quantity_loaded/, (p) => { const o = st.orders[p[7]]; Object.assign(o, { final_loaded_quantity: p[0], final_total_amount: p[4], remaining_amount: p[5], paid_amount: p[8], accounting_status: 'POSTED', status: 'LOADED' }); return { rows: [] }; }],
    [/^INSERT INTO order_accounting_postings/, (p) => {
      if (st.postings[p[0]]) return { rows: [] };
      const row = { order_id: p[0], fax_id: p[1], loaded_quantity: p[2], customer_debit: p[3], driver_transport_debit: p[4], trader_transport_amount: p[5], currency: p[8] };
      st.postings[p[0]] = row; return { rows: [row] }; }],
    [/^INSERT INTO order_status_history/, (p) => { st.history.push(p); return { rows: [] }; }],
    [/^INSERT INTO automation_events/, () => ({ rows: [] })],
    [/^INSERT INTO audit_logs/, (p) => { st.audit.push({ user_id: p[0], action: p[1], entity_type: p[2], entity_id: p[3], old_values: p[4], new_values: p[5], reason: p[6] }); return { rows: [] }; }],

    // ── payments ──
    [/^SELECT p\.id, p\.order_id, p\.status, p\.amount_transferred, p\.payment_currency, p\.reference_code,/, (p) => {
      const pay = st.payments[p[0]]; if (!pay) return { rows: [] };
      const o = st.orders[pay.order_id];
      return { rows: [{ ...pay, order_status: o.status, fax_requested: o.fax_requested, delivery_type: o.delivery_type, customer_id: o.customer_id,
        priced_by: o.priced_by, order_number: o.order_number, fax_id: o.fax_id }] }; }],
    [/^UPDATE payments SET status = 'approved'/, (p) => { st.payments[p[1]].status = 'approved'; st.payments[p[1]].reviewed_by = p[0]; return { rows: [] }; }],
    [/^SELECT o\.currency, COALESCE\(o\.final_total_amount/, (p) => {
      const o = st.orders[p[0]];
      const paid = Object.values(st.payments).filter((x) => x.order_id === p[0] && x.status === 'approved' && x.payment_currency === o.currency).reduce((s, x) => s + N(x.amount_transferred), 0);
      return { rows: [{ currency: o.currency, due: o.final_total_amount ?? o.total_amount ?? 0, paid: paid.toFixed(2) }] }; }],
    [/^UPDATE orders SET paid_amount = \$1, remaining_amount = \$2/, (p) => { Object.assign(st.orders[p[2]], { paid_amount: p[0], remaining_amount: p[1] }); return { rows: [] }; }],
    [/^UPDATE orders SET status = 'PAYMENT_APPROVED'/, (p) => { st.orders[p[0]].status = 'PAYMENT_APPROVED'; return { rows: [] }; }],
    [/^SELECT p\.id, p\.order_id, p\.status, p\.reference_code, p\.amount_transferred, p\.payment_currency FROM payments p/, (p) => ({ rows: st.payments[p[0]] ? [st.payments[p[0]]] : [] })],
    [/^SELECT id FROM customer_ledger WHERE idempotency_key = \$1/, (p) => ({ rows: st.ledger.filter((l) => l.idempotency_key === p[0]).map((l) => ({ id: l.id })) })],
    [/^UPDATE payments SET status = 'reversed'/, (p) => { Object.assign(st.payments[p[2]], { status: 'reversed' }); return { rows: [] }; }],
  ];

  const run = async (sql, params = []) => {
    const q = norm(sql);
    calls.push(q.slice(0, 60));
    for (const [re, fn] of handlers) if (re.test(q)) return fn(params);
    throw new Error('استعلام غير مدعوم في القاعدة الوهمية: ' + q.slice(0, 90));
  };
  const pool = { query: run, connect: async () => ({ query: run, release() {} }) };
  return { pool, query: run, get state() { return st; }, calls };
};

module.exports = { makeDb };
