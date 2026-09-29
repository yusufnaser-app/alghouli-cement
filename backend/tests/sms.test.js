const test = require('node:test');
const assert = require('node:assert');
const { install, clearModules } = require('./helpers');

// عميل معاملة وهمي: يسجّل الاستعلامات ويسمح بمحاكاة القوالب وأخطاء الإدراج
const makeClient = ({ template = null, templateError = false, insertError = null, legacyOnly = false } = {}) => {
  const log = [];
  const inserted = [];
  return {
    log, inserted,
    query: async (sql, params = []) => {
      const head = sql.trim().split(/\s+/)[0];
      log.push(head === 'SAVEPOINT' || head === 'ROLLBACK' || head === 'RELEASE' ? sql.trim() : head);
      if (/FROM sms_templates/.test(sql)) {
        if (templateError) throw new Error('relation "sms_templates" does not exist');
        return { rows: template ? [{ body_template: template }] : [] };
      }
      if (/INSERT INTO sms_messages/.test(sql)) {
        if (insertError) throw Object.assign(new Error(insertError.message), { code: insertError.code });
        if (legacyOnly && /template_key/.test(sql)) throw Object.assign(new Error('column does not exist'), { code: '42703' });
        inserted.push({ sql, params });
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
};

const load = () => {
  install({ pool: {}, query: async () => ({ rows: [] }) });
  clearModules('src/services/sms.service.js');
  return require('../src/services/sms.service');
};

test('renderTemplate: يستبدل المتغيرات ويُبلغ عن الناقص', () => {
  const { renderTemplate } = load();
  const r = renderTemplate('فاكس {fax_number} من {factory_name}', { fax_number: 'FX-1', factory_name: 'عمران' });
  assert.strictEqual(r.text, 'فاكس FX-1 من عمران');
  assert.deepStrictEqual(r.missing, []);
  const r2 = renderTemplate('خط {route} مبلغ {amount}', { route: 'أ' });
  assert.deepStrictEqual(r2.missing, ['amount']);
});

test('renderTemplate: القيمة صفر مقبولة وليست ناقصة', () => {
  const { renderTemplate } = load();
  assert.deepStrictEqual(renderTemplate('{q}', { q: 0 }).missing, []);
});

test('extractPlaceholders', () => {
  const { extractPlaceholders } = load();
  assert.deepStrictEqual(extractPlaceholders('{a} و{b} و{a}').sort(), ['a', 'b']);
});

test('queueSms: يستخدم القالب من قاعدة البيانات', async () => {
  const { queueSms } = load();
  const c = makeClient({ template: 'رقم {fax_number}' });
  const r = await queueSms({ client: c, phone: '967771111111', templateKey: 'FAX_ISSUED', vars: { fax_number: 'FX-9' }, fallbackText: 'احتياطي' });
  assert.strictEqual(r.queued, true);
  assert.strictEqual(c.inserted[0].params[3], 'رقم FX-9');
});

test('queueSms: نص احتياطي إن لم يوجد القالب أو نقصت متغيراته', async () => {
  const { queueSms } = load();
  let c = makeClient({ template: null });
  await queueSms({ client: c, phone: '1', templateKey: 'X', vars: {}, fallbackText: 'احتياطي' });
  assert.strictEqual(c.inserted[0].params[3], 'احتياطي');
  c = makeClient({ template: 'خط {route}' });
  await queueSms({ client: c, phone: '1', templateKey: 'X', vars: {}, fallbackText: 'احتياطي' });
  assert.strictEqual(c.inserted[0].params[3], 'احتياطي');
});

test('queueSms: جدول القوالب غير موجود ← يُكمل بالنص الاحتياطي مع ROLLBACK TO SAVEPOINT', async () => {
  const { queueSms } = load();
  const c = makeClient({ templateError: true });
  const r = await queueSms({ client: c, phone: '1', templateKey: 'X', fallbackText: 'احتياطي' });
  assert.strictEqual(r.queued, true);
  assert.ok(c.log.includes('ROLLBACK TO SAVEPOINT sms_queue_sp'));
});

test('queueSms: بلا هاتف لا يُدرج شيئًا ولا يرمي', async () => {
  const { queueSms } = load();
  const c = makeClient();
  for (const phone of [null, undefined, '', '   ']) {
    const r = await queueSms({ client: c, phone, templateKey: 'X', fallbackText: 'x' });
    assert.deepStrictEqual([r.queued, r.reason], [false, 'NO_PHONE']);
  }
  assert.strictEqual(c.inserted.length, 0);
});

test('queueSms: فشل الإدراج لا يرمي، ويتراجع لنقطة الحفظ (لا يُفسد المعاملة الأم)', async () => {
  const { queueSms } = load();
  const c = makeClient({ insertError: { message: 'boom', code: '23502' } });
  const r = await queueSms({ client: c, phone: '1', templateKey: 'X', fallbackText: 'x' });
  assert.strictEqual(r.queued, false);
  assert.ok(c.log.includes('ROLLBACK TO SAVEPOINT sms_queue_sp'));
});

test('queueSms: أعمدة m21 غير موجودة بعد ← يُدرج بالأعمدة القديمة', async () => {
  const { queueSms } = load();
  const c = makeClient({ template: 'ok {a}', legacyOnly: true });
  const r = await queueSms({ client: c, phone: '1', templateKey: 'X', vars: { a: 1 }, fallbackText: 'x' });
  assert.strictEqual(r.queued, true);
  assert.strictEqual(c.inserted.length, 1);
  assert.ok(!/template_key/.test(c.inserted[0].sql));
});

test('المزود الافتراضي: يرفض الإرسال بوضوح ولا يدّعي النجاح', async () => {
  const { getProvider } = require('../src/services/sms-provider');
  const p = getProvider();
  assert.strictEqual(await p.isConfigured(), false);
  await assert.rejects(() => p.send('1', 'x'), /لا يوجد مزود/);
});
