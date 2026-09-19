require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool, query } = require('../src/config/db');

async function seed() {
  console.log('🌱 بدء إدخال البيانات الأولية...');

  try {
    // 1. الأدوار
    const roles = [
      ['admin', 'مدير النظام'],
      ['sales', 'موظف المبيعات'],
      ['accountant', 'المحاسب'],
      ['transport', 'مسؤول النقل'],
      ['inventory', 'موظف المخزون'],
      ['pos', 'موظف نقطة البيع'],
      ['driver', 'السائق'],
      ['customer', 'العميل'],
    ];
    for (const [name, nameAr] of roles) {
      await query(
        `INSERT INTO roles (name, name_ar) VALUES ($1, $2)
         ON CONFLICT (name) DO NOTHING`,
        [name, nameAr]
      );
    }
    console.log('✅ الأدوار');

    // 2. فئات الأسمنت
    const categories = [
      ['OPC', 'أسمنت بورتلاندي عادي', '#28A745', 'أخضر', 'الخرسانة العادية، البناء بالطوب، اللياسة', 1],
      ['SRC', 'أسمنت مقاوم للكبريتات', '#DC3545', 'أحمر', 'الأساسات، المنشآت الساحلية، الأراضي المالحة', 2],
      ['WPC', 'أسمنت أبيض للتشطيبات', '#F8F9FA', 'أبيض', 'التشطيبات، البلاط، الديكور، الواجهات', 3],
    ];
    for (const [code, nameAr, color, colorName, usage, order] of categories) {
      await query(
        `INSERT INTO product_categories (code, name_ar, color_code, color_name_ar, usage_ar, display_order)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (code) DO UPDATE SET
           name_ar = EXCLUDED.name_ar,
           color_code = EXCLUDED.color_code,
           color_name_ar = EXCLUDED.color_name_ar,
           usage_ar = EXCLUDED.usage_ar,
           display_order = EXCLUDED.display_order`,
        [code, nameAr, color, colorName, usage, order]
      );
    }
    console.log('✅ فئات الأسمنت');

    // 3. المصانع
    const sources = [
      ['AMR', 'مصنع عمران للأسمنت', 'عمران', 'عمران', 1],
      ['BAJ', 'مصنع باجل للأسمنت', 'الحديدة', 'باجل', 2],
      ['BAR', 'مصنع البرح للأسمنت', 'تعز', 'البرح', 3],
      ['WAT', 'مصنع الوطنية للأسمنت', 'حضرموت', 'المكلا', 4],
      ['HAD', 'مصنع حضرموت للأسمنت', 'حضرموت', 'المكلا', 5],
      ['NAH', 'مصنع النهضة للأسمنت', null, null, 6],
      ['WAH', 'مصنع الوحدة للأسمنت', 'حضرموت', 'المكلا', 7],
      ['EMA', 'إعمار اليمن للأسمنت', null, null, 8],
    ];
    for (const [code, nameAr, gov, area, order] of sources) {
      await query(
        `INSERT INTO product_sources (code, name_ar, governorate, area, display_order)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (code) DO UPDATE SET
           name_ar = EXCLUDED.name_ar,
           governorate = EXCLUDED.governorate,
           area = EXCLUDED.area,
           display_order = EXCLUDED.display_order`,
        [code, nameAr, gov, area, order]
      );
    }
    console.log('✅ المصانع');

    // 4. ربط المصانع بالفئات
    const relations = [
      ['AMR', 'OPC'],
      ['BAJ', 'OPC'],
      ['BAR', 'OPC'],
      ['WAT', 'OPC'], ['WAT', 'SRC'], ['WAT', 'WPC'],
      ['HAD', 'OPC'], ['HAD', 'SRC'], ['HAD', 'WPC'],
      ['NAH', 'OPC'],
      ['WAH', 'OPC'],
      ['EMA', 'OPC'], ['EMA', 'WPC'],
    ];
    for (const [sourceCode, categoryCode] of relations) {
      await query(
        `INSERT INTO source_categories (source_id, category_id)
         SELECT s.id, c.id FROM product_sources s, product_categories c
         WHERE s.code = $1 AND c.code = $2
         ON CONFLICT DO NOTHING`,
        [sourceCode, categoryCode]
      );
    }
    console.log('✅ ربط المصانع بالفئات');

    // 5. طرق الدفع
    const methods = [
      ['bank_transfer', 'تحويل بنكي', 'bank_transfer'],
      ['e_wallet', 'محفظة إلكترونية', 'e_wallet'],
      ['cash', 'نقدي', 'cash'],
    ];
    for (const [code, nameAr, type] of methods) {
      await query(
        `INSERT INTO payment_methods (code, name_ar, type)
         VALUES ($1, $2, $3)
         ON CONFLICT (code) DO NOTHING`,
        [code, nameAr, type]
      );
    }
    console.log('✅ طرق الدفع');

    // 6. قوائم الأسعار
    const priceLists = [
      ['أسعار الأفراد', 'individual', 1],
      ['أسعار التجار', 'trader', 2],
      ['أسعار الموزعين', 'distributor', 3],
      ['أسعار المقاولين', 'contractor', 4],
    ];
    for (const [nameAr, type, priority] of priceLists) {
      const existing = await query(
        `SELECT id FROM price_lists WHERE customer_type = $1`,
        [type]
      );
      if (existing.rows.length === 0) {
        await query(
          `INSERT INTO price_lists (name_ar, customer_type, priority)
           VALUES ($1, $2, $3)`,
          [nameAr, type, priority]
        );
      }
    }
    console.log('✅ قوائم الأسعار');

    // 7. المدير الأول (الرقم الجديد)
    const adminPhone = '967775477377';
    const adminPassword = await bcrypt.hash('Admin@12345', 12);
    const existingAdmin = await query(
      `SELECT id FROM users WHERE phone = $1`,
      [adminPhone]
    );
    let adminId;
    if (existingAdmin.rows.length === 0) {
      const result = await query(
        `INSERT INTO users (full_name, phone, password_hash, user_type, otp_verified)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        ['مدير النظام', adminPhone, adminPassword, 'staff', true]
      );
      adminId = result.rows[0].id;
      console.log('✅ المدير: 967775477377 / Admin@12345');
    } else {
      adminId = existingAdmin.rows[0].id;
      console.log('ℹ️ المدير موجود مسبقًا');
    }

    // 8. ربط المدير بدور admin
    await query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT $1, id FROM roles WHERE name = 'admin'
       ON CONFLICT DO NOTHING`,
      [adminId]
    );

    // 9. الإعدادات
    const settings = [
      ['company_name', 'مؤسسة الغولي', 'general'],
      ['company_phone', '967775477377', 'general'],
      ['company_whatsapp', '967775477377', 'general'],
      ['company_email', 'info@alghouli.com', 'general'],
      ['default_currency', 'YER', 'general'],
    ];
    for (const [key, value, group] of settings) {
      await query(
        `INSERT INTO settings (key, value, group_name)
         VALUES ($1, $2, $3)
         ON CONFLICT (key) DO NOTHING`,
        [key, value, group]
      );
    }
    console.log('✅ الإعدادات');

    console.log('\n🎉 تم إدخال البيانات الأولية بنجاح!\n');
  } catch (err) {
    console.error('❌ خطأ:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

seed();
