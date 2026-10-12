'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { install, clearModules } = require('./helpers');

const norm = (s) => s.replace(/\s+/g, ' ').trim();
const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

const mkDb = (customerRow) => {
  const log = [];
  const client = {
    query: async (sql, params = []) => {
      const s = norm(sql); log.push({ s, params });
      if (/^(BEGIN|COMMIT|ROLLBACK)/.test(s)) return { rows: [] };
      if (/^SELECT id, credit_limit FROM customers/.test(s)) return { rows: customerRow ? [customerRow] : [] };
      if (/^UPDATE customers SET credit_limit/.test(s)) return { rows: [{ id: params[1], credit_limit: params[0] }] };
      if (/^INSERT INTO audit_logs/.test(s)) return { rows: [] };
      return { rows: [] };
    },
    release() {},
  };
  install({ pool: { connect: async () => client }, query: async () => ({ rows: [] }) });
  clearModules('src/modules/admin/admin.service.js', 'src/modules/audit/audit.service.js');
  return { svc: require('../src/modules/admin/admin.service'), log };
};

test('G6-1) تعديل الحد: UPDATE + تدقيق بالقيمة القديمة والجديدة والسبب داخل المعاملة', async () => {
  const { svc, log } = mkDb({ id: 'c1', credit_limit: '1000000.00' });
  const r = await svc.setCustomerCreditLimit('c1', 5000000, 'u1', { reason: 'تاجر موثوق', ip: '1.1.1.1' });
  assert.strictEqual(r.credit_limit, 5000000);
  assert.strictEqual(log[0].s, 'BEGIN');
  assert.match(log[1].s, /SELECT id, credit_limit FROM customers WHERE id = \$1 FOR UPDATE/);
  const audit = log.find((l) => /^INSERT INTO audit_logs/.test(l.s));
  assert.strictEqual(audit.params[1], 'CUSTOMER_CREDIT_LIMIT_CHANGED');
  assert.strictEqual(JSON.parse(audit.params[4]).credit_limit, '1000000.00');
  assert.strictEqual(JSON.parse(audit.params[5]).credit_limit, 5000000);
  assert.strictEqual(audit.params[6], 'تاجر موثوق');
  assert.strictEqual(log[log.length - 1].s, 'COMMIT');
});

test('G6-2) عميل غير موجود: 404 وROLLBACK بلا UPDATE ولا تدقيق', async () => {
  const { svc, log } = mkDb(null);
  await assert.rejects(svc.setCustomerCreditLimit('zz', 1, 'u1', { reason: 'abc' }), { status: 404 });
  assert.ok(!log.some((l) => /^UPDATE customers/.test(l.s)));
  assert.ok(!log.some((l) => /^INSERT INTO audit_logs/.test(l.s)));
  assert.strictEqual(log[log.length - 1].s, 'ROLLBACK');
});

test('G6-3) قائمة العملاء تعيد حد الائتمان وإجراء التجاوز وعدد السقوف', () => {
  const s = read('src/modules/admin/admin.service.js');
  assert.match(s, /c\.credit_limit, c\.ceiling_action/);
  assert.match(s, /COUNT\(\*\) FROM order_ceilings oc WHERE oc\.customer_id = c\.id AND oc\.is_active\)::int AS ceilings_count/);
});

test('G6-4) المسار بصلاحية المالية، والمتحكم يرفض حدًا سالبًا وسببًا قصيرًا', () => {
  assert.match(read('src/modules/admin/admin.routes.js'), /router\.patch\('\/customers\/:customerId\/credit', requirePermission\('ledger\.adjust'\)/);
  const c = read('src/modules/admin/admin.controller.js');
  assert.match(c, /creditLimit: z\.number\(\)\.min\(0\)/);
  assert.match(c, /reason: z\.string\(\)\.trim\(\)\.min\(3/);
});
