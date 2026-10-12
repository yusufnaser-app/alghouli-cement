'use strict';
/**
 * محمّلات المستندات (F3): كل دالة تُرجع نموذج مستند لـ document-renderer، وتفحص الصلاحية/الملكية.
 * ctx = { userId, userName, roles:[], perms:Set }  — يبنيه المتحكم من الجلسة.
 * لا كتابة مالية هنا: قراءة فقط (+ تدقيق best-effort لإصدار المستند).
 */
const { query } = require('../../config/db');
const { lookupOfficialReference } = require('./official-reference');
const { CURRENCY_AR } = require('./document-renderer');

const fail = (message, status, code) => { const e = new Error(message); e.status = status; e.code = code; return e; };
const forbid = () => fail('ممنوع: لا تملك صلاحية هذا المستند', 403, 'FORBIDDEN');
const has = (ctx, ...perms) => ctx.perms.has('*') || perms.some((p) => ctx.perms.has(p));
const isOps = (ctx) => has(ctx, 'reports.view') || ctx.roles.includes('sales');
const isMoney = (ctx) => has(ctx, 'ledger.view', 'statements.view', 'statements.export');

const short = (id) => String(id || '').slice(0, 8);
const stamp = (d = new Date()) => new Date(d.getTime() + 3 * 3600 * 1000).toISOString().replace(/[-:T]/g, '').slice(0, 12); // yyyymmddHHmm
const ymd = (d = new Date()) => stamp(d).slice(0, 8);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const REPORT_LIMIT = 2000;

const getCompany = async () => {
  const r = await query(`SELECT key, value FROM settings WHERE key IN ('company_name','company_phone')`);
  const m = {}; r.rows.forEach((x) => { m[x.key] = x.value; });
  return { name: m.company_name || 'مؤسسة الغولي', phone: m.company_phone || '' };
};

const base = async (ctx, { type, title, docNumber, subtitle, meta, blocks, signatures, accountingReference }) => ({
  type, title, docNumber, issuedAt: new Date(), issuedBy: ctx.userName || '—', subtitle, meta, blocks, signatures,
  accountingReference: accountingReference || null, company: await getCompany(),
});

// ───────────── الطلبات ─────────────
const loadOrder = async (ctx, orderId) => {
  const r = await query(
    `SELECT o.id, o.order_number, o.status, o.created_at, o.currency, o.payment_terms, o.delivery_type,
            o.subtotal, o.discount_amount, o.shipping_amount, o.total_amount, o.paid_amount, o.remaining_amount,
            o.transport_beneficiary, o.trader_truck_plate,
            c.id AS customer_id, c.user_id AS customer_user_id, u.full_name AS customer_name, u.phone AS customer_phone,
            a.governorate, a.area, a.address_text
     FROM orders o JOIN customers c ON c.id = o.customer_id JOIN users u ON u.id = c.user_id
     LEFT JOIN customer_addresses a ON a.id = o.address_id
     WHERE o.id = $1`, [orderId]);
  if (!r.rows.length) throw fail('الطلب غير موجود', 404, 'NOT_FOUND');
  const o = r.rows[0];
  if (!(isOps(ctx) || isMoney(ctx) || o.customer_user_id === ctx.userId)) throw forbid();
  const items = await query(
    `SELECT p.name_ar AS product_name, oi.quantity, oi.unit, oi.unit_price, oi.discount, oi.line_total, ps.name_ar AS factory_name
     FROM order_items oi JOIN products p ON p.id = oi.product_id LEFT JOIN product_sources ps ON ps.id = oi.source_id
     WHERE oi.order_id = $1 ORDER BY oi.id`, [orderId]);
  return { order: o, items: items.rows };
};

const addressOf = (o) => [o.governorate, o.area, o.address_text].filter(Boolean).join(' — ') || 'استلام ذاتي / غير محدد';
const DELIVERY_AR = { alghouli_delivery: 'توصيل المؤسسة', trader_pickup: 'استلام التاجر بسائقه', pickup: 'استلام ذاتي' };
const unitAr = (u) => (u === 'ton' ? 'طن' : 'كيس');

/** طلب شراء: ما طلبه العميل (كميات وأصناف ومصنع وعنوان) — بلا أسعار. */
const orderPurchaseRequest = async (ctx, orderId) => {
  const { order: o, items } = await loadOrder(ctx, orderId);
  return base(ctx, {
    type: 'order_purchase_request', title: 'طلب شراء', docNumber: `PR-${o.order_number}`,
    meta: [['العميل', o.customer_name], ['الهاتف', o.customer_phone], ['رقم الطلب', o.order_number],
      ['تاريخ الطلب', null], ['حالة الطلب', o.status], ['طريقة التسليم', DELIVERY_AR[o.delivery_type] || o.delivery_type],
      ['عنوان التسليم', addressOf(o)], ['لوحة قاطرة التاجر', o.trader_truck_plate]],
    blocks: [{ kind: 'table', title: 'الأصناف المطلوبة',
      columns: [{ key: 'i', label: '#', align: 'center' }, { key: 'product_name', label: 'الصنف' }, { key: 'factory_name', label: 'المصنع' },
        { key: 'quantity', label: 'الكمية', fmt: 'qty' }, { key: 'unit', label: 'الوحدة', align: 'center' }],
      rows: items.map((it, i) => ({ ...it, i: i + 1, unit: unitAr(it.unit) })) },
    { kind: 'note', text: 'هذا طلب شراء وليس مستندًا ماليًا. القيمة تُحدَّد بعد التسعير وتظهر في إشعار قيمة الطلب.' }],
    signatures: ['العميل', 'مسؤول المبيعات'],
  }).then((d) => { d.meta = d.meta.map(([l, v]) => (l === 'تاريخ الطلب' ? [l, require('./document-renderer').fmtDateTime(o.created_at)] : [l, v])); return d; });
};

