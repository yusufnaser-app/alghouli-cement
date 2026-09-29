/**
 * خدمة SMS المركزية (بند 43-46):
 *  - القوالب من جدول sms_templates (يمكن تعديلها من الإدارة) مع نص احتياطي في الكود إن لم يوجد القالب.
 *  - فشل الرسالة لا يُفشل العملية الأساسية أبدًا (بند 46).
 *  - لا يوجد مزود SMS حقيقي مُهيَّأ بعد: الرسائل تبقى pending حتى يُضاف مزود. لا مفاتيح في Flutter.
 */
const { query: poolQuery } = require('../config/db');

// {name} → قيمة. يعيد النص والمتغيرات الناقصة (حتى لا تُرسل رسالة فيها {route} حرفيًا)
const renderTemplate = (body, vars = {}) => {
  const missing = [];
  const text = String(body).replace(/\{(\w+)\}/g, (m, k) => {
    if (vars[k] === undefined || vars[k] === null || vars[k] === '') { missing.push(k); return m; }
    return String(vars[k]);
  });
  return { text, missing };
};

const extractPlaceholders = (body) => [...new Set([...String(body).matchAll(/\{(\w+)\}/g)].map((m) => m[1]))];

/**
 * إدراج رسالة في الطابور بأمان.
 * @param {object} opts.client  عميل معاملة (اختياري). إن وُجد تُستخدم SAVEPOINT فلا تُفسد المعاملة الأم.
 * @returns {{queued:boolean, reason?:string}} لا يرمي أخطاءً أبدًا
 */
const queueSms = async ({ client = null, phone, templateKey, vars = {}, fallbackText = null,
  messageType, operationId = null, userId = null }) => {
  const run = client ? (s, p) => client.query(s, p) : (s, p) => poolQuery(s, p);
  const cleanPhone = phone ? String(phone).trim() : '';
  if (!cleanPhone) {
    console.warn(`SMS تجاوز: لا يوجد رقم هاتف (${messageType || templateKey})`);
    return { queued: false, reason: 'NO_PHONE' };
  }

  const sp = 'sms_queue_sp';
  try {
    if (client) await client.query(`SAVEPOINT ${sp}`);

    let message = null;
    if (templateKey) {
      try {
        const t = await run(
          `SELECT body_template FROM sms_templates WHERE template_key = $1 AND is_active = true`,
          [templateKey]
        );
        if (t.rows[0]) {
          const r = renderTemplate(t.rows[0].body_template, vars);
          if (r.missing.length === 0) message = r.text;
          else console.warn(`SMS قالب ${templateKey}: متغيرات ناقصة (${r.missing.join(', ')}) — استُخدم النص الاحتياطي`);
        }
      } catch (e) {
        // جدول القوالب غير موجود (m19 لم تُشغَّل) أو غيره: نكمل بالنص الاحتياطي
        if (client) await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
      }
    }
    if (!message) message = fallbackText;
    if (!message) {
      if (client) await client.query(`RELEASE SAVEPOINT ${sp}`);
      return { queued: false, reason: 'NO_MESSAGE' };
    }

    const type = messageType || templateKey || 'GENERAL';
    try {
      await run(
        `INSERT INTO sms_messages (user_id, phone, message_type, message, status, template_key, operation_id)
         VALUES ($1, $2, $3, $4, 'pending', $5, $6)`,
        [userId, cleanPhone, type, message, templateKey || null, operationId]
      );
    } catch (e) {
      if (e.code !== '42703') throw e; // أعمدة m21 غير موجودة بعد: نُدرج بالأعمدة القديمة فقط
      if (client) await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
      await run(
        `INSERT INTO sms_messages (phone, message_type, message, status) VALUES ($1, $2, $3, 'pending')`,
        [cleanPhone, type, message]
      );
    }
    if (client) await client.query(`RELEASE SAVEPOINT ${sp}`);
    return { queued: true };
  } catch (err) {
    if (client) {
      try { await client.query(`ROLLBACK TO SAVEPOINT ${sp}`); } catch (_) { /* تجاهل */ }
    }
    console.error('SMS queue error (تم تجاهله، العملية الأساسية نجحت):', err.message);
    return { queued: false, reason: 'ERROR', error: err.message };
  }
};

module.exports = { renderTemplate, extractPlaceholders, queueSms };
