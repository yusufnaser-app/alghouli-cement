const { query } = require('../../config/db');

const listAll = async () => {
  const r = await query(`SELECT key, value, group_name FROM settings ORDER BY group_name, key`);
  return r.rows;
};

const getPublic = async () => {
  const r = await query(
    `SELECT key, value FROM settings
     WHERE group_name IN ('general') OR key IN ('company_name','company_phone','company_whatsapp','company_email')`
  );
  const obj = {};
  r.rows.forEach(row => { obj[row.key] = row.value; });
  return obj;
};

const getByKey = async (key) => {
  const r = await query(`SELECT value FROM settings WHERE key = $1`, [key]);
  return r.rows[0]?.value || null;
};

const update = async (settings, userId) => {
  for (const s of settings) {
    await query(
      `INSERT INTO settings (key, value, group_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [s.key, s.value, s.groupName || 'general']
    );
  }
  return listAll();
};

const create = async (data) => {
  const r = await query(
    `INSERT INTO settings (key, value, group_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
     RETURNING *`,
    [data.key, data.value, data.groupName || 'general']
  );
  return r.rows[0];
};

const remove = async (key) => {
  const r = await query(`DELETE FROM settings WHERE key = $1 RETURNING key`, [key]);
  return r.rows.length > 0;
};

module.exports = { listAll, getPublic, getByKey, update, create, remove };
