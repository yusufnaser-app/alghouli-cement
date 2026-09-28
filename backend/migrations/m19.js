require('dotenv').config();
const { pool } = require('../src/config/db');

(async () => {
  const c = await pool.connect();
  try {
    // =====================================================================
    // 1) audit_logs — جدول موجود استخدامه في الكود (driver-admin, fax.service)
    //    في 4 مواضع، لكن لا توجد أي هجرة تُنشئه فعليًا في هذا المستودع.
    //    هذا يعني على الأرجح فشل صامت لعمليات: اعتماد/رفض/تعليق سائق،
    //    وتأكيد التحميل عند وجود اختلاف بالكمية (وهو سيناريو متكرر جدًا).
    //    CREATE TABLE IF NOT EXISTS آمن 100%: لن يفعل شيئًا إن كان الجدول
    //    موجودًا فعلاً في قاعدتكم، وسيُصلح المشكلة فورًا إن لم يكن موجودًا.
    // =====================================================================
    await c.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id),
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(50) NOT NULL,
        entity_id UUID,
        old_values JSONB,
        new_values JSONB,
        ip_address VARCHAR(64),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id)`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id, created_at DESC)`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action)`);
    console.log('✅ audit_logs (تحقق/إصلاح)');

    // =====================================================================
    // 2) طبقة التكامل المحاسبي مع YemenSoft — أساس فقط، لا يفترض API فعليًا
    // =====================================================================
    await c.query(`
      CREATE TABLE IF NOT EXISTS accounting_mappings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        accounting_system VARCHAR(50) NOT NULL DEFAULT 'yemensoft',
        entity_type VARCHAR(50) NOT NULL,
        local_entity_id UUID NOT NULL,
        accounting_entity_id VARCHAR(100),
        accounting_reference VARCHAR(150),
        sync_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        last_synced_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE (accounting_system, entity_type, local_entity_id)
      )
    `);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_acct_map_entity ON accounting_mappings(entity_type, local_entity_id)`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_acct_map_status ON accounting_mappings(sync_status)`);

    await c.query(`
      CREATE TABLE IF NOT EXISTS accounting_sync_queue (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        accounting_system VARCHAR(50) NOT NULL DEFAULT 'yemensoft',
        operation VARCHAR(50) NOT NULL,
        entity_type VARCHAR(50) NOT NULL,
        entity_id UUID NOT NULL,
        payload JSONB NOT NULL,
        idempotency_key VARCHAR(150) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        accounting_reference VARCHAR(150),
        retry_count INT NOT NULL DEFAULT 0,
        max_retries INT NOT NULL DEFAULT 5,
        sync_error TEXT,
        last_attempt_at TIMESTAMP,
        synced_at TIMESTAMP,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE (idempotency_key)
      )
    `);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON accounting_sync_queue(status)`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_sync_queue_entity ON accounting_sync_queue(entity_type, entity_id)`);
    console.log('✅ accounting_mappings + accounting_sync_queue (أساس التكامل مع YemenSoft)');

    // =====================================================================
    // 3) قوالب SMS من قاعدة البيانات بدل نصوص مكتوبة داخل الكود
    // =====================================================================
    await c.query(`
      CREATE TABLE IF NOT EXISTS sms_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        template_key VARCHAR(60) UNIQUE NOT NULL,
        title_ar VARCHAR(150),
        body_template TEXT NOT NULL,
        variables TEXT[] DEFAULT '{}',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // نفس القوالب المستخدَمة فعليًا اليوم داخل fax.service.js — منقولة هنا
    // كنقطة انطلاق فقط. لم يتم تعديل fax.service.js ليستخدمها بعد؛ هذا
    // تحسين تدريجي لاحق حتى لا نُخاطر بكسر منطق الفاكس الذي أُصلح للتو.
    const templates = [
      {
        key: 'FAX_ISSUED',
        title: 'تم إصدار الفاكس',
        body: 'مؤسسة الغولي: تم إصدار فاكس التحميل رقم {fax_number} من {factory_name}. الكمية: {quantity} كيس. يرجى التوجه للمصنع.',
        vars: ['fax_number', 'factory_name', 'quantity'],
      },
      {
        key: 'ROUTE_SET',
        title: 'تم تحديد خط السير',
        body: 'مؤسسة الغولي: تم تحديد خط سير رحلتك: {route}. مستحق النقل: {amount} ريال من المؤسسة.',
        vars: ['route', 'amount'],
      },
      {
        key: 'TRANSPORT_ON_TRADER',
        title: 'أجور النقل على التاجر',
        body: 'مؤسسة الغولي: خط السير: {route}. أجور النقل ({amount} ريال) مقيّدة على التاجر {trader_name} — رقمه: {trader_phone} — عنوانه: {trader_address}.',
        vars: ['route', 'amount', 'trader_name', 'trader_phone', 'trader_address'],
      },
      {
        key: 'LOADING_CONFIRMED',
        title: 'تم تسجيل التحميل',
        body: 'مؤسسة الغولي: تم تسجيل تحميل {quantity} كيس على رحلتك رقم {fax_number}.',
        vars: ['quantity', 'fax_number'],
      },
    ];
    for (const t of templates) {
      await c.query(
        `INSERT INTO sms_templates (template_key, title_ar, body_template, variables)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (template_key) DO NOTHING`,
        [t.key, t.title, t.body, t.vars]
      );
    }
    console.log('✅ sms_templates (4 قوالب أساسية)');
  } catch (e) {
    console.error('❌', e.message);
  } finally {
    c.release();
    await pool.end();
  }
})();
