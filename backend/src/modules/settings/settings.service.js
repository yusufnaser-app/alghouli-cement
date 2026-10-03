'use strict';
const { query } = require('../../config/db');
const { encrypt, decrypt, mask, isSecretField } = require('../../utils/secret-box');
const { getRegistry, getProvider } = require('./providers.registry');

// ═══ الأساسيات ═══
const listAll = async () => {
  const r = await query(
    `SELECT key, value, group_name FROM settings
     WHERE group_name NOT IN ('branding','providers')
     ORDER BY group_name, key`
  );
  return r.rows;
};

const getPublic = async () => {
  const r = await query(
    `SELECT key, value FROM settings
     WHERE group_name = 'general'
        OR key IN ('company_name','company_phone','company_whatsapp','company_email','default_currency')
        OR group_name = 'branding'`
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
    if (s.key.startsWith('brand.') && !s.key.startsWith('brand.')) continue;
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

// ═══ الهوية ═══
const getBranding = async () => {
  const r = await query(
    `SELECT key, value FROM settings WHERE group_name = 'branding' OR key LIKE 'brand.%'`
  );
  const obj = {
    primary_color: '#1a3a5c',
    secondary_color: '#d4a574',
    logo_url: '',
    favicon_url: '',
    login_image_url: '',
    home_banner_url: '',
    company_name: 'مؤسسة الغولي',
  };
  r.rows.forEach(row => {
    const k = row.key.replace(/^brand\./, '');
    obj[k] = row.value;
  });
  return obj;
};

const updateBranding = async (data, userId) => {
  const fields = ['primary_color','secondary_color','logo_url','favicon_url','login_image_url','home_banner_url','company_name'];
  for (const f of fields) {
    if (data[f] !== undefined) {
      await query(
        `INSERT INTO settings (key, value, group_name)
         VALUES ($1, $2, 'branding')
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [`brand.${f}`, String(data[f])]
      );
    }
  }
  return getBranding();
};

// ═══ المزودون ═══
const listProviders = async () => {
  const registry = getRegistry();
  const r = await query(`SELECT name, config, enabled, updated_at FROM settings_providers`);
  const stored = {};
  r.rows.forEach(row => { stored[row.name] = row; });

  return Object.entries(registry).map(([name, def]) => {
    const s = stored[name] || { config: {}, enabled: false };
    const config = {};
    for (const field of def.fields) {
      const raw = s.config?.[field.key];
      if (field.secret && raw) {
        // فك التشفير ثم أخفِ
        const dec = decrypt(raw);
        config[field.key] = dec ? mask(dec) : '';
        config[`${field.key}_has_value`] = true;
      } else if (!field.secret) {
        config[field.key] = raw || '';
      }
    }
    return {
      name,
      label_ar: def.label_ar,
      description_ar: def.description_ar,
      fields: def.fields,
      config,
      enabled: s.enabled || false,
      updated_at: s.updated_at,
    };
  });
};

const updateProvider = async (name, newConfig, userId) => {
  const def = getProvider(name);
  if (!def) {
    const e = new Error(`المزود ${name} غير معروف`); e.status = 400; throw e;
  }

  // اقرأ الحالي
  const cur = await query(`SELECT config, enabled FROM settings_providers WHERE name = $1`, [name]);
  const current = cur.rows[0] || { config: {}, enabled: false };

  const merged = { ...current.config };
  for (const field of def.fields) {
    const val = newConfig[field.key];
    if (val === undefined) continue;
    if (field.secret) {
      // إذا القيمة تحتوي •••• → احتفظ بالقديمة
      if (typeof val === 'string' && val.startsWith('••••')) continue;
      if (val === '') { merged[field.key] = ''; continue; }
      merged[field.key] = encrypt(String(val));
    } else {
      merged[field.key] = String(val);
    }
  }

  await query(
    `INSERT INTO settings_providers (name, config, enabled, updated_at, updated_by)
     VALUES ($1, $2::jsonb, $3, NOW(), $4)
     ON CONFLICT (name) DO UPDATE
       SET config = EXCLUDED.config,
           enabled = EXCLUDED.enabled,
           updated_at = NOW(),
           updated_by = EXCLUDED.updated_by`,
    [name, JSON.stringify(merged), newConfig.enabled ?? current.enabled ?? false, userId]
  );

  return listProviders();
};

// يُستخدم من داخل الخدمات الأخرى (SMS, FCM)
const getProviderConfig = async (name) => {
  const def = getProvider(name);
  if (!def) return null;
  const r = await query(`SELECT config, enabled FROM settings_providers WHERE name = $1`, [name]);
  if (!r.rows.length) return null;
  const row = r.rows[0];
  const config = {};
  for (const field of def.fields) {
    const raw = row.config?.[field.key];
    if (field.secret && raw) {
      config[field.key] = decrypt(raw);
    } else {
      config[field.key] = raw;
    }
  }
  return { config, enabled: row.enabled };
};

module.exports = {
  listAll, getPublic, getByKey, update, create, remove,
  getBranding, updateBranding,
  listProviders, updateProvider, getProviderConfig,
};
