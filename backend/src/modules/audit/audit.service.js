'use strict';
/**
 * سجل التدقيق. يُستدعى بنفس client الخاص بالمعاملة المالية، لذلك:
 *   لا عملية مالية بدون أثر، ولا أثر لعملية تم التراجع عنها (rollback).
 * الجدول audit_logs محمي في قاعدة البيانات من UPDATE/DELETE (Trigger في m29).
 */
const { query } = require('../../config/db');

/** معلومات الطلب (IP / الجهاز) إن توفرت. */
const requestContext = (req) => (req ? {
  ip: String(req.ip || '').slice(0, 64) || null,
  userAgent: req.headers ? String(req.headers['user-agent'] || '').slice(0, 300) : null,
} : {});

/**
 * @param {object|null} client  client المعاملة (أو null لاستخدام query العامة)
 * @param {object} e {userId, action, entityType, entityId, oldValues, newValues, reason, ip, userAgent, entityRef}
 */
const logAudit = async (client, e) => {
  const runner = client && typeof client.query === 'function' ? client : { query };
  await runner.query(
    `INSERT INTO audit_logs
       (user_id, action, entity_type, entity_id, old_values, new_values, reason, ip_address, user_agent, entity_ref)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [e.userId || null, e.action, e.entityType, e.entityId || null,
      e.oldValues === undefined ? null : JSON.stringify(e.oldValues),
      e.newValues === undefined ? null : JSON.stringify(e.newValues),
      e.reason || null, e.ip || null, e.userAgent || null, e.entityRef || null]
  );
};

const listAudit = async ({ entityType, entityId, userId, action, from, to, limit = 100, offset = 0 } = {}) => {
  const where = [];
  const params = [];
  const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
  if (entityType) add('a.entity_type = ?', entityType);
  if (entityId) add('a.entity_id = ?', entityId);
  if (userId) add('a.user_id = ?', userId);
  if (action) add('a.action = ?', action);
  if (from) add('a.created_at >= ?', from);
  if (to) add('a.created_at <= ?', to);
  params.push(Math.min(Number(limit) || 100, 500), Math.max(Number(offset) || 0, 0));
  const r = await query(
    `SELECT a.id, a.user_id, u.full_name AS user_name, a.action, a.entity_type, a.entity_id, a.entity_ref,
            a.old_values, a.new_values, a.reason, a.ip_address, a.user_agent, a.created_at
     FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY a.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  return r.rows;
};

module.exports = { logAudit, listAudit, requestContext };
