'use strict';
require('dotenv').config();
const { pool } = require('../src/config/db');

(async () => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    console.log('════════════════════════════════════════════');
    console.log('🚀 m30 — Part 26: branding + providers');
    console.log('════════════════════════════════════════════');

    // ═══ 1) صلاحيات جديدة ═══
    const newPerms = [
      ['settings.view', 'مشاهدة الإعدادات'],
      ['settings.manage', 'إدارة الإعدادات والهوية'],
      ['providers.manage', 'إدارة مزودي الخدمة'],
    ];
    for (const [code, desc] of newPerms) {
      await c.query(
        `INSERT INTO permissions (code, description_ar) VALUES ($1, $2)
         ON CONFLICT (code) DO NOTHING`,
        [code, desc]
      );
    }
    console.log('✅ صلاحيات جديدة:', newPerms.length);

    // ربط بـ admin (role_permissions يستخدم permission_code)
    await c.query(
      `INSERT INTO role_permissions (role_id, permission_code)
       SELECT r.id, p.code FROM roles r, permissions p
       WHERE r.name = 'admin'
         AND p.code IN ('settings.view','settings.manage','providers.manage')
       ON CONFLICT DO NOTHING`
    );
    console.log('✅ ربط بـ admin');

    // ═══ 2) جدول إعدادات المزودين ═══
    await c.query(`
      CREATE TABLE IF NOT EXISTS settings_providers (
        name VARCHAR(50) PRIMARY KEY,
        config JSONB NOT NULL DEFAULT '{}'::jsonb,
        enabled BOOLEAN DEFAULT FALSE,
        updated_at TIMESTAMP DEFAULT NOW(),
        updated_by UUID REFERENCES users(id)
      )
    `);
    console.log('✅ جدول settings_providers');

    // ═══ 3) إعدادات الهوية الافتراضية ═══
    const brandDefaults = [
      ['brand.primary_color', '#1a3a5c', 'branding'],
      ['brand.secondary_color', '#d4a574', 'branding'],
      ['brand.logo_url', '', 'branding'],
      ['brand.favicon_url', '', 'branding'],
      ['brand.login_image_url', '', 'branding'],
      ['brand.home_banner_url', '', 'branding'],
      ['brand.company_name', 'مؤسسة الغولي', 'branding'],
    ];
    for (const [key, value, group_name] of brandDefaults) {
      await c.query(
        `INSERT INTO settings (key, value, group_name) VALUES ($1, $2, $3)
         ON CONFLICT (key) DO NOTHING`,
        [key, value, group_name]
      );
    }
    console.log('✅ إعدادات هوية افتراضية:', brandDefaults.length);

    await c.query('COMMIT');
    console.log('✅ m30 اكتمل بنجاح');
  } catch (err) {
    await c.query('ROLLBACK');
    console.error('❌ m30 فشل:', err.message);
    process.exit(1);
  } finally {
    c.release();
    process.exit(0);
  }
})();
