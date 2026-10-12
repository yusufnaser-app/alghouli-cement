'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { install, clearModules } = require('./helpers');

const norm = (s) => s.replace(/\s+/g, ' ').trim();
const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

// ───── المصيّر ─────
const renderer = () => { clearModules('src/modules/documents/document-renderer.js'); return require('../src/modules/documents/document-renderer'); };
const baseDoc = (over = {}) => ({ type: 't', title: 'إشعار قيمة الطلب', docNumber: 'VN-1', issuedAt: new Date('2026-10-11T10:00:00Z'), issuedBy: 'يوسف', ...over });

test('F3-1) المستند عربي RTL بحجم A4 ويحمل الشعار واسم المؤسسة ورقم المستند والتاريخ والمستخدم', () => {
  const h = renderer().renderDocument(baseDoc());
  assert.match(h, /<html lang="ar" dir="rtl">/);
  assert.match(h, /@page\{size:A4/);
  assert.match(h, /data:image\/jpeg;base64,/);       // الشعار مضمَّن (لا روابط خارجية)
  assert.match(h, /مؤسسة الغولي/);
  assert.match(h, /VN-1/);
  assert.match(h, /2026-10-11 13:00/);               // توقيت اليمن UTC+3
  assert.match(h, /أصدره: يوسف/);
  assert.match(h, /صفحة/);                            // ترقيم الصفحات في @page
});

test('F3-2) لا تُحمَّل أي مصادر خارجية (لا http في المستند)', () => {
  const h = renderer().renderDocument(baseDoc({ blocks: [{ kind: 'note', text: 'ملاحظة' }] }));
  assert.ok(!/src="https?:|href="https?:/.test(h));
});

test('F3-3) تهريب HTML في كل الحقول (XSS)', () => {
  const h = renderer().renderDocument(baseDoc({ meta: [['العميل', '<script>alert(1)</script>']], issuedBy: '"><img src=x>' }));
  assert.ok(!/<script>alert/.test(h));
  assert.ok(!/<img src=x>/.test(h));
  assert.match(h, /&lt;script&gt;/);
});

test('F3-4) تنسيق المبالغ: فواصل آلاف وخانتان عشريتان، والكمية بلا أصفار زائدة', () => {
  const r = renderer();
  assert.strictEqual(r.fmtMoney('1234567.5'), '1,234,567.50');
  assert.strictEqual(r.fmtMoney('-1500'), '-1,500.00');
  assert.strictEqual(r.fmtMoney(''), '');
  assert.strictEqual(r.fmtQty('100.000'), '100');
  assert.strictEqual(r.fmtQty('2.50'), '2.5');
  assert.strictEqual(r.fmtQty('0'), '0');
});

test('F3-5) مستند ناقص الحقول الإلزامية يُرفض', () => {
  assert.throws(() => renderer().renderDocument(baseDoc({ docNumber: '' })), /مستند ناقص: docNumber/);
  assert.throws(() => renderer().renderDocument(baseDoc({ issuedAt: null })), /مستند ناقص: issuedAt/);
});

test('F3-6) «فاتورة» بلا مرجع رسمي ⇒ 409 INVOICE_TITLE_REQUIRES_ACCOUNTING_REFERENCE (لا فاتورة وهمية)', () => {
  const e = (() => { try { renderer().renderDocument(baseDoc({ title: 'فاتورة' })); } catch (x) { return x; } })();
  assert.strictEqual(e.code, 'INVOICE_TITLE_REQUIRES_ACCOUNTING_REFERENCE');
  assert.strictEqual(e.status, 409);
});

test('F3-7) «فاتورة» مع مرجع رسمي يُعرض المرجع بوضوح', () => {
  const h = renderer().renderDocument(baseDoc({ title: 'فاتورة', accountingReference: 'YS-2026-0042' }));
  assert.match(h, /المرجع المحاسبي \(YemenSoft\):<\/b> YS-2026-0042/);
  assert.match(h, /<h2>فاتورة<\/h2>/);
});

test('F3-8) إشعار بلا مرجع لا يظهر أي سطر مرجع محاسبي', () => {
  const h = renderer().renderDocument(baseDoc());
  assert.ok(!/المرجع المحاسبي/.test(h));
});

test('F3-9) الجداول: مدين/دائن/رصيد بالأرقام، الإجمالي، ونص فارغ عند عدم وجود صفوف', () => {
  const h = renderer().renderDocument(baseDoc({ blocks: [
    { kind: 'table', title: 'الحركات', columns: [{ key: 'a', label: 'المبلغ', fmt: 'money' }], rows: [{ a: '2500' }],
      totals: [['الإجمالي', '2500']] },
    { kind: 'table', columns: [{ key: 'a', label: 'x' }], rows: [], emptyText: 'لا حركات' } ] }));
  assert.match(h, /2,500\.00/);
  assert.match(h, /class="tot"/);
  assert.match(h, /لا حركات/);
});

test('F3-10) ملاحظة التحذير تأخذ الصنف warn، والتوقيعات تُرسم بخط', () => {
  const h = renderer().renderDocument(baseDoc({ signatures: ['المحاسب'], blocks: [{ kind: 'note', tone: 'warn', text: 'تنبيه' }] }));
  assert.match(h, /class="note warn"/);
  assert.match(h, /<div class="line"><\/div>المحاسب/);
});

test('F3-11) طباعة: زر الطباعة يظهر إلا في وضع التضمين، وautoprint اختياري', () => {
  const r = renderer();
  assert.match(r.renderDocument(baseDoc()), /🖨 طباعة/);
  assert.ok(!/🖨 طباعة/.test(r.renderDocument(baseDoc(), { embed: true })));
});

// ───── المحمّلات (عميل وهمي) ─────
const mkQ = (handlers = []) => async (sql, params = []) => {
  const s = norm(sql);
  for (const [re, fn] of handlers) if (re.test(s)) return fn(s, params);
  return { rows: [] };
};
const load = (handlers, extra = {}) => {
  install({ pool: { connect: async () => ({ query: mkQ(handlers), release() {} }) }, query: mkQ(handlers), ...extra });
  clearModules('src/modules/documents/documents.service.js', 'src/modules/documents/official-reference.js',
    'src/modules/documents/document-renderer.js', 'src/modules/accounting/accounting-statements.service.js',
    'src/modules/customers/ledger.service.js', 'src/modules/drivers/driver-ledger.service.js');
  return require('../src/modules/documents/documents.service');
};
const ADMIN = { userId: 'admin1', userName: 'يوسف', roles: ['admin'], perms: new Set(['*']) };
const CUST = (uid) => ({ userId: uid, userName: 'عميل', roles: ['customer'], perms: new Set() });
const ORDER_ROW = (over = {}) => ({ id: 'o1', order_number: 'GHO-1', status: 'PREPARING', created_at: '2026-10-01T05:00:00Z', currency: 'YER',
  payment_terms: 'نقدًا', delivery_type: 'alghouli_delivery', subtotal: '100000', discount_amount: '0', shipping_amount: '0',
  total_amount: '100000', paid_amount: '0', remaining_amount: '100000', transport_beneficiary: null, trader_truck_plate: null,
  customer_id: 'c1', customer_user_id: 'cu1', customer_name: 'علي', customer_phone: '777', governorate: 'ذمار', area: 'المدينة', address_text: 'شارع', ...over });
const ITEM = (over = {}) => ({ product_name: 'أسمنت', quantity: '10', unit: 'bag', unit_price: '10000', discount: '0', line_total: '100000', factory_name: 'النهضة', ...over });
const orderHandlers = (order, items = [ITEM()], extra = []) => [
  [/^SELECT o\.id, o\.order_number/, () => ({ rows: order ? [order] : [] })],
  [/^SELECT p\.name_ar AS product_name/, () => ({ rows: items })],
  ...extra,
];

test('F3-12) إشعار قيمة الطلب بلا مرجع رسمي: عنوانه «إشعار قيمة الطلب» وبتحذير، لا «فاتورة»', async () => {
  const svc = load(orderHandlers(ORDER_ROW()));
  const d = await svc.orderValueNotice(ADMIN, 'o1');
  assert.strictEqual(d.title, 'إشعار قيمة الطلب');
  assert.strictEqual(d.accountingReference, null);
  assert.ok(d.blocks.some((b) => b.kind === 'note' && b.tone === 'warn'));
});

test('F3-13) مرجع YemenSoft SYNCED ⇒ يصبح «فاتورة» مع المرجع (والاستعلام يشترط SYNCED)', async () => {
  let sawSynced = false;
  const svc = load(orderHandlers(ORDER_ROW(), [ITEM()], [
    [/FROM accounting_mappings/, (s) => { sawSynced = /sync_status = 'SYNCED'/.test(s) && /accounting_reference IS NOT NULL/.test(s); return { rows: [{ accounting_reference: 'YS-7' }] }; }],
  ]));
  const d = await svc.orderValueNotice(ADMIN, 'o1');
  assert.strictEqual(d.title, 'فاتورة');
  assert.strictEqual(d.accountingReference, 'YS-7');
  assert.ok(sawSynced);
});

test('F3-14) طلب غير مسعّر ⇒ 409 ORDER_NOT_PRICED (لا إشعار بقيم فارغة)', async () => {
  const svc = load(orderHandlers(ORDER_ROW({ total_amount: null }), [ITEM()]));
  await assert.rejects(svc.orderValueNotice(ADMIN, 'o1'), { code: 'ORDER_NOT_PRICED', status: 409 });
});

test('F3-15) العميل يرى طلبه فقط: طلب غيره ⇒ 403، وطلبه ⇒ يُصدَر', async () => {
  const svc = load(orderHandlers(ORDER_ROW({ customer_user_id: 'cu1' })));
  await assert.rejects(svc.orderPurchaseRequest(CUST('cu2'), 'o1'), { status: 403 });
  const d = await svc.orderPurchaseRequest(CUST('cu1'), 'o1');
  assert.strictEqual(d.type, 'order_purchase_request');
});

test('F3-16) طلب الشراء لا يحمل أسعارًا ولا مجاميع (ليس مستندًا ماليًا)', async () => {
  const svc = load(orderHandlers(ORDER_ROW()));
  const d = await svc.orderPurchaseRequest(ADMIN, 'o1');
  const cols = d.blocks[0].columns.map((c) => c.key);
  assert.ok(!cols.some((k) => /price|total|amount/.test(k)));
  assert.strictEqual(d.blocks[0].columns.find((c) => c.key === 'quantity').fmt, 'qty');
});

test('F3-17) طلب غير موجود ⇒ 404', async () => {
  await assert.rejects(load(orderHandlers(null)).orderPurchaseRequest(ADMIN, 'zz'), { status: 404 });
});

const FAX_ROW = (over = {}) => ({ id: 'f1', fax_number: 'FX-2026-00007', status: 'USED', requested_quantity: '1000', approved_quantity: '1000',
  loaded_quantity: '1000', requested_at: '2026-10-01T05:00:00Z', approved_at: null, issued_at: '2026-10-01T06:00:00Z', used_at: '2026-10-02T06:00:00Z',
  delivered_at: null, delivery_governorate: 'ذمار', delivery_area: null, delivery_address: null, is_managed_by_institution: true, route: 'صنعاء - ذمار',
  order_id: null, driver_name: 'هاشم', driver_user_id: 'du1', driver_phone: '711', plate_number: 'ص 1234', factory_name: 'النهضة', order_number: null, customer_user_id: null, ...over });
const DEST_ROW = (over = {}) => ({ destination_type: 'trader', label: 'علي', governorate: 'ذمار', area: null, address_text: 'شارع', quantity: '850', unit: 'bag',
  status: 'PENDING', delivered_at: null, delivered_by_name: null, contact_name: null, contact_phone: null, ...over });
const faxHandlers = (fax, dests = [DEST_ROW()]) => [
  [/^SELECT f\.id, f\.fax_number/, () => ({ rows: fax ? [fax] : [] })],
  [/^SELECT d\.destination_type/, () => ({ rows: dests })],
];

test('F3-18) سائق الفاكس يرى فاكسه، وسائق آخر ⇒ 403', async () => {
  const svc = load(faxHandlers(FAX_ROW()));
  await assert.rejects(svc.faxDocument({ userId: 'other', roles: ['driver'], perms: new Set() }, 'f1'), { status: 403 });
  const d = await svc.faxDocument({ userId: 'du1', roles: ['driver'], perms: new Set() }, 'f1');
  assert.strictEqual(d.docNumber, 'FX-2026-00007');
});

test('F3-19) مستند التحميل يتطلب تسجيل التحميل (USED فما فوق)، والكمية بالأكياس والأطنان', async () => {
  await assert.rejects(load(faxHandlers(FAX_ROW({ status: 'ISSUED' }))).loadingDocument(ADMIN, 'f1'), { code: 'FAX_NOT_LOADED', status: 409 });
  const d = await load(faxHandlers(FAX_ROW())).loadingDocument(ADMIN, 'f1');
  assert.strictEqual(d.docNumber, 'LD-FX-2026-00007');
  const kv = d.blocks[0].rows;
  assert.deepStrictEqual(kv.slice(0, 2), [['بالأكياس', '1000'], ['بالأطنان', '50']]);
});

test('F3-20) مستند التسليم: بلا وجهات ⇒ 409، ومع وجهات يعرض «مُسلَّم من» و«حالة كل وجهة»', async () => {
  await assert.rejects(load(faxHandlers(FAX_ROW(), [])).deliveryDocument(ADMIN, 'f1'), { code: 'NO_DESTINATIONS' });
  const d = await load(faxHandlers(FAX_ROW(), [DEST_ROW({ status: 'DELIVERED' }), DEST_ROW({ label: 'ب' })])).deliveryDocument(ADMIN, 'f1');
  assert.ok(d.meta.some(([l, v]) => l === 'الوجهات المُسلَّمة' && v === '1 من 2'));
  assert.strictEqual(d.blocks[0].rows[0].status_ar, 'تم التسليم');
});

test('F3-21) إيصال الدفع: غير المعتمدة ⇒ 409 (لا إيصال لدفعة معلّقة أو مرفوضة)', async () => {
  const svc = load([[/^SELECT p\.id, p\.reference_code/, () => ({ rows: [{ status: 'pending', customer_user_id: 'cu1', reference_code: 'PAY-1', payment_currency: 'YER' }] })]]);
  await assert.rejects(svc.paymentReceipt(ADMIN, 'p1'), { code: 'PAYMENT_NOT_APPROVED', status: 409 });
});

test('F3-22) إيصال معتمد يحمل المبلغ المعتمد وعبارة «ليس مستندًا رسميًا»', async () => {
  const svc = load([[/^SELECT p\.id, p\.reference_code/, () => ({ rows: [{ status: 'approved', customer_user_id: 'cu1', reference_code: 'PAY-1',
    amount_due: '5000.00', amount_transferred: '5000.00', transfer_date: '2026-10-02', payment_currency: 'YER', method_name: 'حوالة',
    order_number: 'GHO-1', customer_name: 'علي', customer_phone: '777', reviewed_by_name: 'يوسف', reviewed_at: '2026-10-02T08:00:00Z' }] })]]);
  const d = await svc.paymentReceipt(ADMIN, 'p1');
  assert.strictEqual(d.title, 'إيصال دفع');
  assert.ok(d.blocks.some((b) => b.kind === 'kv' && b.rows.some(([, v]) => v === '5000.00')));
  assert.ok(d.blocks.some((b) => /ليس مستندًا ماليًا رسميًا/.test(b.text || '')));
});

test('F3-23) كشف حساب العميل: عميل يرى كشفه فقط، وموظف بلا statements.view ⇒ 403', async () => {
  const handlers = [[/^SELECT c\.id, c\.user_id, u\.full_name/, () => ({ rows: [{ id: 'c1', user_id: 'cu1', full_name: 'علي', phone: '777' }] })]];
  const svc = load(handlers);
  await assert.rejects(svc.customerStatement(CUST('cu2'), 'c1'), { status: 403 });
  await assert.rejects(svc.customerStatement({ userId: 'x', roles: [], perms: new Set(['reports.view']) }, 'c1'), { status: 403 });
});

test('F3-24) كشف سائق المؤسسة يرفض سائق التاجر (422) بلا تسريب بيانات', async () => {
  const handlers = [
    [/^SELECT d\.id, d\.full_name, d\.user_id FROM drivers/, () => ({ rows: [{ id: 'd1', full_name: 'س', user_id: 'du1' }] })],
    [/^SELECT id, full_name, phone, driver_type, owner_trader_id, current_balance FROM drivers/, () => ({ rows: [{ id: 'd1', full_name: 'س', phone: '7', driver_type: 'trader_driver', owner_trader_id: 't1', current_balance: '0' }] })],
  ];
  await assert.rejects(load(handlers).driverStatement(ADMIN, 'd1'), { code: 'NOT_INSTITUTION_DRIVER', status: 422 });
});

test('F3-25) التقارير: نطاق تاريخ غير صالح ⇒ 400، وتقرير غير معروف ⇒ 404، وبلا صلاحية ⇒ 403', async () => {
  const svc = load([]);
  assert.throws(() => svc.parseRange({ from: '2026-13-01', to: '2026-10-01' }), { code: 'INVALID_RANGE', status: 400 });
  assert.throws(() => svc.parseRange({ from: '2026-10-05', to: '2026-10-01' }), { code: 'INVALID_RANGE' });
  await assert.rejects(svc.report(ADMIN, 'nope', {}), { code: 'UNKNOWN_REPORT', status: 404 });
  await assert.rejects(svc.report({ userId: 'x', roles: [], perms: new Set() }, 'payments', {}), { status: 403 });
});

test('F3-26) تقرير المدفوعات: الإجماليات بالمعتمد فقط، ولا تُجمع العملات معًا', async () => {
  const svc = load([[/FROM payments p JOIN orders o/, () => ({ rows: [
    { status: 'approved', amount_transferred: '100.00', currency: 'YER', reference_code: 'A' },
    { status: 'approved', amount_transferred: '50.00', currency: 'USD', reference_code: 'B' },
    { status: 'rejected', amount_transferred: '999.00', currency: 'YER', reference_code: 'C' }] })]]);
  const d = await svc.report(ADMIN, 'payments', { from: '2026-10-01', to: '2026-10-12' });
  const totals = d.blocks[0].totals;
  assert.deepStrictEqual(totals, [['إجمالي YER', '100.00'], ['إجمالي USD', '50.00']]);
});

test('F3-27) تقرير الطن ×20 في المستودعات والسقوف يُعرض كل بُعد بلا تداخل', async () => {
  const svc = load([[/FROM institution_warehouses w/, () => ({ rows: [{ code: 'W1', name_ar: 'مستودع', governorate: 'ذمار', status: 'active', dests: 1, delivered_bags: '2000', pending_bags: '0' }] })]]);
  const d = await svc.report(ADMIN, 'warehouses', { from: '2026-10-01', to: '2026-10-12' });
  assert.strictEqual(d.blocks[0].rows[0].delivered_bags, '2000');
  assert.match(read('src/modules/documents/documents.service.js'), /x\.unit = 'ton' THEN 20 ELSE 1 END/);
});

test('F3-28) تقرير الرحلات يستبعد فواكس التجار؛ والمرجع المحاسبي لا يُفترض', () => {
  const s = read('src/modules/documents/documents.service.js');
  assert.match(s, /COALESCE\(f\.is_managed_by_institution, TRUE\) = TRUE/);
});

// ───── الربط ─────
test('F3-29) المسارات مفحوصة بالمصادقة، والمتحكم يرسل no-store، والتطبيق يركّب /documents', () => {
  assert.match(read('src/modules/documents/documents.routes.js'), /router\.use\(authenticate\)/);
  assert.match(read('src/modules/documents/documents.controller.js'), /Cache-Control', 'no-store'/);
  assert.match(read('src/app.js'), /api\.use\('\/documents', documentsRoutes\)/);
});

test('F3-30) الشعار مضمَّن كوحدة base64 (بلا ملفات ثنائية في الـ patch) ويُحقن في المستند', () => {
  const logo = require('../src/modules/documents/logo-data');
  assert.ok(logo.startsWith('data:image/jpeg;base64,') && logo.length > 10000);
  assert.match(read('src/modules/documents/document-renderer.js'), /require\('\.\/logo-data'\)/);
});

test('F3-31) المرجع الرسمي لا يقرأ إلا SYNCED ومرجعًا غير فارغ', () => {
  const s = read('src/modules/documents/official-reference.js');
  assert.match(s, /sync_status = 'SYNCED'/);
  assert.match(s, /accounting_reference <> ''/);
});

test('F3-32) لا توجد مكتبة PDF ثقيلة: التصدير عبر المتصفح (HTML + print)', () => {
  const pkg = read('package.json');
  assert.ok(!/puppeteer|pdfkit|html-pdf|pdfmake/i.test(pkg));
});
