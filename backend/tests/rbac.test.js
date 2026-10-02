const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { install, clearModules } = require('./helpers');
const { ROLE_PERMISSIONS, PERMISSIONS } = require('../src/modules/auth/permissions');

// jwt وهمي كي لا نحتاج jsonwebtoken
const jwtPath = require.resolve('../src/utils/jwt');
require.cache[jwtPath] = { id: jwtPath, filename: jwtPath, loaded: true, exports: { verifyAccess: () => ({ userId: 'U' }) } };

const makeEnv = ({ roles, overrides = [] }) => {
  const audit = [];
  const query = async (sql, params) => {
    if (/FROM user_roles ur JOIN role_permissions rp/.test(sql)) {
      const set = new Set(); roles.forEach((r) => (ROLE_PERMISSIONS[r] || []).forEach((p) => set.add(p)));
      return { rows: [...set].map((permission_code) => ({ permission_code })) };
    }
    if (/FROM user_permissions/.test(sql)) return { rows: overrides };
    if (/INSERT INTO audit_logs/.test(sql)) { audit.push(params); return { rows: [] }; }
    throw new Error('غير متوقع: ' + sql.slice(0, 50));
  };
  install({ pool: {}, query });
  clearModules('src/middlewares/auth.js');
  const { requirePermission } = require('../src/middlewares/auth');
  const run = async (...codes) => {
    const req = { user: { id: 'U1' }, roles, method: 'PATCH', originalUrl: '/x', headers: {}, ip: '1.1.1.1' };
    let status = null; let nexted = false;
    const res = { status(s) { status = s; return this; }, json() { return this; } };
    await requirePermission(...codes)(req, res, (e) => { if (e) throw e; nexted = true; });
    return { allowed: nexted, status };
  };
  return { run, audit };
};
const can = async (roles, code, overrides) => (await makeEnv({ roles, overrides }).run(code)).allowed;

test('28) موظف المبيعات: يسعّر لكن لا يعتمد دفعة ولا يعدّل الدفتر ولا يعكس ولا يدير الصلاحيات', async () => {
  assert.ok(await can(['sales'], 'pricing.create'));
  for (const p of ['payments.approve', 'payments.reject', 'payments.reverse', 'ledger.create', 'ledger.adjust', 'ledger.reverse', 'roles.manage', 'users.update', 'pricing.approve'])
    assert.ok(!(await can(['sales'], p)), `sales يجب ألا يملك ${p}`);
});
test('موظف التحميل: يعتمد الكمية فقط؛ لا سعر ولا دفع ولا دفتر', async () => {
  assert.ok(await can(['loading'], 'loading.confirm'));
  for (const p of ['pricing.update', 'pricing.create', 'payments.approve', 'ledger.adjust', 'ledger.view', 'statements.view'])
    assert.ok(!(await can(['loading'], p)), `loading يجب ألا يملك ${p}`);
});
test('مسؤول النقل: يعيّن السائق/القاطرة؛ لا سعر ولا دفع ولا دفتر', async () => {
  assert.ok(await can(['transport'], 'transport.assign'));
  for (const p of ['pricing.update', 'payments.approve', 'ledger.view', 'ledger.adjust', 'loading.confirm'])
    assert.ok(!(await can(['transport'], p)), `transport يجب ألا يملك ${p}`);
});
test('المحاسب: مالي كامل لكن بلا إدارة مستخدمين/أدوار/تعطيل، وبلا عكس إلا بمنح صريح', async () => {
  for (const p of ['payments.approve', 'ledger.view', 'ledger.adjust', 'statements.export', 'accounting.integrity_check'])
    assert.ok(await can(['accountant'], p), p);
  for (const p of ['users.create', 'users.update', 'users.disable', 'roles.manage', 'pricing.update', 'ledger.reverse', 'payments.reverse'])
    assert.ok(!(await can(['accountant'], p)), `accountant يجب ألا يملك ${p}`);
  // منح صريح
  assert.ok(await can(['accountant'], 'ledger.reverse', [{ permission_code: 'ledger.reverse', granted: true }]));
});
test('المراجع: قراءة وتدقيق فقط؛ لا تعديل مالي', async () => {
  for (const p of ['ledger.view', 'statements.view', 'audit.view', 'accounting.integrity_check', 'reports.export']) assert.ok(await can(['auditor'], p), p);
  for (const p of ['ledger.create', 'ledger.adjust', 'ledger.reverse', 'payments.approve', 'payments.reverse', 'pricing.update', 'orders.update'])
    assert.ok(!(await can(['auditor'], p)), `auditor يجب ألا يملك ${p}`);
});
test('30) العميل/التاجر: كشف حسابه فقط؛ لا ledger ولا statements العامة ولا اعتماد', async () => {
  for (const role of ['customer', 'trader']) {
    if (role === 'trader') continue; // trader غير مزروع كدور؛ يُعامل كـ customer في الواجهات الحالية
    assert.ok(await can([role], 'statements.view_own'));
    for (const p of ['statements.view', 'ledger.view', 'payments.approve', 'pricing.update', 'accounting.integrity_check', 'audit.view'])
      assert.ok(!(await can([role], p)), `${role} يجب ألا يملك ${p}`);
  }
});
test('السائق: لا صلاحيات مالية إطلاقًا', async () => {
  for (const p of Object.keys(PERMISSIONS)) assert.ok(!(await can(['driver'], p)), `driver يجب ألا يملك ${p}`);
});
test('مدير النظام: كل الصلاحيات', async () => {
  for (const p of Object.keys(PERMISSIONS)) assert.ok(await can(['admin'], p), p);
});
test('سحب صريح لصلاحية من دور يمنحها', async () => {
  assert.ok(!(await can(['accountant'], 'payments.approve', [{ permission_code: 'payments.approve', granted: false }])));
});
test('29) محاولة تجاوز الصلاحية مباشرة عبر API: تُرفض 403 وتُسجَّل PERMISSION_DENIED', async () => {
  const env = makeEnv({ roles: ['sales'] });
  const r = await env.run('payments.approve');
  assert.strictEqual(r.allowed, false);
  assert.strictEqual(r.status, 403);
  assert.strictEqual(env.audit.length, 1);
  assert.strictEqual(env.audit[0][1].includes('payments.approve'), true);
});
test('أي صلاحية من القائمة تكفي (OR)', async () => {
  assert.ok((await makeEnv({ roles: ['sales'] }).run('payments.approve', 'pricing.create')).allowed);
});

