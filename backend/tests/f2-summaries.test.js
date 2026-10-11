'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { install, clearModules } = require('./helpers');

const norm = (s) => s.replace(/\s+/g, ' ').trim();
const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

// ───── ملخص العميل ─────
const loadCustomer = (d = {}) => {
  const log = [];
  const data = { kinds: [], tx: [], balances: [{ currency: 'YER', balance: '0.00' }], totals: [], cust: { credit_limit: '0', user_status: 'active' }, pending: '0', ...d };
  const query = async (sql) => {
    const s = norm(sql); log.push(s);
    if (/FROM customer_balances/.test(s)) return { rows: data.balances };
    if (/GROUP BY cl\.currency, COALESCE\(orig\.transaction_type/.test(s)) return { rows: data.kinds };
    if (/FROM order_accounting_postings p/.test(s)) return { rows: data.tx };
    if (/status = 'PENDING_ADMIN_APPROVAL'/.test(s)) return { rows: [{ total: data.pending }] };
    if (/^SELECT c\.credit_limit, u\.status/.test(s)) return { rows: [data.cust] };
    if (/COUNT\(DISTINCT cl\.order_id\) AS total_orders/.test(s)) return { rows: data.totals };
    return { rows: [] };
  };
  install({ pool: { connect: async () => ({ query, release() {} }) }, query });
  clearModules('src/modules/customers/ledger.service.js', 'src/modules/accounting/ledger.core.js');
  const svc = require('../src/modules/customers/ledger.service');
  svc.__log = log;
  return svc;
};
const K = (currency, kind, debit, credit) => ({ currency, kind, debit, credit });

test('F2-1) عميل بلا رصيد افتتاحي ولا حركات: أصفار، reconciled، active', async () => {
  const s = await loadCustomer().getSummary('c1');
  const y = s.balances.YER;
  assert.deepStrictEqual([y.opening_balance, y.sales, y.discounts, y.transport_fees, y.payments, y.adjustments, y.other, y.reconciled],
    ['0.00', '0.00', '0.00', '0.00', '0.00', '0.00', '0.00', true]);
  assert.deepStrictEqual([s.has_limit, s.available_credit, s.account_status], [false, null, 'active']);
});

test('F2-2) عميل مع رصيد افتتاحي وبيع (فيه نقل وخصم) ودفعات: التفصيل والرصيد الحالي يتطابقان', async () => {
  const s = await loadCustomer({
    balances: [{ currency: 'YER', balance: '90000.00' }],
    kinds: [K('YER', 'opening_balance', '50000.00', '0'), K('YER', 'actual_sale', '100000.00', '0'),
      K('YER', 'payment', '0', '40000.00'), K('YER', 'manual_payment', '0', '20000.00')],
    tx: [{ currency: 'YER', transport: '10000.00', discounts: '5000.00' }],
  }).getSummary('c1');
  const y = s.balances.YER;
  assert.deepStrictEqual([y.opening_balance, y.sales, y.transport_fees, y.discounts, y.payments, y.other],
    ['50000.00', '90000.00', '10000.00', '5000.00', '60000.00', '0.00']);
  assert.strictEqual(y.balance, '90000.00');      // 50000 + 90000 + 10000 − 60000
  assert.strictEqual(y.reconciled, true);
});

test('F2-3) القيد العاكس يُنسب لنوع الأصل: دفعة معكوسة تُلغى من المدفوعات', async () => {
  // الدفعة 40000 ثم عكسها (مدين 40000 مُنسَب لـ payment) → المدفوعات الصافية 0
  const s = await loadCustomer({
    balances: [{ currency: 'YER', balance: '100000.00' }],
    kinds: [K('YER', 'actual_sale', '100000.00', '0'), K('YER', 'payment', '40000.00', '40000.00')],
  }).getSummary('c1');
  assert.strictEqual(s.balances.YER.payments, '0.00');
  assert.strictEqual(s.balances.YER.reconciled, true);
});

test('F2-4) التسويات تظهر بإشارتها، وأنواع غير معروفة تذهب لـ other فلا تختل المطابقة', async () => {
  const s = await loadCustomer({
    balances: [{ currency: 'YER', balance: '8500.00' }],
    kinds: [K('YER', 'adjustment', '3000.00', '1000.00'), K('YER', 'mystery', '7500.00', '0')],
  }).getSummary('c1');
  assert.deepStrictEqual([s.balances.YER.adjustments, s.balances.YER.other, s.balances.YER.reconciled], ['2000.00', '7500.00', false]);
  // 2000 + 7500 = 9500 ≠ 8500 → انحراف الرصيد المخزَّن يُكشف
});

test('F2-5) العملات لا تُخلط: كل عملة تفصيلها ومطابقتها وحدها', async () => {
  const s = await loadCustomer({
    balances: [{ currency: 'YER', balance: '1000.00' }, { currency: 'USD', balance: '50.00' }],
    kinds: [K('YER', 'actual_sale', '1000.00', '0'), K('USD', 'opening_balance', '50.00', '0')],
  }).getSummary('c1');
  assert.deepStrictEqual([s.balances.YER.sales, s.balances.YER.opening_balance, s.balances.USD.opening_balance, s.balances.USD.sales],
    ['1000.00', '0.00', '50.00', '0.00']);
});

test('F2-6) المتاح: الحد − الرصيد − المعلّق (كما في فحص الائتمان)، والحد 0 = بلا حد', async () => {
  const lim = await loadCustomer({ cust: { credit_limit: '100000', user_status: 'active' }, balances: [{ currency: 'YER', balance: '30000.00' }], pending: '10000' }).getSummary('c1');
  assert.deepStrictEqual([lim.has_limit, lim.available_credit, lim.pending_credit], [true, '60000.00', '10000.00']);
  const none = await loadCustomer({ balances: [{ currency: 'YER', balance: '30000.00' }] }).getSummary('c1');
  assert.deepStrictEqual([none.has_limit, none.available_credit], [false, null]);
});

test('F2-7) حالة الحساب: blocked / over_limit / near_limit / active', async () => {
  const st = async (cust, bal) => (await loadCustomer({ cust, balances: [{ currency: 'YER', balance: bal }] }).getSummary('c1')).account_status;
  assert.strictEqual(await st({ credit_limit: '100000', user_status: 'suspended' }, '0'), 'blocked');
  assert.strictEqual(await st({ credit_limit: '100000', user_status: 'active' }, '100001.00'), 'over_limit');
  assert.strictEqual(await st({ credit_limit: '100000', user_status: 'active' }, '80000.00'), 'near_limit');
  assert.strictEqual(await st({ credit_limit: '100000', user_status: 'active' }, '79999.00'), 'active');
  assert.strictEqual(await st({ credit_limit: '0', user_status: 'active' }, '999999.00'), 'active');
});

test('F2-8) أجور النقل والخصم تُحسب من طلبات بيعها قائم فقط (صافي البيع > 0)', () => {
  const s = read('src/modules/customers/ledger.service.js');
  assert.ok(/COALESCE\(ro\.transaction_type, l\.transaction_type\) = 'actual_sale'\) > 0/.test(s));
  assert.ok(/ROUND\(SUM\(COALESCE\(oi\.discount, 0\)\) \* p\.loaded_quantity/.test(s));
});

// ───── ملخص السائق ─────
const loadDriver = (d = {}) => {
  const log = [];
  const data = { drv: { id: 'd1', full_name: 'سائق', phone: '7', driver_type: 'institution_driver', owner_trader_id: null, current_balance: '0.00' },
    kinds: [], trips: { done: 0, active: 0 }, ...d };
  const query = async (sql) => {
    const s = norm(sql); log.push(s);
    if (/^SELECT id, full_name, phone, driver_type, owner_trader_id, current_balance FROM drivers/.test(s)) return { rows: data.drv ? [data.drv] : [] };
    if (/FROM driver_ledger dl LEFT JOIN driver_ledger orig/.test(s)) return { rows: data.kinds };
    if (/FROM loading_faxes WHERE driver_id/.test(s)) return { rows: [data.trips] };
    return { rows: [] };
  };
  install({ pool: { connect: async () => ({ query, release() {} }) }, query });
  clearModules('src/modules/drivers/driver-ledger.service.js');
  const svc = require('../src/modules/drivers/driver-ledger.service');
  svc.__log = log;
  return svc;
};
const D = (kind, debit, credit) => ({ kind, debit, credit });

test('F2-9) سائق مؤسسة بلا رصيد افتتاحي ولا حركات: أصفار وreconciled', async () => {
  const s = await loadDriver().getAccountSummary('d1');
  assert.deepStrictEqual([s.opening_balance, s.opening_side, s.transport_due, s.advances, s.payments, s.deductions, s.outstanding_balance, s.outstanding_side, s.reconciled, s.currency],
    ['0.00', 'none', '0.00', '0.00', '0.00', '0.00', '0.00', 'settled', true, 'YER']);
});

test('F2-10) سائق مؤسسة مع افتتاحي وأجور وسلف ودفعات وخصومات: الأرقام والرصيد المستحق', async () => {
  const s = await loadDriver({
    drv: { id: 'd1', full_name: 'س', phone: '7', driver_type: 'institution_driver', owner_trader_id: null, current_balance: '75000.00' },
    kinds: [D('opening_balance', '20000.00', '0'), D('transport_due', '100000.00', '0'), D('transport_adjustment', '5000.00', '0'),
      D('advance', '0', '10000.00'), D('payment', '0', '30000.00'), D('deduction', '0', '10000.00')],
    trips: { done: 7, active: 2 },
  }).getAccountSummary('d1');
  assert.deepStrictEqual([s.opening_balance, s.opening_side, s.transport_due, s.advances, s.payments, s.deductions, s.other_adjustments],
    ['20000.00', 'owed_to_driver', '105000.00', '10000.00', '30000.00', '10000.00', '0.00']);
  assert.deepStrictEqual([s.outstanding_balance, s.outstanding_side, s.reconciled, s.trips, s.trips_in_progress], ['75000.00', 'owed_to_driver', true, 7, 2]);
});

test('F2-11) رصيد افتتاحي على السائق (owed_by_driver) يظهر بجانبه الصحيح', async () => {
  const s = await loadDriver({
    drv: { id: 'd1', full_name: 'س', phone: '7', driver_type: 'institution_driver', owner_trader_id: null, current_balance: '-3000.00' },
    kinds: [D('opening_balance', '0', '3000.00')],
  }).getAccountSummary('d1');
  assert.deepStrictEqual([s.opening_balance, s.opening_side, s.outstanding_balance, s.outstanding_side, s.reconciled], ['3000.00', 'owed_by_driver', '3000.00', 'owed_by_driver', true]);
});

test('F2-12) دفعة معكوسة (قيد عاكس منسوب للأصل) لا تُحسب مدفوعة', async () => {
  const s = await loadDriver({
    drv: { id: 'd1', full_name: 'س', phone: '7', driver_type: 'institution_driver', owner_trader_id: null, current_balance: '50000.00' },
    kinds: [D('transport_due', '50000.00', '0'), D('payment', '20000.00', '20000.00')],
  }).getAccountSummary('d1');
  assert.deepStrictEqual([s.payments, s.outstanding_balance, s.reconciled], ['0.00', '50000.00', true]);
});

test('F2-13) سائق تاجر (النوع أو owner_trader_id) → 422 NOT_INSTITUTION_DRIVER بلا قراءة الدفتر', async () => {
  for (const patch of [{ driver_type: 'trader_driver' }, { owner_trader_id: 't1' }]) {
    const svc = loadDriver({ drv: { id: 'd1', full_name: 'س', phone: '7', driver_type: 'institution_driver', owner_trader_id: null, current_balance: '0', ...patch } });
    await assert.rejects(svc.getAccountSummary('d1'), { code: 'NOT_INSTITUTION_DRIVER', status: 422 });
    assert.ok(!svc.__log.some((l) => /driver_ledger/.test(l)));
  }
});

test('F2-14) سائق غير موجود → 404', async () => {
  await assert.rejects(loadDriver({ drv: null }).getAccountSummary('zz'), { code: 'DRIVER_NOT_FOUND', status: 404 });
});

test('F2-15) انحراف الرصيد المخزَّن عن مجموع الدفتر → reconciled=false', async () => {
  const s = await loadDriver({
    drv: { id: 'd1', full_name: 'س', phone: '7', driver_type: 'institution_driver', owner_trader_id: null, current_balance: '99999.00' },
    kinds: [D('transport_due', '1000.00', '0')],
  }).getAccountSummary('d1');
  assert.strictEqual(s.reconciled, false);
});

test('F2-16) الملخص القديم للسائق كان يجمع السلفة/الخصم من debit (دائمًا 0) — صُحّح إلى credit', () => {
  const s = read('src/modules/drivers/driver-ledger.service.js');
  assert.ok(/transaction_type = 'advance' THEN dl\.credit/.test(s));
  assert.ok(/transaction_type = 'deduction' THEN dl\.credit/.test(s));
  assert.ok(!/transaction_type = 'advance' THEN dl\.debit/.test(s));
});

test('F2-17) مسار ملخص الأدمن للسائق يستعمل الجديد (يرفض سائق التاجر) ويُبقي القديم', () => {
  const c = read('src/modules/drivers/driver-ledger.controller.js');
  assert.ok(/service\.getAccountSummary\(req\.params\.driverId\)/.test(c));
  assert.ok(/\.\.\.\(legacy \|\| \{\}\), \.\.\.account/.test(c));
});

// ───── entry_date (m39) ─────
test('F2-18) m39: عمود entry_date + فهرس تعبيري، وبلا UPDATE (driver_ledger محمي بـ trigger)', () => {
  const s = read('migrations/m39.js');
  assert.ok(/ADD COLUMN IF NOT EXISTS entry_date TIMESTAMP/.test(s));
  assert.ok(/CREATE INDEX IF NOT EXISTS idx_driver_ledger_entry[\s\S]*COALESCE\(entry_date, created_at\)/.test(s));
  assert.ok(!/UPDATE driver_ledger/i.test(s.replace(/\/\/.*$/gm, '')), 'UPDATE على driver_ledger يفشل بسبب trigger m29');
  assert.ok(/forbid_financial_mutation/.test(read('migrations/m29.js')) && /'driver_ledger'/.test(read('migrations/m29.js')));
});

test('F2-19) postDriverEntry: entry_date معامل 16 مع COALESCE(NOW()) وعدد الأعمدة = القيم', async () => {
  const log = [];
  const client = { query: async (sql, p = []) => { const s = norm(sql); log.push({ s, p });
    if (/FOR UPDATE/.test(s)) return { rows: [{ current_balance: '0' }] };
    if (/^INSERT INTO driver_ledger/.test(s)) return { rows: [{ id: 'e1' }] };
    return { rows: [] }; } };
  install({ pool: {}, query: async () => ({ rows: [] }) });
  clearModules('src/modules/accounting/ledger.core.js');
  const core = require('../src/modules/accounting/ledger.core');
  await core.postDriverEntry(client, { driverId: 'd1', currency: 'YER', debit: 10, credit: 0, transactionType: 'opening_balance', entryDate: '2026-01-01T00:00:00.000Z' });
  const ins = log.find((l) => /^INSERT INTO driver_ledger/.test(l.s));
  assert.strictEqual(ins.p.length, 16);
  assert.strictEqual(ins.p[15], '2026-01-01T00:00:00.000Z');
  assert.match(ins.s, /COALESCE\(\$16::timestamp, NOW\(\)\)/);
  const m = ins.s.match(/\(([^)]*)\) VALUES \((.*)\) ON CONFLICT/);
  assert.strictEqual(m[1].split(',').length, m[2].replace(/COALESCE\(\$16::timestamp, NOW\(\)\)/, '$16').split(',').length);
  await core.postDriverEntry(client, { driverId: 'd1', currency: 'YER', debit: 10, credit: 0, transactionType: 'payment' });
  assert.strictEqual(log.filter((l) => /^INSERT INTO driver_ledger/.test(l.s)).pop().p[15], null);   // بلا تاريخ → NOW()
});