/**
 * إشعار قيمة الطلب. يصير «فاتورة» فقط إن وُجد مرجع YemenSoft بحالة SYNCED (المصيّر يفرض ذلك).
 */
const orderValueNotice = async (ctx, orderId) => {
  const { order: o, items } = await loadOrder(ctx, orderId);
  if (o.total_amount === null || o.total_amount === undefined || items.some((i) => i.unit_price === null || i.unit_price === undefined)) {
    throw fail('الطلب غير مسعّر بعد — لا يوجد إشعار قيمة', 409, 'ORDER_NOT_PRICED');
  }
  const ref = await lookupOfficialReference(['invoice', 'order'], [orderId]);
  const official = !!ref;
  const { fmtDateTime } = require('./document-renderer');
  const doc = await base(ctx, {
    type: 'order_value_notice', title: official ? 'فاتورة' : 'إشعار قيمة الطلب', docNumber: `VN-${o.order_number}`,
    accountingReference: ref,
    meta: [['العميل', o.customer_name], ['الهاتف', o.customer_phone], ['رقم الطلب', o.order_number],
      ['تاريخ الطلب', fmtDateTime(o.created_at)], ['العنوان', addressOf(o)], ['العملة', CURRENCY_AR[o.currency] || o.currency],
      ['شروط الدفع', o.payment_terms]],
    blocks: [{ kind: 'table', title: 'الأصناف والقيمة',
      columns: [{ key: 'i', label: '#', align: 'center' }, { key: 'product_name', label: 'الصنف' }, { key: 'quantity', label: 'الكمية', fmt: 'qty' },
        { key: 'unit', label: 'الوحدة', align: 'center' }, { key: 'unit_price', label: 'السعر', fmt: 'money' },
        { key: 'discount', label: 'الخصم', fmt: 'money' }, { key: 'line_total', label: 'الإجمالي', fmt: 'money' }],
      rows: items.map((it, k) => ({ ...it, i: k + 1, unit: unitAr(it.unit) })),
      totals: [['المجموع الفرعي', o.subtotal], ['الخصم', o.discount_amount], ['النقل', o.shipping_amount],
        ['المدفوع', o.paid_amount], ['المتبقي', o.remaining_amount], ['الإجمالي المستحق', o.total_amount]] },
    official ? { kind: 'note', text: 'المرجع المحاسبي أعلاه صادر من النظام المحاسبي المعتمد (YemenSoft).' }
      : { kind: 'note', tone: 'warn', text: 'هذا إشعار بقيمة الطلب صادر من نظام المؤسسة وليس فاتورة رسمية. الفاتورة الرسمية مرجعها النظام المحاسبي (YemenSoft) وتُصدَر عند ترحيلها.' }],
    signatures: ['المحاسب', 'العميل'],
  });
  return doc;
};

// ───────────── الفواكس ─────────────
const loadFax = async (ctx, faxId) => {
  const r = await query(
    `SELECT f.id, f.fax_number, f.status, f.requested_quantity, f.approved_quantity, f.loaded_quantity,
            f.requested_at, f.approved_at, f.issued_at, f.used_at, f.delivered_at,
            f.delivery_governorate, f.delivery_area, f.delivery_address, f.is_managed_by_institution, f.route, f.order_id,
            d.full_name AS driver_name, d.user_id AS driver_user_id, COALESCE(d.phone, du.phone) AS driver_phone,
            v.plate_number, ps.name_ar AS factory_name, o.order_number, cu.user_id AS customer_user_id
     FROM loading_faxes f
     LEFT JOIN drivers d ON d.id = f.driver_id LEFT JOIN users du ON du.id = d.user_id
     LEFT JOIN vehicles v ON v.id = f.vehicle_id LEFT JOIN product_sources ps ON ps.id = f.factory_id
     LEFT JOIN orders o ON o.id = f.order_id LEFT JOIN customers cu ON cu.id = o.customer_id
     WHERE f.id = $1`, [faxId]);
  if (!r.rows.length) throw fail('الفاكس غير موجود', 404, 'NOT_FOUND');
  const f = r.rows[0];
  if (!(isOps(ctx) || f.driver_user_id === ctx.userId || (f.customer_user_id && f.customer_user_id === ctx.userId))) throw forbid();
  const dests = await query(
    `SELECT d.destination_type, d.label, d.governorate, d.area, d.address_text, d.quantity, d.unit, d.status,
            d.delivered_at, ub.full_name AS delivered_by_name, d.contact_name, d.contact_phone
     FROM delivery_destinations d LEFT JOIN users ub ON ub.id = d.delivered_by
     WHERE d.fax_id = $1 AND d.status <> 'CANCELLED' ORDER BY d.sort_order, d.created_at`, [faxId]);
  return { fax: f, dests: dests.rows };
};
const faxNo = (f) => f.fax_number || short(f.id);
const DEST_STATUS_AR = { PENDING: 'بانتظار التسليم', DELIVERED: 'تم التسليم' };
const DEST_TYPE_AR = { trader: 'تاجر', warehouse: 'مستودع' };
const bagsOf = (q, u) => (q === null || q === undefined ? null : String(Number(q) * (u === 'ton' ? 20 : 1)));
const destRows = (dests) => dests.map((d, i) => ({ ...d, i: i + 1, type_ar: DEST_TYPE_AR[d.destination_type] || d.destination_type,
  place: [d.governorate, d.area, d.address_text].filter(Boolean).join(' — '), unit_ar: unitAr(d.unit), status_ar: DEST_STATUS_AR[d.status] || d.status }));
