const { query } = require('../../config/db');

const create = async (userId, data) => {
  const r = await query(
    `INSERT INTO notifications (user_id, title_ar, body_ar, type, reference_type, reference_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [userId, data.titleAr, data.bodyAr, data.type, data.referenceType || null, data.referenceId || null]
  );
  return r.rows[0];
};

const listByUser = async (userId, filters = {}) => {
  let sql = `SELECT * FROM notifications WHERE user_id = $1`;
  const params = [userId];
  if (filters.unreadOnly === 'true') {
    sql += ` AND is_read = FALSE`;
  }
  sql += ` ORDER BY sent_at DESC LIMIT 100`;
  const r = await query(sql, params);
  return r.rows;
};

const unreadCount = async (userId) => {
  const r = await query(
    `SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = FALSE`,
    [userId]
  );
  return parseInt(r.rows[0].count, 10);
};

const markRead = async (id, userId) => {
  const r = await query(
    `UPDATE notifications SET is_read = TRUE, read_at = NOW()
     WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, userId]
  );
  return r.rows.length > 0;
};

const markAllRead = async (userId) => {
  await query(
    `UPDATE notifications SET is_read = TRUE, read_at = NOW()
     WHERE user_id = $1 AND is_read = FALSE`,
    [userId]
  );
};

const remove = async (id, userId) => {
  const r = await query(
    `DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, userId]
  );
  return r.rows.length > 0;
};

// Helper: إرسال إشعار لصاحب الطلب
const notifyOrderStatus = async (orderId, type, titleAr, bodyAr) => {
  const r = await query(
    `SELECT c.user_id FROM orders o
     JOIN customers c ON c.id = o.customer_id
     WHERE o.id = $1`,
    [orderId]
  );
  if (r.rows.length === 0) return;
  return create(r.rows[0].user_id, {
    titleAr, bodyAr, type,
    referenceType: 'order',
    referenceId: orderId,
  });
};

module.exports = { create, listByUser, unreadCount, markRead, markAllRead, remove, notifyOrderStatus };