test('F2-20) الرصيد الافتتاحي للسائق يحفظ asOf في entry_date، وتاريخ غير صالح → 400 قبل أي قيد', async () => {
  const log = [];
  const client = { release() {}, query: async (sql, p = []) => { const s = norm(sql); log.push({ s, p });
    if (/^SELECT id, driver_type, owner_trader_id FROM drivers/.test(s)) return { rows: [{ id: 'd1', driver_type: 'institution_driver', owner_trader_id: null }] };
    if (/^SELECT current_balance FROM drivers/.test(s)) return { rows: [{ current_balance: '0' }] };
    if (/^INSERT INTO driver_ledger/.test(s)) return { rows: [{ id: 'e1' }] };
    if (/^INSERT INTO accounting_sync_queue/.test(s)) return { rows: [{ id: 'q' }] };
    return { rows: [] }; } };
  install({ pool: { connect: async () => client }, query: async () => ({ rows: [] }) });
  clearModules('src/modules/drivers/driver-ledger.service.js', 'src/modules/accounting/ledger.core.js', 'src/modules/accounting/accounting-integration.service.js', 'src/modules/audit/audit.service.js');
  const svc = require('../src/modules/drivers/driver-ledger.service');
  await svc.setDriverOpeningBalance('d1', { amount: 100, side: 'owed_to_driver', asOf: '2026-01-01' }, 'u1');
  assert.strictEqual(log.find((l) => /^INSERT INTO driver_ledger/.test(l.s)).p[15], '2026-01-01T00:00:00.000Z');
  log.length = 0;
  await assert.rejects(svc.setDriverOpeningBalance('d1', { amount: 100, side: 'owed_to_driver', asOf: 'ليس تاريخًا' }, 'u1'), { code: 'INVALID_DATE', status: 400 });
  assert.ok(!log.some((l) => /^INSERT INTO driver_ledger/.test(l.s)));
});

test('F2-21) كشف السائق يُرتَّب بالتاريخ الفعلي COALESCE(entry_date, created_at)', () => {
  assert.ok(/ORDER BY COALESCE\(dl\.entry_date, dl\.created_at\) DESC/.test(read('src/modules/accounting/accounting-statements.service.js')));
});
