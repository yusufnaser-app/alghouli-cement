'use strict';
const bcrypt = require('bcryptjs');
const { pool, query } = require('../../config/db');

const ALLOWED_STAFF_ROLES = ['admin', 'accountant', 'sales', 'transport', 'loading', 'auditor', 'inventory', 'pos'];
const USER_TYPES = ['staff', 'driver', 'customer'];

// ═══ قائمة المستخدمين ═══
const listUsers = async (filters = {}) => {
  let sql = `
    SELECT u.id, u.full_name, u.phone, u.email, u.user_type, u.status,
           u.account_status, u.created_at, u.last_login_at,
           COALESCE(json_agg(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL), '[]') AS roles
    FROM users u
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    LEFT JOIN roles r ON r.id = ur.role_id
    WHERE 1=1
  `;
  const params = [];

  if (filters.userType) {
    params.push(filters.userType);
    sql += ` AND u.user_type = $${params.length}`;
  }
  if (filters.status) {
    params.push(filters.status);
    sql += ` AND u.status = $${params.length}`;
  }
  if (filters.search) {
    params.push(`%${filters.search}%`);
    sql += ` AND (u.full_name ILIKE $${params.length} OR u.phone LIKE $${params.length})`;
  }
  if (filters.role) {
    params.push(filters.role);
    sql += ` AND EXISTS (SELECT 1 FROM user_roles ur2 JOIN roles r2 ON r2.id = ur2.role_id WHERE ur2.user_id = u.id AND r2.name = $${params.length})`;
  }

  sql += ` GROUP BY u.id ORDER BY u.created_at DESC LIMIT 500`;
  const r = await query(sql, params);
  return r.rows;
};

// ═══ إنشاء مستخدم جديد ═══
const createUser = async (data, createdBy) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // تحقق
    if (!data.full_name || data.full_name.trim().length < 3) {
      const e = new Error('الاسم قصير جدًا'); e.status = 400; throw e;
    }
    if (!data.phone || !/^\d{9,15}$/.test(data.phone)) {
      const e = new Error('رقم الجوال غير صحيح'); e.status = 400; throw e;
    }
    if (!USER_TYPES.includes(data.user_type)) {
      const e = new Error('نوع المستخدم غير مدعوم'); e.status = 400; throw e;
    }

    // هل الرقم مستخدم؟
    const exists = await client.query(`SELECT id FROM users WHERE phone = $1`, [data.phone]);
    if (exists.rows.length) {
      const e = new Error('رقم الجوال مستخدم مسبقًا'); e.status = 409; throw e;
    }

    // كلمة مرور مؤقتة (إن لم تُعطَ)
    const tempPass = data.password || Math.random().toString(36).slice(-10);
    const hash = await bcrypt.hash(tempPass, 10);

    const ins = await client.query(
      `INSERT INTO users (full_name, phone, email, password_hash, user_type, status, account_status, otp_verified, phone_verified_at)
       VALUES ($1, $2, $3, $4, $5, 'active', 'active', TRUE, NOW())
       RETURNING id, full_name, phone, email, user_type, status`,
      [data.full_name.trim(), data.phone.trim(), data.email || null, hash, data.user_type]
    );
    const user = ins.rows[0];

    // الأدوار
    const roles = data.roles || (data.user_type === 'staff' ? ['sales'] : data.user_type === 'driver' ? ['driver'] : ['customer']);
    for (const roleName of roles) {
      await client.query(
        `INSERT INTO user_roles (user_id, role_id)
         SELECT $1, id FROM roles WHERE name = $2
         ON CONFLICT DO NOTHING`,
        [user.id, roleName]
      );
    }

    await client.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values)
       VALUES ($1, 'USER_CREATED', 'users', $2, $3)`,
      [createdBy, user.id, JSON.stringify({ phone: user.phone, user_type: user.user_type, roles })]
    );

    await client.query('COMMIT');
    return { user, temp_password: data.password ? null : tempPass };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ═══ تعديل مستخدم ═══
const updateUser = async (userId, data, updatedBy) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const u = await client.query(`SELECT * FROM users WHERE id = $1`, [userId]);
    if (!u.rows.length) { const e = new Error('المستخدم غير موجود'); e.status = 404; throw e; }
    const old = u.rows[0];

    // منع تعديل الذات في الحالة
    if (data.status && userId === updatedBy && data.status !== 'active') {
      const e = new Error('لا يمكنك تعطيل حسابك'); e.status = 400; throw e;
    }

    const updates = [];
    const params = [];
    if (data.full_name) { params.push(data.full_name.trim()); updates.push(`full_name = $${params.length}`); }
    if (data.email !== undefined) { params.push(data.email || null); updates.push(`email = $${params.length}`); }
    if (data.status) { params.push(data.status); updates.push(`status = $${params.length}`); }
    if (data.account_status) { params.push(data.account_status); updates.push(`account_status = $${params.length}`); }

    if (updates.length) {
      params.push(userId);
      await client.query(
        `UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`,
        params
      );
    }

    await client.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values)
       VALUES ($1, 'USER_UPDATED', 'users', $2, $3, $4)`,
      [updatedBy, userId, JSON.stringify({ status: old.status, email: old.email }), JSON.stringify(data)]
    );

    await client.query('COMMIT');
    return { id: userId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ═══ تغيير الأدوار ═══
const setRoles = async (userId, roles, updatedBy) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const u = await client.query(`SELECT id, user_type FROM users WHERE id = $1`, [userId]);
    if (!u.rows.length) { const e = new Error('المستخدم غير موجود'); e.status = 404; throw e; }

    // لا يمكن نزع دور admin من آخر admin
    const adminCount = await client.query(
      `SELECT COUNT(*)::int AS c FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE r.name = 'admin'`
    );
    const hasAdminRole = await client.query(
      `SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1 AND r.name = 'admin'`,
      [userId]
    );
    const removingAdmin = hasAdminRole.rows.length > 0 && !roles.includes('admin');
    if (removingAdmin && adminCount.rows[0].c <= 1) {
      const e = new Error('لا يمكن إزالة آخر admin من النظام'); e.status = 400; throw e;
    }

    // احذف الأدوار القديمة
    await client.query(`DELETE FROM user_roles WHERE user_id = $1`, [userId]);

    // أضف الجديدة
    for (const roleName of roles) {
      await client.query(
        `INSERT INTO user_roles (user_id, role_id)
         SELECT $1, id FROM roles WHERE name = $2
         ON CONFLICT DO NOTHING`,
        [userId, roleName]
      );
    }

    await client.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values)
       VALUES ($1, 'USER_ROLES_CHANGED', 'users', $2, $3)`,
      [updatedBy, userId, JSON.stringify({ roles })]
    );

    await client.query('COMMIT');
    return { id: userId, roles };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ═══ تفعيل/إيقاف ═══
const setStatus = async (userId, status, updatedBy) => {
  if (!['active', 'inactive', 'suspended', 'blocked'].includes(status)) {
    const e = new Error('حالة غير مدعومة'); e.status = 400; throw e;
  }
  if (userId === updatedBy && status !== 'active') {
    const e = new Error('لا يمكنك تعطيل حسابك'); e.status = 400; throw e;
  }

  await query(
    `UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2`,
    [status, userId]
  );
  await query(
    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values)
     VALUES ($1, 'USER_STATUS_CHANGED', 'users', $2, $3)`,
    [updatedBy, userId, JSON.stringify({ status })]
  );
  return { id: userId, status };
};

