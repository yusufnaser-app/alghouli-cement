'use strict';
const { query } = require('../../config/db');
const engine = require('./accounting.engine');

const fetchEntries = async (customerId, currency) => {
  const params = [customerId];
  let sql = `SELECT cl.id, cl.order_id, cl.transaction_type, cl.debit, cl.credit, cl.balance_after, cl.currency,
                    cl.description, cl.reference_code, cl.created_at, cl.entry_date, cl.seq, cl.source_type, cl.source_id,
                    cl.reversal_of_id, cl.reason, o.order_number
             FROM customer_ledger cl LEFT JOIN orders o ON o.id = cl.order_id
             WHERE cl.customer_id = $1`;
  if (currency) { params.push(engine.assertCurrency(currency)); sql += ` AND cl.currency = $2`; }
  sql += ` ORDER BY cl.entry_date ASC, cl.seq ASC`;
  return (await query(sql, params)).rows;
};

/**
 * كشف حساب العميل — يُحسب بالكامل في Backend (Ledger + Opening Balance).
 * لكل عملة قسم مستقل: افتتاحي، حركات برصيد جارٍ، إجمالي مدين/دائن، ختامي.
 * يُرجَع أيضًا الرصيد المخزّن وحالة المطابقة (لا يُخفى أي فرق).
 */
const buildCustomerStatement = async (customer, { from, to, currency } = {}) => {
  const entries = await fetchEntries(customer.id, currency);
  const statement = engine.buildStatement(entries, { from, to, currency });
  const stored = await query(`SELECT currency, balance FROM customer_balances WHERE customer_id = $1`, [customer.id]);
  const storedMap = {};
  stored.rows.forEach((r) => { storedMap[r.currency] = r.balance; });
  const reconciliation = engine.rebuildAndCompare(entries, storedMap).map((r) => ({
    currency: r.currency, stored_balance: r.stored_balance, calculated_balance: r.calculated_balance,
    difference: r.difference, matches: r.matches,
  }));
  return {
    account_type: 'customer',
    customer: { id: customer.id, full_name: customer.full_name, phone: customer.phone, account_ref: `CUS-${String(customer.id).slice(0, 8).toUpperCase()}` },
    generated_at: new Date().toISOString(),
    ...statement,
    reconciliation,
  };
};

const loadCustomerByUserId = async (userId) => {
  const r = await query(`SELECT c.id, u.full_name, u.phone FROM customers c JOIN users u ON u.id = c.user_id WHERE c.user_id = $1 LIMIT 1`, [userId]);
  return r.rows[0] || null;
};
const loadCustomerById = async (customerId) => {
  const r = await query(`SELECT c.id, u.full_name, u.phone FROM customers c JOIN users u ON u.id = c.user_id WHERE c.id = $1`, [customerId]);
  return r.rows[0] || null;
};

const getCustomerStatementByUserId = async (userId, opts = {}) => {
  const c = await loadCustomerByUserId(userId);
  return c ? buildCustomerStatement(c, opts) : null;
};
const getCustomerStatement = async (customerId, opts = {}) => {
  const c = await loadCustomerById(customerId);
  return c ? buildCustomerStatement(c, opts) : null;
};

const getDriverStatement = async (driverId, { limit = 200, offset = 0 } = {}) => {
  const driver = await query(`SELECT id, full_name, phone, current_balance FROM drivers WHERE id=$1`, [driverId]);
  if (!driver.rows.length) return null;
  const rows = await query(`
    SELECT dl.*, o.order_number FROM driver_ledger dl LEFT JOIN orders o ON o.id=dl.order_id
    WHERE dl.driver_id=$1 ORDER BY dl.created_at DESC LIMIT $2 OFFSET $3`, [driverId, limit, offset]);
  return { account_type: 'driver', driver: driver.rows[0], rows: rows.rows };
};