// ───── فحص ثابت: كل مسار مالي محمي بـ requirePermission وليس بالدور فقط ─────
const read = (f) => fs.readFileSync(path.join(__dirname, '../src/modules', f), 'utf8');
test('مسارات المحاسبة/الدفع/الدفتر: لا requireRoles، وكل مسار تعديل له requirePermission', () => {
  for (const f of ['accounting/accounting.routes.js', 'payments/payments.routes.js', 'customers/ledger.routes.js', 'accounting/order-fulfillment.routes.js']) {
    const src = read(f);
    assert.ok(!/requireRoles\(/.test(src.replace(/const \{[^}]*\} = require[^\n]*/g, '')), `${f} يستخدم requireRoles`);
    for (const line of src.split('\n').filter((l) => /router\.(post|patch|put|delete)\(/.test(l))) {
      if (/'\/me|my-statement/.test(line)) continue;
      assert.ok(/requirePermission\(/.test(line), `${f}: مسار تعديل بلا صلاحية: ${line.trim()}`);
    }
  }
});
test('كل صلاحية مذكورة في المسارات معرّفة في قائمة الصلاحيات', () => {
  const used = new Set();
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) return walk(p);
    if (!/\.routes\.js$/.test(e.name)) return;
    for (const m of fs.readFileSync(p, 'utf8').matchAll(/requirePermission\(([^)]*)\)/g)) for (const c of m[1].matchAll(/'([^']+)'/g)) used.add(c[1]);
  });
  walk(path.join(__dirname, '../src/modules'));
  for (const c of used) assert.ok(PERMISSIONS[c], `صلاحية غير معرّفة: ${c}`);
  assert.ok(used.size > 15);
});
test('30) كشف حساب العميل يُحدَّد من هوية التوكن فقط (لا معامل customerId من الطلب)', async () => {
  const seen = [];
  install({ pool: {}, query: async (sql, params) => { seen.push({ sql, params }); return { rows: [] }; } });
  clearModules('src/modules/accounting/accounting-statements.service.js');
  const svc = require('../src/modules/accounting/accounting-statements.service');
  const r = await svc.getCustomerStatementByUserId('U-OWNER', {});
  assert.strictEqual(r, null);
  assert.deepStrictEqual(seen[0].params, ['U-OWNER']);
  assert.ok(/WHERE c\.user_id = \$1/.test(seen[0].sql));
  const ctl = read('accounting/accounting-statements.controller.js');
  const my = ctl.slice(ctl.indexOf('const myStatement'), ctl.indexOf('const myStatementPrint'));
  assert.ok(!/req\.params|req\.query\.customer/.test(my));
});
