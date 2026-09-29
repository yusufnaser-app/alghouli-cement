const test = require('node:test');
const assert = require('node:assert');
const { install, clearModules } = require('./helpers');

const load = (handler) => {
  const calls = [];
  const q = async (sql, params = []) => { calls.push({ sql, params }); return handler(sql, params); };
  install({ pool: {}, query: q });
  clearModules('src/services/sms.service.js', 'src/modules/sms/sms-admin.service.js');
  return { calls, svc: require('../src/modules/sms/sms-admin.service') };
};

test('تعديل القالب: يرفض متغيرًا غير معرّف (خطأ إملائي)', async () => {
  const { svc } = load((sql) => (/SELECT \* FROM sms_templates/.test(sql)
    ? { rows: [{ id: 1, variables: ['route', 'amount'], body_template: 'x' }] } : { rows: [{}] }));
  await assert.rejects(() => svc.updateTemplate(1, { bodyTemplate: 'خط {rout} مبلغ {amount}' }), (e) => e.status === 400 && /rout/.test(e.message));
});

test('تعديل القالب: يقبل متغيرات معرّفة فقط', async () => {
  const { svc } = load((sql) => (/SELECT \* FROM sms_templates/.test(sql)
    ? { rows: [{ id: 1, variables: ['route', 'amount'], body_template: 'x' }] } : { rows: [{ id: 1 }] }));
  const r = await svc.updateTemplate(1, { bodyTemplate: 'خط {route} مبلغ {amount}' });
  assert.strictEqual(r.id, 1);
});

test('إعادة المحاولة بلا مزود: تصير failed وتزيد retry_count ولا ترمي', async () => {
  const { svc, calls } = load((sql) => (/SELECT \* FROM sms_messages WHERE id/.test(sql)
    ? { rows: [{ id: 'm1', status: 'failed', phone: '1', message: 'x' }] } : { rows: [] }));
  const r = await svc.retryMessage('m1');
  assert.strictEqual(r.success, false);
  assert.ok(calls.some((c) => /SET status = 'failed', retry_count = retry_count \+ 1/.test(c.sql)));
  assert.ok(!calls.some((c) => /SET status = 'sent'/.test(c.sql)));
});

test('لا تُعاد محاولة رسالة أُرسلت سابقًا', async () => {
  const { svc } = load(() => ({ rows: [{ id: 'm1', status: 'sent' }] }));
  await assert.rejects(() => svc.retryMessage('m1'), (e) => e.status === 400);
});

test('رسالة غير موجودة: 404', async () => {
  const { svc } = load(() => ({ rows: [] }));
  await assert.rejects(() => svc.retryMessage('x'), (e) => e.status === 404);
});