const faxMeta = (f) => [['رقم الفاكس', faxNo(f)], ['الحالة', f.status], ['المصنع', f.factory_name], ['السائق', f.driver_name],
  ['هاتف السائق', f.driver_phone], ['القاطرة', f.plate_number], ['رقم الطلب', f.order_number],
  ['نوع الفاكس', f.is_managed_by_institution === false ? 'فاكس تاجر' : 'فاكس مؤسسة']];

const faxDocument = async (ctx, faxId) => {
  const { fax: f, dests } = await loadFax(ctx, faxId);
  const { fmtDateTime } = require('./document-renderer');
  return base(ctx, {
    type: 'fax', title: 'فاكس تحميل', docNumber: faxNo(f),
    meta: [...faxMeta(f), ['الكمية المطلوبة (كيس)', f.requested_quantity], ['الكمية المعتمدة (كيس)', f.approved_quantity],
      ['تاريخ الطلب', fmtDateTime(f.requested_at)], ['تاريخ الإصدار', fmtDateTime(f.issued_at)], ['خط السير', f.route],
      ['محافظة التسليم', f.delivery_governorate]],
    blocks: [{ kind: 'table', title: 'وجهات التسليم',
      columns: [{ key: 'i', label: '#', align: 'center' }, { key: 'type_ar', label: 'النوع' }, { key: 'label', label: 'الجهة' },
        { key: 'place', label: 'المكان' }, { key: 'quantity', label: 'الكمية', fmt: 'qty' }, { key: 'unit_ar', label: 'الوحدة', align: 'center' }],
      rows: destRows(dests), emptyText: 'لم تُحدَّد الوجهات بعد' }],
    signatures: ['مسؤول المصنع', 'السائق', 'المحاسب'],
  });
};

const LOADED = ['USED', 'READY_FOR_TRANSIT', 'DELIVERED'];
const loadingDocument = async (ctx, faxId) => {
  const { fax: f } = await loadFax(ctx, faxId);
  if (!LOADED.includes(f.status)) throw fail('لم يُسجَّل التحميل لهذا الفاكس بعد', 409, 'FAX_NOT_LOADED');
  const { fmtDateTime } = require('./document-renderer');
  const loaded = f.loaded_quantity ?? f.approved_quantity ?? f.requested_quantity;
  return base(ctx, {
    type: 'loading_document', title: 'مستند التحميل', docNumber: `LD-${faxNo(f)}`,
    meta: [...faxMeta(f), ['وقت التحميل', fmtDateTime(f.used_at)]],
    blocks: [{ kind: 'kv', title: 'الكمية المحمَّلة', rows: [['بالأكياس', String(loaded)], ['بالأطنان', String(Number(loaded) / 20)],
      ['الكمية المعتمدة (كيس)', f.approved_quantity === null ? '—' : String(f.approved_quantity)]] },
    { kind: 'note', text: 'الطن = 20 كيسًا. هذه الكمية هي أساس الترحيل المحاسبي عند التحميل.' }],
    signatures: ['مسؤول المصنع', 'السائق'],
  });
};

const deliveryDocument = async (ctx, faxId) => {
  const { fax: f, dests } = await loadFax(ctx, faxId);
  if (!dests.length) throw fail('لا توجد وجهات تسليم لهذا الفاكس', 409, 'NO_DESTINATIONS');
  const { fmtDateTime } = require('./document-renderer');
  const done = dests.filter((d) => d.status === 'DELIVERED').length;
  return base(ctx, {
    type: 'delivery_document', title: 'مستند التسليم', docNumber: `DL-${faxNo(f)}`,
    meta: [...faxMeta(f), ['وقت إغلاق الفاكس', fmtDateTime(f.delivered_at)], ['الوجهات المُسلَّمة', `${done} من ${dests.length}`]],
    blocks: [{ kind: 'table', title: 'حالة التسليم لكل وجهة',
      columns: [{ key: 'i', label: '#', align: 'center' }, { key: 'label', label: 'الجهة' }, { key: 'place', label: 'المكان' },
        { key: 'quantity', label: 'الكمية', fmt: 'qty' }, { key: 'unit_ar', label: 'الوحدة', align: 'center' },
        { key: 'status_ar', label: 'الحالة' }, { key: 'delivered_at', label: 'وقت التسليم', fmt: 'datetime' }, { key: 'delivered_by_name', label: 'سلّمها' }],
      rows: destRows(dests) }],
    signatures: ['المستلم', 'السائق'],
  });
};

// ───────────── كشوف الحساب ─────────────
const STATEMENT_NOTE = 'الرصيد المحاسبي الرسمي مرجعه النظام المحاسبي المعتمد.';

