const { query } = require('../../config/db');
const { getProvider } = require('../../services/sms-provider');
const { extractPlaceholders } = require('../../services/sms.service');

const MAX_RETRIES = 5;

const listMessages = async ({ status, limit = 100 } = {}) => {
  const params = [];
  let where = '';
  if (status) { params.push(status); where = `WHERE status = $1`; }
  params.push(Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500));
  const r = await query(
    `SELECT * FROM sms_messages ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
    params
  );
  const counts = await query(`SELECT status, COUNT(*)::int AS n FROM sms_messages GROUP BY status`);
  const summary = {};
  counts.rows.forEach((c) => { summary[c.status] = c.n; });
  return { messages: r.rows, summary };
};

// محاولة إرسال رسالة واحدة عبر المزود. الفشل يُسجَّل ولا يرمي (بند 46)
const attemptSend = async (msg) => {
  const provider = getProvider();
  await query(`UPDATE sms_messages SET status = 'sending', last_attempt_at = NOW() WHERE id = $1`, [msg.id]);
  try {
    const res = await provider.send(msg.phone, msg.message);
    await query(
      `UPDATE sms_messages SET status = 'sent', sent_at = NOW(), provider_message_id = $2, error_message = NULL WHERE id = $1`,
      [msg.id, res?.providerMessageId || null]
    );
    return { id: msg.id, success: true };
  } catch (err) {
    await query(
      `UPDATE sms_messages SET status = 'failed', retry_count = retry_count + 1, error_message = $2 WHERE id = $1`,
      [msg.id, String(err.message).slice(0, 500)]
    );
    return { id: msg.id, success: false, error: err.message };
  }
};

const retryMessage = async (id) => {
  const r = await query(`SELECT * FROM sms_messages WHERE id = $1`, [id]);
  if (!r.rows.length) { const e = new Error('الرسالة غير موجودة'); e.status = 404; throw e; }
  if (r.rows[0].status === 'sent' || r.rows[0].status === 'delivered') {
    const e = new Error('الرسالة أُرسلت سابقًا'); e.status = 400; throw e;
  }
  return attemptSend(r.rows[0]);
};

// معالجة دفعة من الرسائل المعلّقة/الفاشلة التي لم تتجاوز الحد الأقصى للمحاولات
const processPending = async (limit = 50) => {
  const r = await query(
    `SELECT * FROM sms_messages
     WHERE status IN ('pending', 'failed') AND retry_count < $1
     ORDER BY created_at ASC LIMIT $2`,
    [MAX_RETRIES, limit]
  );
  const results = [];
  for (const m of r.rows) results.push(await attemptSend(m));
  return { processed: results.length, sent: results.filter((x) => x.success).length, results };
};

const listTemplates = async () => (await query(`SELECT * FROM sms_templates ORDER BY template_key`)).rows;

const updateTemplate = async (id, d) => {
  const cur = await query(`SELECT * FROM sms_templates WHERE id = $1`, [id]);
  if (!cur.rows.length) { const e = new Error('القالب غير موجود'); e.status = 404; throw e; }
  const t = cur.rows[0];
  if (d.bodyTemplate !== undefined) {
    // منع متغيرات غير معرّفة (خطأ إملائي مثل {rout} كان سيُرسل حرفيًا للسائق)
    const allowed = t.variables || [];
    const bad = extractPlaceholders(d.bodyTemplate).filter((p) => !allowed.includes(p));
    if (bad.length) {
      const e = new Error(`متغيرات غير مسموحة: ${bad.join(', ')} — المسموح: ${allowed.join(', ')}`);
      e.status = 400; throw e;
    }
  }
  const r = await query(
    `UPDATE sms_templates SET
       body_template = COALESCE($2, body_template),
       title_ar = COALESCE($3, title_ar),
       is_active = COALESCE($4, is_active),
       updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [id, d.bodyTemplate ?? null, d.titleAr ?? null, d.isActive ?? null]
  );
  return r.rows[0];
};

module.exports = { listMessages, retryMessage, processPending, listTemplates, updateTemplate, MAX_RETRIES };
