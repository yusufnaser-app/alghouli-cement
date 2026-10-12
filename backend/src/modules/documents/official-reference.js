'use strict';
const { query } = require('../../config/db');

/**
 * المرجع الرسمي من YemenSoft: mapping بحالة SYNCED ومرجع غير فارغ فقط.
 * PENDING/FAILED/بلا مرجع ⇒ لا مرجع رسمي ⇒ لا تُسمّى الوثيقة «فاتورة».
 * @param {Array<string>} entityTypes  مثل ['invoice','order']
 * @param {Array<string>} ids         معرّفات محلية (فاتورة/طلب)
 */
const lookupOfficialReference = async (entityTypes, ids, runner = { query }) => {
  const clean = (ids || []).filter(Boolean);
  if (!clean.length) return null;
  const r = await runner.query(
    `SELECT accounting_reference FROM accounting_mappings
     WHERE accounting_system = 'yemensoft' AND entity_type = ANY($1::text[]) AND local_entity_id = ANY($2::uuid[])
       AND sync_status = 'SYNCED' AND accounting_reference IS NOT NULL AND accounting_reference <> ''
     ORDER BY last_synced_at DESC NULLS LAST LIMIT 1`,
    [entityTypes, clean]
  );
  return r.rows[0] ? r.rows[0].accounting_reference : null;
};

module.exports = { lookupOfficialReference };