const customerStatement = async (ctx, customerId, { from, to, currency } = {}) => {
  const statements = require('../accounting/accounting-statements.service');
  const ledger = require('../customers/ledger.service');
  const c = await query(`SELECT c.id, c.user_id, u.full_name, u.phone FROM customers c JOIN users u ON u.id = c.user_id WHERE c.id = $1`, [customerId]);
  if (!c.rows.length) throw fail('العميل غير موجود', 404, 'NOT_FOUND');
  const cust = c.rows[0];
  if (!(has(ctx, 'statements.export', 'statements.view') || (has(ctx, 'statements.view_own') && cust.user_id === ctx.userId))) throw forbid();
  const st = await statements.buildCustomerStatement(cust, { from, to, currency });
  const sum = await ledger.getSummary(customerId);

  const blocks = [];
  for (const s of st.sections) {
    const rows = [{ date: null, description: 'الرصيد الافتتاحي', reference: '', debit: '', credit: '', balance: s.opening_balance, _class: 'open' },
      ...s.rows.map((r) => ({ date: r.date, description: r.reason ? `${r.description} — ${r.reason}` : r.description,
        reference: r.reference || r.order_number || '', debit: r.debit === '0.00' ? '' : r.debit, credit: r.credit === '0.00' ? '' : r.credit,
        balance: r.balance, _class: r.is_reversal ? 'rev' : '' })),
      { date: null, description: 'الإجمالي', reference: '', debit: s.total_debit, credit: s.total_credit, balance: '', _class: 'sum' },
      { date: null, description: `الرصيد الحالي (${s.closing_side})`, reference: '', debit: '', credit: '', balance: s.closing_balance, _class: 'close' }];
    blocks.push({ kind: 'table', title: `العملة: ${CURRENCY_AR[s.currency] || s.currency} (${s.currency})`,
      columns: [{ key: 'date', label: 'التاريخ', fmt: 'date', align: 'center' }, { key: 'description', label: 'البيان' }, { key: 'reference', label: 'المرجع' },
        { key: 'debit', label: 'مدين', fmt: 'money' }, { key: 'credit', label: 'دائن', fmt: 'money' }, { key: 'balance', label: 'الرصيد', fmt: 'money' }], rows });
    const b = sum.balances[s.currency];
    if (b && b.sales !== undefined) {
      blocks.push({ kind: 'kv', title: `ملخص ${s.currency}`, rows: [['الرصيد الافتتاحي', b.opening_balance], ['المبيعات', b.sales], ['أجور النقل', b.transport_fees],
        ['الخصومات (ضمن المبيعات)', b.discounts], ['المدفوعات', b.payments], ['التسويات', b.adjustments], ['الرصيد الحالي', `${b.balance} (${b.side})`]] });
    }
  }
  if (!st.sections.length) blocks.push({ kind: 'note', text: 'لا توجد حركات في الفترة المطلوبة.' });
  blocks.push({ kind: 'kv', title: 'الائتمان', rows: [['حد الائتمان', sum.has_limit ? sum.credit_limit : 'بلا حد'],
    ['المتاح', sum.available_credit === null ? '—' : sum.available_credit], ['حالة الحساب', sum.account_status]] });
  if (st.reconciliation && st.reconciliation.some((r) => !r.matches)) {
    blocks.push({ kind: 'note', tone: 'warn', text: 'تنبيه: فرق بين الرصيد المخزَّن والدفتر في بعض العملات — راجع فحص سلامة الحسابات.' });
  }
  blocks.push({ kind: 'note', text: STATEMENT_NOTE });
  return base(ctx, {
    type: 'customer_statement', title: 'كشف حساب عميل', docNumber: `STC-${short(customerId)}-${ymd()}`,
    meta: [['العميل', cust.full_name], ['الهاتف', cust.phone], ['رقم الحساب', st.customer && st.customer.account_ref],
      ['الفترة', `${(st.period && st.period.from) || 'من البداية'} → ${(st.period && st.period.to) || 'حتى اليوم'}`]],
    blocks, signatures: ['المحاسب'],
  });
};

