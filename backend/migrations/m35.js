'use strict';
require('dotenv').config();
const { pool } = require('../src/config/db');

// m35 — ضمان وجود جدول delivery_destinations (لم يكن له CREATE TABLE في أي migration سابق).
// آمن على قاعدة الإنتاج الحالية: IF NOT EXISTS + ADD COLUMN IF NOT EXISTS ولا يحذف شيئًا.
(async () => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    console.log('🚀 m35 — delivery_destinations (create if missing)');

    await c.query(`
      CREATE TABLE IF NOT EXISTS delivery_destinations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        fax_id UUID NOT NULL REFERENCES loading_faxes(id) ON DELETE CASCADE,
        destination_type VARCHAR(20) NOT NULL,
        trader_id UUID REFERENCES customers(id),
        warehouse_id UUID REFERENCES institution_warehouses(id),
        quantity DECIMAL(14,2) NOT NULL,
        unit VARCHAR(20) NOT NULL DEFAULT 'bag',
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT destination_type_check CHECK (destination_type IN ('trader', 'warehouse')),
        CONSTRAINT destination_ref CHECK (
          (destination_type = 'trader' AND trader_id IS NOT NULL) OR
          (destination_type = 'warehouse' AND warehouse_id IS NOT NULL)
        )
      )
    `);

    const cols = [
      ['label', 'VARCHAR(150)'],
      ['governorate', 'VARCHAR(100)'],
      ['area', 'VARCHAR(100)'],
      ['address_text', 'TEXT'],
      ['contact_phone', 'VARCHAR(20)'],
      ['contact_name', 'VARCHAR(150)'],
      ['notes', 'TEXT'],
      ['sort_order', 'INTEGER DEFAULT 0'],
      ['delivered_at', 'TIMESTAMP'],
      ['delivered_by', 'UUID REFERENCES users(id)'],
      ['order_id', 'UUID REFERENCES orders(id)'],
      ['fulfills_order_id', 'UUID REFERENCES orders(id)'],
      ['created_by', 'UUID REFERENCES users(id)'],
    ];
    for (const [col, type] of cols) {
      await c.query(`ALTER TABLE delivery_destinations ADD COLUMN IF NOT EXISTS ${col} ${type}`);
    }

    await c.query(`CREATE INDEX IF NOT EXISTS idx_dd_fax ON delivery_destinations(fax_id)`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_dd_trader ON delivery_destinations(trader_id)`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_dd_warehouse ON delivery_destinations(warehouse_id)`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_dd_status ON delivery_destinations(status)`);
    await c.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_dest_fulfills_order
                   ON delivery_destinations (fulfills_order_id) WHERE fulfills_order_id IS NOT NULL`);

    await c.query('COMMIT');
    console.log('✅ m35 اكتمل');
  } catch (err) {
    await c.query('ROLLBACK');
    console.error('❌ m35 فشل:', err.message);
    process.exit(1);
  } finally {
    c.release();
    process.exit(0);
  }
})();
