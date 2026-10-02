const { verifyAccess } = require('../utils/jwt');
const { query } = require('../config/db');
const response = require('../utils/response');
const { ROLE_PERMISSIONS } = require('../modules/auth/permissions');

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

/**
 * الصلاحيات الفعلية للمستخدم = (صلاحيات أدواره) + (منح صريح) − (سحب صريح).
 * admin = '*'. إن لم تكن جداول الصلاحيات موجودة بعد (قبل m29) نستخدم المصفوفة الافتراضية.
 */
const loadPermissions = async (req) => {
  if (req.permissions) return req.permissions;
  const roles = req.roles || [];
  const perms = new Set();
  if (roles.includes('admin')) {
    perms.add('*');
    req.permissions = perms;
    return perms;
  }
  try {
    const rp = await query(
      `SELECT DISTINCT rp.permission_code
       FROM user_roles ur JOIN role_permissions rp ON rp.role_id = ur.role_id
       WHERE ur.user_id = $1`, [req.user.id]);
    rp.rows.forEach((r) => perms.add(r.permission_code));
    const up = await query(
      `SELECT permission_code, granted FROM user_permissions WHERE user_id = $1`, [req.user.id]);
    up.rows.forEach((r) => (r.granted ? perms.add(r.permission_code) : perms.delete(r.permission_code)));
  } catch (err) {
    if (err && err.code === '42P01') {
      roles.forEach((r) => (ROLE_PERMISSIONS[r] || []).forEach((p) => perms.add(p)));
    } else {
      throw err;
    }
  }
  req.permissions = perms;
  return perms;
};

/** يتحقق في الـ Backend من: user → roles → permission (أي واحدة من الصلاحيات المذكورة تكفي). */
const requirePermission = (...codes) => async (req, res, next) => {
  try {
    const perms = await loadPermissions(req);
    if (perms.has('*') || codes.some((c) => perms.has(c))) return next();
    // تسجيل محاولة التجاوز (لا يُفشل الطلب إن تعذّر التسجيل)
    query(
      `INSERT INTO audit_logs (user_id, action, entity_type, new_values, ip_address, user_agent)
       VALUES ($1, 'PERMISSION_DENIED', 'api', $2, $3, $4)`,
      [req.user.id, JSON.stringify({ required: codes, method: req.method, path: req.originalUrl }),
        req.ip || null, String(req.headers['user-agent'] || '').slice(0, 300)]
    ).catch(() => {});
    return response.error(res, 'ممنوع: لا تملك الصلاحية المطلوبة', 403, 'FORBIDDEN');
  } catch (err) {
    return next(err);
  }
};

module.exports = { authenticate, requireRoles, requirePermission, loadPermissions };