const driverStatement = async (ctx, driverId) => {
  const driverLedger = require('../drivers/driver-ledger.service');
  const dr = await query(`SELECT d.id, d.full_name, d.user_id FROM drivers d WHERE d.id = $1`, [driverId]);
  if (!dr.rows.length) throw fail('السائق غير موجود', 404, 'DRIVER_NOT_FOUND');
  if (!(has(ctx, 'ledger.view') || dr.rows[0].user_id === ctx.userId)) throw forbid();
  const s = await driverLedger.getAccountSummary(driverId);          // يرفض سائق التاجر 422 NOT_INSTITUTION_DRIVER
  const rows = await query(
    `SELECT COALESCE(dl.entry_date, dl.created_at) AS entry_at, dl.description, dl.reference_code, dl.debit, dl.credit, dl.balance_after,
            dl.transaction_type, dl.reversal_of_id, o.order_number
     FROM driver_ledger dl LEFT JOIN orders o ON o.id = dl.order_id
     WHERE dl.driver_id = $1 ORDER BY COALESCE(dl.entry_date, dl.created_at) ASC, dl.created_at ASC LIMIT $2`, [driverId, REPORT_LIMIT]);
  const side = { owed_to_driver: 'مستحق للسائق', owed_by_driver: 'على السائق للمؤسسة', none: '—', settled: 'مسوّى' };
  return base(ctx, {
    type: 'driver_statement', title: 'كشف حساب سائق', docNumber: `STD-${short(driverId)}-${ymd()}`,
    meta: [['السائق', s.driver.full_name], ['الهاتف', s.driver.phone], ['نوع الحساب', 'سائق مؤسسة'], ['العملة', 'ريال يمني']],
    blocks: [
      { kind: 'kv', title: 'ملخص الحساب', rows: [['الرصيد الافتتاحي', `${s.opening_balance} (${side[s.opening_side]})`], ['أجور النقل', s.transport_due],
        ['عدد الرحلات المُسلَّمة', String(s.trips)], ['رحلات جارية', String(s.trips_in_progress)], ['السلف', s.advances],
        ['المدفوعات', s.payments], ['الخصومات', s.deductions], ['الرصيد المستحق', `${s.outstanding_balance} (${side[s.outstanding_side]})`]] },
      { kind: 'table', title: 'الحركات',
        columns: [{ key: 'entry_at', label: 'التاريخ', fmt: 'date', align: 'center' }, { key: 'description', label: 'البيان' }, { key: 'ref', label: 'المرجع' },
          { key: 'debit', label: 'مستحق للسائق', fmt: 'money' }, { key: 'credit', label: 'مدفوع/مخصوم', fmt: 'money' }, { key: 'balance_after', label: 'الرصيد', fmt: 'money' }],
        rows: rows.rows.map((r) => ({ ...r, ref: r.reference_code || r.order_number || '', debit: r.debit === '0.00' ? '' : r.debit,
          credit: r.credit === '0.00' ? '' : r.credit, _class: r.reversal_of_id ? 'rev' : '' })),
        emptyText: 'لا توجد حركات' },
      { kind: 'note', text: 'الرصيد الموجب مستحق للسائق على المؤسسة. هذا الحساب لسائق المؤسسة فقط؛ سائق التاجر حسابه عند تاجره.' },
      ...(s.reconciled ? [] : [{ kind: 'note', tone: 'warn', text: 'تنبيه: رصيد السائق المخزَّن لا يطابق مجموع الدفتر — راجع فحص السلامة.' }])],
    signatures: ['المحاسب', 'السائق'],
  });
};

// ───────────── إيصال الدفع ─────────────
const paymentReceipt = async (ctx, paymentId) => {
  const r = await query(
    `SELECT p.id, p.reference_code, p.amount_due, p.amount_transferred, p.transfer_date, p.transaction_ref, p.status, p.reviewed_at,
            p.payment_currency, pm.name_ar AS method_name, o.order_number, o.currency AS order_currency,
            c.user_id AS customer_user_id, u.full_name AS customer_name, u.phone AS customer_phone, ru.full_name AS reviewed_by_name
     FROM payments p JOIN orders o ON o.id = p.order_id JOIN customers c ON c.id = o.customer_id JOIN users u ON u.id = c.user_id
     LEFT JOIN payment_methods pm ON pm.id = p.method_id LEFT JOIN users ru ON ru.id = p.reviewed_by
     WHERE p.id = $1`, [paymentId]);
  if (!r.rows.length) throw fail('الدفعة غير موجودة', 404, 'NOT_FOUND');
  const p = r.rows[0];
  if (!(has(ctx, 'payments.view', 'statements.view', 'statements.export') || p.customer_user_id === ctx.userId)) throw forbid();
  if (p.status !== 'approved') throw fail('لا يُصدَر إيصال إلا لدفعة معتمدة', 409, 'PAYMENT_NOT_APPROVED');
  const cur = p.payment_currency || p.order_currency || 'YER';
  const { fmtDateTime, fmtDate } = require('./document-renderer');
  return base(ctx, {
    type: 'payment_receipt', title: 'إيصال دفع', docNumber: `RCP-${p.reference_code}`,
    meta: [['العميل', p.customer_name], ['الهاتف', p.customer_phone], ['رقم الطلب', p.order_number], ['رقم الدفعة', p.reference_code],
      ['طريقة الدفع', p.method_name], ['تاريخ التحويل', fmtDate(p.transfer_date)], ['مرجع العملية', p.transaction_ref],
      ['اعتمدها', p.reviewed_by_name], ['وقت الاعتماد', fmtDateTime(p.reviewed_at)], ['العملة', CURRENCY_AR[cur] || cur]],
    blocks: [{ kind: 'kv', title: 'المبلغ', rows: [['المبلغ المستحق', p.amount_due], ['المبلغ المحوَّل المعتمد', p.amount_transferred]] },
      { kind: 'note', text: 'إيصال تشغيلي يؤكد اعتماد الدفعة في نظام المؤسسة، وليس مستندًا ماليًا رسميًا.' }],
    signatures: ['المحاسب', 'العميل'],
  });
};

// ───────────── التقارير ─────────────
const parseRange = ({ from, to } = {}) => {
  const today = new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
  const f = from || new Date(Date.now() + 3 * 3600 * 1000 - 29 * 86400000).toISOString().slice(0, 10);
  const t = to || today;
  if (!DATE_RE.test(f) || !DATE_RE.test(t) || f > t) throw fail('نطاق التاريخ غير صالح (YYYY-MM-DD، من ≤ إلى)', 400, 'INVALID_RANGE');
  return { from: f, to: t };
};
const limitNote = (n) => (n >= REPORT_LIMIT ? [{ kind: 'note', tone: 'warn', text: `تم عرض أول ${REPORT_LIMIT} سجلًا فقط — ضيّق نطاق التاريخ.` }] : []);
const sumBy = (rows, key, curKey) => {
  const m = {};
  rows.forEach((r) => { const c = r[curKey] || 'YER'; m[c] = (m[c] || 0) + Math.round(parseFloat(r[key] || 0) * 100); });
  return Object.entries(m).map(([c, v]) => [`إجمالي ${c}`, (v / 100).toFixed(2)]);
};

