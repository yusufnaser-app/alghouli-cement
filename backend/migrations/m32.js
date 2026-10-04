'use strict';
require('dotenv').config();
const { pool } = require('../src/config/db');

(async () => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    console.log('🚀 m32 — multi-drop + institution warehouses');

    // ═══ 1) مستودعات المؤسسة ═══
    await c.query(`
      CREATE TABLE IF NOT EXISTS institution_warehouses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(30) UNIQUE NOT NULL,
        name_ar VARCHAR(150) NOT NULL,
        governorate VARCHAR(100),
        area VARCHAR(100),
        address_text TEXT,
        contact_phone VARCHAR(20),
        manager_name VARCHAR(150),
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        notes TEXT,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ institution_warehouses');

    await c.query(`
      INSERT INTO institution_warehouses (code, name_ar, governorate)
      VALUES ('WH-001', 'المستودع الرئيسي', 'صنعاء')
      ON CONFLICT (code) DO NOTHING
    `);
    console.log('✅ مستودع افتراضي');

    // ═══ 2) إضافة الأعمدة الناقصة لـ delivery_destinations ═══
    const colsToAdd = [
      ['warehouse_id', 'UUID REFERENCES institution_warehouses(id)'],
      ['order_id', 'UUID REFERENCES orders(id)'],
    ];
    for (const [col, type] of colsToAdd) {
      await c.query(`ALTER TABLE delivery_destinations ADD COLUMN IF NOT EXISTS ${col} ${type}`);
      console.log(`✅ + ${col}`);
    }

    // ═══ 3) إصلاح القيد (إزالة 'other' + شرط الربط) ═══
    await c.query(`
      ALTER TABLE delivery_destinations
      DROP CONSTRAINT IF EXISTS delivery_destinations_destination_type_check
    `);

    const constraintCheck = await c.query(`
      SELECT 1 FROM pg_constraint
      WHERE conname = 'destination_type_check'
        AND conrelid = 'delivery_destinations'::regclass
    `);
    if (constraintCheck.rows.length) {
      await c.query(`ALTER TABLE delivery_destinations DROP CONSTRAINT destination_type_check`);
    }
    await c.query(`
      ALTER TABLE delivery_destinations
      ADD CONSTRAINT destination_type_check
      CHECK (destination_type IN ('trader', 'warehouse'))
    `);

    const refCheck = await c.query(`
      SELECT 1 FROM pg_constraint
      WHERE conname = 'destination_ref'
        AND conrelid = 'delivery_destinations'::regclass
    `);
    if (refCheck.rows.length) {
      await c.query(`ALTER TABLE delivery_destinations DROP CONSTRAINT destination_ref`);
    }
    await c.query(`
      ALTER TABLE delivery_destinations
      ADD CONSTRAINT destination_ref CHECK (
        (destination_type = 'trader' AND trader_id IS NOT NULL) OR
        (destination_type = 'warehouse' AND warehouse_id IS NOT NULL)
      )
    `);
    console.log('✅ constraints');

    // ═══ 4) indexes ═══
    await c.query(`CREATE INDEX IF NOT EXISTS idx_dd_fax ON delivery_destinations(fax_id)`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_dd_trader ON delivery_destinations(trader_id)`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_dd_warehouse ON delivery_destinations(warehouse_id)`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_dd_status ON delivery_destinations(status)`);
    console.log('✅ indexes');

    // ═══ 5) ربط الطلبات بالوجهات ═══
    await c.query(`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS source_fax_id UUID REFERENCES loading_faxes(id),
      ADD COLUMN IF NOT EXISTS source_destination_id UUID REFERENCES delivery_destinations(id)
    `);
    console.log('✅ orders: source links');

    // ═══ 6) حركات مستودع المؤسسة ═══
    await c.query(`
      CREATE TABLE IF NOT EXISTS institution_warehouse_ledger (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        warehouse_id UUID NOT NULL REFERENCES institution_warehouses(id),
        product_id UUID REFERENCES products(id),
        source_id UUID REFERENCES product_sources(id),
        quantity DECIMAL(14,2) NOT NULL,
        unit VARCHAR(20) NOT NULL DEFAULT 'bag',
        direction VARCHAR(10) NOT NULL CHECK (direction IN ('in', 'out')),
        reference_type VARCHAR(30),
        reference_id UUID,
        description TEXT,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ institution_warehouse_ledger');

    await c.query('COMMIT');
    console.log('✅ m32 اكتمل');
  } catch (err) {
    await c.query('ROLLBACK');
    console.error('❌ m32 فشل:', err.message);
    process.exit(1);
  } finally {
    c.release();
    process.exit(0);
  }
})();