const getFactoryStatement = async (factoryId, { limit = 200, offset = 0 } = {}) => {
  const factory = await query(`SELECT id, name_ar FROM product_sources WHERE id=$1`, [factoryId]);
  if (!factory.rows.length) return null;
  const rows = await query(`
    SELECT fl.*, o.order_number, f.fax_number FROM factory_ledger fl
    LEFT JOIN orders o ON o.id=fl.order_id LEFT JOIN loading_faxes f ON f.id=fl.fax_id
    WHERE fl.factory_id=$1 ORDER BY fl.created_at DESC LIMIT $2 OFFSET $3`, [factoryId, limit, offset]);
  const total = await query(`SELECT COALESCE(SUM(quantity),0) AS total_quantity FROM factory_ledger WHERE factory_id=$1`, [factoryId]);
  return { account_type: 'factory', factory: factory.rows[0], total_quantity: total.rows[0].total_quantity, rows: rows.rows };
};

// ───────── نسخة الطباعة/PDF — تستهلك نفس بيانات Backend دون إعادة حساب ─────────
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (s) => { const [i, f] = String(s).split('.'); return `${i.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${f || '00'}`; };
const CUR_AR = { YER: 'ريال يمني', USD: 'دولار أمريكي', SAR: 'ريال سعودي' };

const renderStatementHtml = (st) => {
  const sections = st.sections.length ? st.sections : [];
  const body = sections.map((s) => `
    <h3>العملة: ${esc(CUR_AR[s.currency] || s.currency)} (${esc(s.currency)})</h3>
    <table><thead><tr><th>التاريخ</th><th>البيان</th><th>المرجع</th><th>مدين</th><th>دائن</th><th>الرصيد</th></tr></thead><tbody>
      <tr class="open"><td></td><td>الرصيد الافتتاحي</td><td></td><td></td><td></td><td>${fmt(s.opening_balance)}</td></tr>
      ${s.rows.map((r) => `<tr class="${r.is_reversal ? 'rev' : ''}"><td>${esc(String(r.date).slice(0, 10))}</td><td>${esc(r.description)}${r.reason ? ` — ${esc(r.reason)}` : ''}</td><td>${esc(r.reference || r.order_number || '')}</td><td>${r.debit === '0.00' ? '' : fmt(r.debit)}</td><td>${r.credit === '0.00' ? '' : fmt(r.credit)}</td><td>${fmt(r.balance)}</td></tr>`).join('')}
      <tr class="tot"><td colspan="3">الإجمالي</td><td>${fmt(s.total_debit)}</td><td>${fmt(s.total_credit)}</td><td></td></tr>
      <tr class="close"><td colspan="5">الرصيد الختامي (${esc(s.closing_side)})</td><td>${fmt(s.closing_balance)}</td></tr>
    </tbody></table>`).join('') || '<p>لا توجد حركات.</p>';
  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>كشف حساب</title><style>
  body{font-family:Tahoma,Arial,sans-serif;margin:24px;color:#111}
  .hd{display:flex;align-items:center;gap:14px;border-bottom:3px solid #1b5e20;padding-bottom:10px;margin-bottom:12px}
  .logo{width:56px;height:56px;border-radius:50%;background:#1b5e20;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:22px}
  table{width:100%;border-collapse:collapse;margin:8px 0 18px;font-size:13px}th,td{border:1px solid #bbb;padding:5px 7px;text-align:right}
  th{background:#eef3ee}.open td,.close td{font-weight:bold;background:#f6f6f6}.tot td{font-weight:bold}.rev td{color:#a00}
  @media print{body{margin:8mm}}</style></head><body>
  <div class="hd"><div class="logo">غ</div><div><b>مؤسسة الغولي لتجارة وتسويق الأسمنت</b><br>كشف حساب عميل</div></div>
  <p>العميل: <b>${esc(st.customer.full_name)}</b> — رقم الحساب: <b>${esc(st.customer.account_ref)}</b><br>
  الفترة: ${esc(st.period.from || 'من البداية')} → ${esc(st.period.to || 'حتى اليوم')} — تاريخ الإصدار: ${esc(String(st.generated_at).slice(0, 10))}</p>
  ${body}
  ${st.reconciliation.some((r) => !r.matches) ? '<p style="color:#a00"><b>تنبيه:</b> يوجد فرق بين الرصيد المخزّن والدفتر في بعض العملات — راجع فحص سلامة الحسابات.</p>' : ''}
  <script>window.addEventListener('load',function(){if(location.search.indexOf('autoprint=1')>-1)window.print()})</script>
  </body></html>`;
};

module.exports = {
  getCustomerStatementByUserId, getCustomerStatement, getDriverStatement, getFactoryStatement,
  buildCustomerStatement, renderStatementHtml,
};