const REPORTS = {
  payments: { title: 'تقرير المدفوعات', perms: ['payments.view', 'statements.view', 'statements.export'], async build(rg) {
    const r = await query(
      `SELECT p.reference_code, p.transfer_date, p.status, p.amount_transferred, COALESCE(p.payment_currency, o.currency, 'YER') AS currency,
              o.order_number, u.full_name AS customer_name, pm.name_ar AS method_name
       FROM payments p JOIN orders o ON o.id = p.order_id JOIN customers c ON c.id = o.customer_id JOIN users u ON u.id = c.user_id
       LEFT JOIN payment_methods pm ON pm.id = p.method_id
       WHERE p.transfer_date BETWEEN $1 AND $2 ORDER BY p.transfer_date DESC, p.created_at DESC LIMIT $3`, [rg.from, rg.to, REPORT_LIMIT]);
    const approved = r.rows.filter((x) => x.status === 'approved');
    return [{ kind: 'table', columns: [{ key: 'reference_code', label: 'رقم الدفعة' }, { key: 'transfer_date', label: 'التاريخ', fmt: 'date', align: 'center' },
      { key: 'customer_name', label: 'العميل' }, { key: 'order_number', label: 'الطلب' }, { key: 'method_name', label: 'الطريقة' },
      { key: 'status', label: 'الحالة', align: 'center' }, { key: 'currency', label: 'العملة', align: 'center' }, { key: 'amount_transferred', label: 'المبلغ', fmt: 'money' }],
      rows: r.rows, totals: sumBy(approved, 'amount_transferred', 'currency') }, { kind: 'note', text: 'الإجماليات تشمل الدفعات المعتمدة فقط.' }, ...limitNote(r.rows.length)];
  } },
  transport: { title: 'تقرير النقل', perms: ['ledger.view', 'reports.view'], async build(rg) {
    const r = await query(
      `SELECT COALESCE(dl.entry_date, dl.created_at) AS entry_at, d.full_name AS driver_name, o.order_number, dl.transaction_type, dl.description,
              (dl.debit - dl.credit) AS amount
       FROM driver_ledger dl JOIN drivers d ON d.id = dl.driver_id LEFT JOIN orders o ON o.id = dl.order_id
       WHERE dl.transaction_type IN ('transport_due','transport_adjustment','transport_reversal')
         AND COALESCE(dl.entry_date, dl.created_at) >= $1::date AND COALESCE(dl.entry_date, dl.created_at) < ($2::date + 1)
       ORDER BY COALESCE(dl.entry_date, dl.created_at) DESC LIMIT $3`, [rg.from, rg.to, REPORT_LIMIT]);
    return [{ kind: 'table', columns: [{ key: 'entry_at', label: 'التاريخ', fmt: 'date', align: 'center' }, { key: 'driver_name', label: 'السائق' }, { key: 'order_number', label: 'الطلب' },
      { key: 'description', label: 'البيان' }, { key: 'amount', label: 'أجرة النقل (ريال)', fmt: 'money' }],
      rows: r.rows, totals: sumBy(r.rows, 'amount', '_') }, ...limitNote(r.rows.length)];
  } },
  trips: { title: 'تقرير الرحلات', perms: ['reports.view'], async build(rg) {
    const r = await query(
      `SELECT f.fax_number, f.status, f.requested_at, d.full_name AS driver_name, v.plate_number, ps.name_ar AS factory_name,
              COALESCE(f.loaded_quantity, f.approved_quantity, f.requested_quantity) AS quantity, f.route,
              (SELECT COUNT(*) FROM delivery_destinations x WHERE x.fax_id = f.id AND x.status <> 'CANCELLED')::int AS dests
       FROM loading_faxes f LEFT JOIN drivers d ON d.id = f.driver_id LEFT JOIN vehicles v ON v.id = f.vehicle_id LEFT JOIN product_sources ps ON ps.id = f.factory_id
       WHERE f.status <> 'CANCELLED' AND COALESCE(f.is_managed_by_institution, TRUE) = TRUE
         AND f.requested_at >= $1::date AND f.requested_at < ($2::date + 1)
       ORDER BY f.requested_at DESC LIMIT $3`, [rg.from, rg.to, REPORT_LIMIT]);
    return [{ kind: 'table', columns: [{ key: 'fax_number', label: 'الفاكس' }, { key: 'requested_at', label: 'التاريخ', fmt: 'date', align: 'center' }, { key: 'driver_name', label: 'السائق' },
      { key: 'plate_number', label: 'القاطرة' }, { key: 'factory_name', label: 'المصنع' }, { key: 'quantity', label: 'الكمية (كيس)', fmt: 'qty' },
      { key: 'dests', label: 'الوجهات', align: 'center' }, { key: 'route', label: 'خط السير' }, { key: 'status', label: 'الحالة', align: 'center' }],
      rows: r.rows, totals: [['عدد الرحلات', { text: String(r.rows.length) }]] }, { kind: 'note', text: 'رحلات المؤسسة فقط (فواكس التجار خارج هذا التقرير).' }, ...limitNote(r.rows.length)];
  } },
  destinations: { title: 'تقرير الوجهات', perms: ['reports.view'], async build(rg) {
    const r = await query(
      `SELECT f.fax_number, x.destination_type, x.label, x.governorate, x.quantity, x.unit, x.status, x.delivered_at
       FROM delivery_destinations x JOIN loading_faxes f ON f.id = x.fax_id
       WHERE x.status <> 'CANCELLED' AND x.created_at >= $1::date AND x.created_at < ($2::date + 1)
       ORDER BY x.created_at DESC LIMIT $3`, [rg.from, rg.to, REPORT_LIMIT]);
    const rows = r.rows.map((x) => ({ ...x, type_ar: DEST_TYPE_AR[x.destination_type] || x.destination_type, unit_ar: unitAr(x.unit), status_ar: DEST_STATUS_AR[x.status] || x.status }));
    return [{ kind: 'table', columns: [{ key: 'fax_number', label: 'الفاكس' }, { key: 'type_ar', label: 'النوع' }, { key: 'label', label: 'الجهة' }, { key: 'governorate', label: 'المحافظة' },
      { key: 'quantity', label: 'الكمية', fmt: 'qty' }, { key: 'unit_ar', label: 'الوحدة', align: 'center' }, { key: 'status_ar', label: 'الحالة' }, { key: 'delivered_at', label: 'وقت التسليم', fmt: 'datetime' }],
      rows, totals: [['عدد الوجهات', { text: String(rows.length) }]] }, ...limitNote(rows.length)];
  } },
  warehouses: { title: 'تقرير المستودعات', perms: ['reports.view'], async build(rg) {
    const r = await query(
      `SELECT w.code, w.name_ar, w.governorate, w.status,
              COALESCE(SUM(CASE WHEN x.status = 'DELIVERED' THEN x.quantity * CASE WHEN x.unit = 'ton' THEN 20 ELSE 1 END END), 0) AS delivered_bags,
              COALESCE(SUM(CASE WHEN x.status = 'PENDING' THEN x.quantity * CASE WHEN x.unit = 'ton' THEN 20 ELSE 1 END END), 0) AS pending_bags,
              COUNT(x.id)::int AS dests
       FROM institution_warehouses w
       LEFT JOIN delivery_destinations x ON x.warehouse_id = w.id AND x.status <> 'CANCELLED'
         AND x.created_at >= $1::date AND x.created_at < ($2::date + 1)
       GROUP BY w.id ORDER BY w.name_ar`, [rg.from, rg.to]);
    return [{ kind: 'table', columns: [{ key: 'code', label: 'الرمز' }, { key: 'name_ar', label: 'المستودع' }, { key: 'governorate', label: 'المحافظة' }, { key: 'status', label: 'الحالة', align: 'center' },
      { key: 'dests', label: 'الوجهات', align: 'center' }, { key: 'delivered_bags', label: 'مُسلَّم (كيس)', fmt: 'qty' }, { key: 'pending_bags', label: 'بانتظار (كيس)', fmt: 'qty' }], rows: r.rows },
    { kind: 'note', text: 'الكميات الواردة إلى المستودعات خلال الفترة من وجهات الفواكس (الطن = 20 كيسًا).' }];
  } },
  orders: { title: 'تقرير الطلبات', perms: ['reports.view'], async build(rg) {
    const r = await query(
      `SELECT o.order_number, o.created_at, o.status, o.delivery_type, o.currency, o.total_amount, o.paid_amount, o.remaining_amount, u.full_name AS customer_name
       FROM orders o JOIN customers c ON c.id = o.customer_id JOIN users u ON u.id = c.user_id
       WHERE o.created_at >= $1::date AND o.created_at < ($2::date + 1) ORDER BY o.created_at DESC LIMIT $3`, [rg.from, rg.to, REPORT_LIMIT]);
    const rows = r.rows.map((x) => ({ ...x, delivery_ar: DELIVERY_AR[x.delivery_type] || x.delivery_type }));
    return [{ kind: 'table', columns: [{ key: 'order_number', label: 'الطلب' }, { key: 'created_at', label: 'التاريخ', fmt: 'date', align: 'center' }, { key: 'customer_name', label: 'العميل' },
      { key: 'status', label: 'الحالة' }, { key: 'delivery_ar', label: 'التسليم' }, { key: 'currency', label: 'العملة', align: 'center' },
      { key: 'total_amount', label: 'الإجمالي', fmt: 'money' }, { key: 'paid_amount', label: 'المدفوع', fmt: 'money' }, { key: 'remaining_amount', label: 'المتبقي', fmt: 'money' }],
      rows, totals: [['عدد الطلبات', { text: String(rows.length) }]] }, ...limitNote(rows.length)];
  } },
  ceilings: { title: 'تقرير السقوف', perms: ['reports.view'], async build(rg) {
    const rules = await query(
      `SELECT oc.name_ar, oc.period, oc.is_active, oc.max_bags, oc.max_amount, oc.max_orders, oc.max_vehicles,
              u.full_name AS customer_name, ps.name_ar AS source_name, (oc.category_id IS NOT NULL) AS has_category
       FROM order_ceilings oc LEFT JOIN customers c ON c.id = oc.customer_id LEFT JOIN users u ON u.id = c.user_id LEFT JOIN product_sources ps ON ps.id = oc.source_id
       ORDER BY oc.is_active DESC, oc.created_at DESC`);
    const ov = await query(
      `SELECT status, COUNT(*)::int AS n, COUNT(*) FILTER (WHERE used_at IS NOT NULL)::int AS used
       FROM ceiling_overrides WHERE created_at >= $1::date AND created_at < ($2::date + 1) GROUP BY status ORDER BY status`, [rg.from, rg.to]);
    const act = await query(`SELECT ceiling_action, COUNT(*)::int AS n FROM customers GROUP BY ceiling_action`);
    const PER = { daily: 'يومي', monthly: 'شهري' };
    return [{ kind: 'table', title: 'قواعد السقوف', columns: [{ key: 'name_ar', label: 'القاعدة' }, { key: 'per', label: 'الفترة', align: 'center' }, { key: 'scope', label: 'النطاق' },
      { key: 'max_bags', label: 'كيس', fmt: 'qty' }, { key: 'max_amount', label: 'قيمة', fmt: 'money' }, { key: 'max_orders', label: 'طلبات', fmt: 'qty' }, { key: 'max_vehicles', label: 'قاطرات', fmt: 'qty' },
      { key: 'active', label: 'الحالة', align: 'center' }],
      rows: rules.rows.map((x) => ({ ...x, per: PER[x.period] || x.period, active: x.is_active ? 'فعّال' : 'معطّل',
        scope: [x.customer_name && `عميل: ${x.customer_name}`, x.source_name && `مصنع: ${x.source_name}`, x.has_category && 'صنف محدد'].filter(Boolean).join(' | ') || 'الجميع' })) },
    { kind: 'table', title: 'طلبات الاستثناء خلال الفترة', columns: [{ key: 'status', label: 'الحالة' }, { key: 'n', label: 'العدد', align: 'center' }, { key: 'used', label: 'المستهلك', align: 'center' }], rows: ov.rows, emptyText: 'لا طلبات استثناء' },
    { kind: 'table', title: 'إجراء التجاوز لدى العملاء', columns: [{ key: 'a', label: 'الإجراء' }, { key: 'n', label: 'عدد العملاء', align: 'center' }],
      rows: act.rows.map((x) => ({ a: x.ceiling_action === 'request_approval' ? 'طلب موافقة استثنائية' : 'منع', n: x.n })) }];
  } },
  balances: { title: 'تقرير الأرصدة', perms: ['ledger.view', 'statements.view', 'statements.export'], async build() {
    const c = await query(
      `SELECT u.full_name AS name, u.phone, b.currency, b.balance, c.credit_limit
       FROM customer_balances b JOIN customers c ON c.id = b.customer_id JOIN users u ON u.id = c.user_id
       WHERE b.balance <> 0 ORDER BY b.currency, b.balance DESC LIMIT $1`, [REPORT_LIMIT]);
    const d = await query(
      `SELECT full_name AS name, phone, current_balance AS balance FROM drivers
       WHERE driver_type = 'institution_driver' AND owner_trader_id IS NULL AND current_balance <> 0 ORDER BY current_balance DESC LIMIT $1`, [REPORT_LIMIT]);
    const side = (b) => (parseFloat(b) > 0 ? 'مدين' : 'دائن');
    const dSide = (b) => (parseFloat(b) > 0 ? 'مستحق للسائق' : 'على السائق');
    return [{ kind: 'table', title: 'أرصدة العملاء (لكل عملة)', columns: [{ key: 'name', label: 'العميل' }, { key: 'phone', label: 'الهاتف' }, { key: 'currency', label: 'العملة', align: 'center' },
      { key: 'balance', label: 'الرصيد', fmt: 'money' }, { key: 'side', label: 'الجانب', align: 'center' }, { key: 'credit_limit', label: 'حد الائتمان (ريال)', fmt: 'money' }],
      rows: c.rows.map((x) => ({ ...x, side: side(x.balance), credit_limit: x.currency === 'YER' ? x.credit_limit : '' })) },
    { kind: 'table', title: 'أرصدة سائقي المؤسسة (ريال)', columns: [{ key: 'name', label: 'السائق' }, { key: 'phone', label: 'الهاتف' }, { key: 'balance', label: 'الرصيد', fmt: 'money' }, { key: 'side', label: 'الجانب', align: 'center' }],
      rows: d.rows.map((x) => ({ ...x, side: dSide(x.balance) })) },
    { kind: 'note', text: 'لا تُجمع العملات معًا. سائقو التجار غير مشمولين (حسابهم عند تجارهم).' }, ...limitNote(c.rows.length)];
  } },
};

const report = async (ctx, kind, params = {}) => {
  const def = REPORTS[kind];
  if (!def) throw fail('تقرير غير معروف', 404, 'UNKNOWN_REPORT');
  if (!has(ctx, ...def.perms)) throw forbid();
  const rg = parseRange(params);
  const blocks = await def.build(rg);
  return base(ctx, { type: `report_${kind}`, title: def.title, docNumber: `RPT-${kind.toUpperCase()}-${stamp()}`,
    meta: [['من', rg.from], ['إلى', rg.to]], blocks, signatures: ['معدّ التقرير', 'الاعتماد'] });
};

module.exports = {
  orderPurchaseRequest, orderValueNotice, faxDocument, loadingDocument, deliveryDocument,
  customerStatement, driverStatement, paymentReceipt, report, REPORTS, parseRange,
};
