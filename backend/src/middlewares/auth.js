const { verifyAccess } = require('../utils/jwt');
const { query } = require('../config/db');
const response = require('../utils/response');

const authenticate = async (req, res, next) => {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return response.error(res, 'غير مصرح', 401, 'UNAUTHORIZED');
    }

    const token = auth.substring(7);
    const payload = verifyAccess(token);

    const result = await query(
      `SELECT u.id, u.full_name, u.phone, u.user_type, u.status,
              COALESCE(json_agg(r.name) FILTER (WHERE r.name IS NOT NULL), '[]') AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE u.id = $1
       GROUP BY u.id`,
      [payload.userId]
    );

    if (result.rows.length === 0 || result.rows[0].status !== 'active') {
      return response.error(res, 'الحساب غير نشط', 401, 'UNAUTHORIZED');
    }

    req.user = result.rows[0];
    req.roles = result.rows[0].roles;
    next();
  } catch (err) {
    next(err);
  }
};

const requireRoles = (...allowed) => (req, res, next) => {
  const userRoles = req.roles || [];
  const ok = userRoles.some((r) => allowed.includes(r) || r === 'admin');
  if (!ok) return response.error(res, 'ممنوع', 403, 'FORBIDDEN');
  next();
};

module.exports = { authenticate, requireRoles };