// ═══ إعادة تعيين كلمة المرور ═══
const resetPassword = async (userId, newPassword, updatedBy) => {
  if (!newPassword || newPassword.length < 6) {
    const e = new Error('كلمة المرور قصيرة (6 أحرف على الأقل)'); e.status = 400; throw e;
  }
  const hash = await bcrypt.hash(newPassword, 10);
  await query(`UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [hash, userId]);
  await query(
    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values)
     VALUES ($1, 'USER_PASSWORD_RESET', 'users', $2, $3)`,
    [updatedBy, userId, JSON.stringify({ at: new Date().toISOString() })]
  );
  return { id: userId };
};

// ═══ قائمة الأدوار المتاحة ═══
const listRoles = async () => {
  const r = await query(
    `SELECT r.id, r.name, r.name_ar,
            COALESCE((SELECT COUNT(*)::int FROM role_permissions rp WHERE rp.role_id = r.id), 0) AS permission_count
     FROM roles r ORDER BY r.name`
  );
  return r.rows;
};


// ═══ تفاصيل المستخدم + Audit Log ═══
const getUserDetails = async (userId) => {
  const u = await query(`
    SELECT u.*,
           COALESCE(json_agg(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL), '[]') AS roles,
           COALESCE(json_agg(DISTINCT jsonb_build_object('code', up.permission_code, 'granted', up.granted))
             FILTER (WHERE up.permission_code IS NOT NULL), '[]') AS user_permissions
    FROM users u
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    LEFT JOIN roles r ON r.id = ur.role_id
    LEFT JOIN user_permissions up ON up.user_id = u.id
    WHERE u.id = $1
    GROUP BY u.id
  `, [userId]);
  if (!u.rows.length) { const e = new Error('المستخدم غير موجود'); e.status = 404; throw e; }
  const logs = await query(`
    SELECT al.id, al.action, al.entity_type, al.entity_id,
           al.old_values, al.new_values, al.created_at,
           u2.full_name AS by_name
    FROM audit_logs al
    LEFT JOIN users u2 ON u2.id = al.user_id
    WHERE al.entity_type = 'users' AND al.entity_id = $1
    ORDER BY al.created_at DESC LIMIT 50
  `, [userId]).catch(() => ({ rows: [] }));
  return { user: u.rows[0], audit_log: logs.rows };
};

// ═══ منح/سحب صلاحية ═══
const grantPermission = async (userId, code, granted, byUser) => {
  await query(`
    INSERT INTO user_permissions (user_id, permission_code, granted, granted_by)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (user_id, permission_code)
    DO UPDATE SET granted = EXCLUDED.granted, granted_by = EXCLUDED.granted_by, granted_at = NOW()
  `, [userId, code, granted, byUser]);
  await query(`
    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values)
    VALUES ($1, $2, 'user_permissions', $3, $4)
  `, [byUser, granted ? 'PERMISSION_GRANTED' : 'PERMISSION_REVOKED', userId, JSON.stringify({ code })]);
  return { userId, code, granted };
};

const listAllPermissions = async () => {
  const r = await query(`SELECT code, name_ar FROM permissions ORDER BY code`);
  return r.rows;
};

module.exports = { listUsers, createUser, updateUser, setRoles, setStatus, resetPassword, listRoles, getUserDetails, grantPermission, listAllPermissions };
