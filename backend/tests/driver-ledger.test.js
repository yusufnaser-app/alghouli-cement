const test = require('node:test');
const assert = require('node:assert');
const { install, clearModules } = require('./helpers');

// عميل وهمي يحاكي معاملة: يُرجع الرصيد الحالي ويسجّل كل استعلام
const setup = (startBalance) => {
  const log = [];
  const client = {
    query: async (sql, params = []) => {
      log.push({ sql, params });
      if (/FOR UPDATE/.test(sql)) return { rows: [{ id: 'd1', current_balance: String(startBalance) }] };
      if (/^\s*INSERT INTO driver_ledger/.test(sql)) return { rows: [{ id: 'e1', driver_id: params[0], debit: params[4], credit: params[5] }] };
      return { rows: [] };
    },
    release() {},
  };
  install({ pool: { connect: async () => client }, query: async () => ({ rows: [] }) });
  clearModules('src/modules/drivers/driver-ledger.service.js');
  return { log, svc: require('../src/modules/drivers/driver-ledger.service') };
};

test('الدفعة تُنقص ما تدين به المؤسسة للسائق', async () => {
  const { svc } = setup(1000);
  const r = await svc.recordPayment('d1', { amount: 300 }, 'u1');
  assert.strictEqual(r.new_balance, 700);
});

test('السلفة تُنقص الرصيد (كانت تزيده — خطأ مُصلَح)', async () => {
  const { svc } = setup(1000);
  const r = await svc.recordAdvance('d1', { amount: 200 }, 'u1');
  assert.strictEqual(r.new_balance, 800);
});

test('الخصم يُنقص الرصيد (كان يزيده — خطأ مُصلَح)', async () => {
  const { svc } = setup(1000);
  const r = await svc.recordDeduction('d1', { amount: 150 }, 'u1');
  assert.strictEqual(r.new_balance, 850);
});

test('العملية داخل معاملة: BEGIN + قفل + COMMIT', async () => {
  const { svc, log } = setup(0);
  await svc.recordAdvance('d1', { amount: 50 }, 'u1');
  const sqls = log.map((l) => l.sql.trim().split(/\s+/)[0]);
  assert.strictEqual(sqls[0], 'BEGIN');
  assert.ok(log.some((l) => /FOR UPDATE/.test(l.sql)));
  assert.strictEqual(sqls[sqls.length - 1], 'COMMIT');
});

test('سائق غير موجود: ROLLBACK وخطأ 404', async () => {
  const log = [];
  const client = { query: async (sql) => { log.push(sql.trim().split(/\s+/)[0]); return { rows: [] }; }, release() {} };
  install({ pool: { connect: async () => client }, query: async () => ({ rows: [] }) });
  clearModules('src/modules/drivers/driver-ledger.service.js');
  const svc = require('../src/modules/drivers/driver-ledger.service');
  await assert.rejects(() => svc.recordPayment('x', { amount: 1 }, 'u'), (e) => e.status === 404);
  assert.ok(log.includes('ROLLBACK'));
});

test('السلفة والخصم والدفعة تُسجَّل كلها دائنًا (credit) وليس مدينًا — الإشارة متسقة مع الرصيد', async () => {
  for (const fn of ['recordPayment', 'recordAdvance', 'recordDeduction']) {
    const { svc, log } = setup(1000);
    await svc[fn]('d1', { amount: 100 }, 'u1');
    const ins = log.find((l) => /^\s*INSERT INTO driver_ledger/.test(l.sql));
    assert.strictEqual(ins.params[4], '0.00', `${fn}: debit`);
    assert.strictEqual(ins.params[5], '100.00', `${fn}: credit`);
  }
});
