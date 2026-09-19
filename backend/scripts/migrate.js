require('dotenv').config();
const { pool } = require('../src/config/db');

const createTables = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // الأدوار
    await client.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(50) UNIQUE NOT NULL,
        name_ar VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // المستخدمون
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        full_name VARCHAR(150) NOT NULL,
        phone VARCHAR(20) UNIQUE NOT NULL,
        email VARCHAR(150) UNIQUE,
        password_hash VARCHAR(255),
        user_type VARCHAR(20) NOT NULL,
        status VARCHAR(20) DEFAULT 'active',
        otp_verified BOOLEAN DEFAULT FALSE,
        last_login_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // ربط المستخدم بالأدوار
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_roles (
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
        assigned_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (user_id, role_id)
      );
    `);

    // العملاء
    await client.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        customer_type VARCHAR(20) NOT NULL,
        governorate VARCHAR(100) NOT NULL,
        area VARCHAR(100),
        default_address TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // عناوين العملاء
    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_addresses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
        label VARCHAR(50) NOT NULL,
        governorate VARCHAR(100) NOT NULL,
        area VARCHAR(100) NOT NULL,
        address_text TEXT NOT NULL,
        latitude DECIMAL(10,7),
        longitude DECIMAL(10,7),
        alt_phone VARCHAR(20),
        is_default BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // المصانع
    await client.query(`
      CREATE TABLE IF NOT EXISTS product_sources (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(30) UNIQUE NOT NULL,
        name_ar VARCHAR(150) NOT NULL,
        governorate VARCHAR(100),
        area VARCHAR(100),
        supports_bagged BOOLEAN DEFAULT TRUE,
        supports_bulk BOOLEAN DEFAULT TRUE,
        status VARCHAR(20) DEFAULT 'active',
        display_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // فئات الأسمنت
    await client.query(`
      CREATE TABLE IF NOT EXISTS product_categories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(30) UNIQUE NOT NULL,
        name_ar VARCHAR(100) NOT NULL,
        color_code VARCHAR(10) NOT NULL,
        color_name_ar VARCHAR(30) NOT NULL,
        description TEXT,
        usage_ar TEXT,
        display_order INTEGER DEFAULT 0,
        status VARCHAR(20) DEFAULT 'active'
      );
    `);

    // ربط المصنع بالفئة
    await client.query(`
      CREATE TABLE IF NOT EXISTS source_categories (
        source_id UUID REFERENCES product_sources(id) ON DELETE CASCADE,
        category_id UUID REFERENCES product_categories(id) ON DELETE CASCADE,
        PRIMARY KEY (source_id, category_id)
      );
    `);

    // المنتجات
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name_ar VARCHAR(150) NOT NULL,
        source_id UUID REFERENCES product_sources(id),
        category_id UUID REFERENCES product_categories(id),
        grade VARCHAR(30),
        packaging_type VARCHAR(20) NOT NULL,
        bag_weight_kg DECIMAL(6,2),
        description TEXT,
        image_url VARCHAR(500),
        status VARCHAR(20) DEFAULT 'available',
        min_order_qty INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // قوائم الأسعار
    await client.query(`
      CREATE TABLE IF NOT EXISTS price_lists (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name_ar VARCHAR(100) NOT NULL,
        customer_type VARCHAR(20) NOT NULL,
        priority INTEGER DEFAULT 0,
        status VARCHAR(20) DEFAULT 'active'
      );
    `);

    // أسعار المنتجات
    await client.query(`
      CREATE TABLE IF NOT EXISTS product_prices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID REFERENCES products(id) ON DELETE CASCADE,
        price_list_id UUID REFERENCES price_lists(id) ON DELETE CASCADE,
        pricing_unit VARCHAR(20) NOT NULL,
        price DECIMAL(14,2) NOT NULL,
        min_qty INTEGER DEFAULT 1,
        max_qty INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // المخزون
    await client.query(`
      CREATE TABLE IF NOT EXISTS inventory (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID UNIQUE REFERENCES products(id) ON DELETE CASCADE,
        available_qty DECIMAL(14,2) DEFAULT 0,
        reserved_qty DECIMAL(14,2) DEFAULT 0,
        sold_qty DECIMAL(14,2) DEFAULT 0,
        unit VARCHAR(20) NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // الطلبات
    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_number VARCHAR(30) UNIQUE NOT NULL,
        customer_id UUID REFERENCES customers(id),
        address_id UUID REFERENCES customer_addresses(id),
        status VARCHAR(30) NOT NULL,
        source VARCHAR(20) NOT NULL,
        subtotal DECIMAL(14,2) NOT NULL,
        discount_amount DECIMAL(14,2) DEFAULT 0,
        shipping_amount DECIMAL(14,2) DEFAULT 0,
        total_amount DECIMAL(14,2) NOT NULL,
        paid_amount DECIMAL(14,2) DEFAULT 0,
        remaining_amount DECIMAL(14,2) DEFAULT 0,
        notes TEXT,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // عناصر الطلب
    await client.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
        product_id UUID REFERENCES products(id),
        source_id UUID REFERENCES product_sources(id),
        packaging_type VARCHAR(20) NOT NULL,
        quantity DECIMAL(14,2) NOT NULL,
        unit VARCHAR(20) NOT NULL,
        unit_price DECIMAL(14,2) NOT NULL,
        discount DECIMAL(14,2) DEFAULT 0,
        line_total DECIMAL(14,2) NOT NULL
      );
    `);

    // طرق الدفع
    await client.query(`
      CREATE TABLE IF NOT EXISTS payment_methods (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(30) UNIQUE NOT NULL,
        name_ar VARCHAR(100) NOT NULL,
        type VARCHAR(20) NOT NULL,
        status VARCHAR(20) DEFAULT 'active'
      );
    `);

    // المدفوعات
    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID REFERENCES orders(id),
        method_id UUID REFERENCES payment_methods(id),
        amount_due DECIMAL(14,2) NOT NULL,
        amount_transferred DECIMAL(14,2) NOT NULL,
        transfer_date DATE NOT NULL,
        transaction_ref VARCHAR(100),
        status VARCHAR(30) NOT NULL,
        reviewed_by UUID REFERENCES users(id),
        reviewed_at TIMESTAMP,
        rejection_reason TEXT,
        reference_code VARCHAR(50) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // الإعدادات
    await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        key VARCHAR(100) UNIQUE NOT NULL,
        value TEXT,
        group_name VARCHAR(50),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // OTP
    await client.query(`
      CREATE TABLE IF NOT EXISTS otp_codes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        phone VARCHAR(20) NOT NULL,
        code VARCHAR(10) NOT NULL,
        purpose VARCHAR(30) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query('COMMIT');
    console.log('✅ تم إنشاء جميع الجداول بنجاح');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ خطأ:', err.message);
    throw err;
  } finally {
    client.release();
  }
};

createTables()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
