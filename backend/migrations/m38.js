'use strict';
require('dotenv').config();
const { pool } = require('../src/config/db');

// m38 — F1: السقوف والاستثناءات والرصيد الافتتاحي للسائق (كل شيء IF NOT EXISTS، آمن لإعادة التشغيل).
//  1) customers.ceiling_action: ماذا يحدث عند تجاوز السقف لهذا الحساب (reject | request_approval).
//  2) order_ceilings.max_orders / max_vehicles: حدّا عدد الطلبات وعدد القاطرات ضمن نفس إطار السقوف
//     (فترة يومية/شهرية + تفعيل/تعطيل + نطاق عميل/مصنع/صنف) — لا جدول موازٍ.
//  3) ceiling_overrides.used_at: الاستثناء المعتمد يُستهلك مرة واحدة (order_id موجود أصلًا ويحمل الطلب).
//  4) orders.ceiling_status: أثر تسجيلي (APPROVED_EXCEPTION عند الاستهلاك).
//  5) uq_driver_ledger_opening: رصيد افتتاحي واحد لكل (سائق، عملة). يفحص التكرار أولًا ويتوقف بوضوح.
(async () => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    console.log('🚀 m38 — سقوف/استثناءات/رصيد السائق الافتتاحي');

    await c.query(
      `ALTER TABLE customers ADD COLUMN IF NOT EXISTS ceiling_action VARCHAR(20) NOT NULL DEFAULT 'reject'
         CONSTRAINT chk_customers_ceiling_action CHECK (ceiling_action IN ('reject','request_approval'))`
    );
    await c.query(
      `ALTER TABLE order_ceilings ADD COLUMN IF NOT EXISTS max_orders INT
         CONSTRAINT chk_order_ceilings_max_orders CHECK (max_orders IS NULL OR max_orders > 0)`
    );
    await c.query(
      `ALTER TABLE order_ceilings ADD COLUMN IF NOT EXISTS max_vehicles INT
         CONSTRAINT chk_order_ceilings_max_vehicles CHECK (max_vehicles IS NULL OR max_vehicles > 0)`
    );
    // قيد m22 (max_bags أو max_amount) يمنع قاعدة بعدد الطلبات/القاطرات فقط → يُستبدل بقيد يشمل الأربعة.
    const oldChecks = await c.query(
      `SELECT conname FROM pg_constraint
       WHERE conrelid = 'order_ceilings'::regclass AND contype = 'c'
         AND pg_get_constraintdef(oid) ILIKE '%max_bags IS NOT NULL%'
         AND pg_get_constraintdef(oid) ILIKE '%max_amount IS NOT NULL%'
         AND pg_get_constraintdef(oid) NOT ILIKE '%max_orders%'`
    );
    for (const r of oldChecks.rows) await c.query(`ALTER TABLE order_ceilings DROP CONSTRAINT "${r.conname}"`);
    const hasNew = await c.query(
      `SELECT 1 FROM pg_constraint WHERE conrelid = 'order_ceilings'::regclass AND conname = 'chk_order_ceilings_has_limit'`
    );
    if (!hasNew.rows.length) {
      await c.query(
        `ALTER TABLE order_ceilings ADD CONSTRAINT chk_order_ceilings_has_limit
         CHECK (max_bags IS NOT NULL OR max_amount IS NOT NULL OR max_orders IS NOT NULL OR max_vehicles IS NOT NULL)`
      );
    }
    await c.query(`ALTER TABLE ceiling_overrides ADD COLUMN IF NOT EXISTS used_at TIMESTAMP`);
    await c.query(
      `CREATE INDEX IF NOT EXISTS idx_ceiling_overrides_available
       ON ceiling_overrides (customer_id) WHERE status = 'APPROVED' AND used_at IS NULL`
    );
    await c.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS ceiling_status VARCHAR(30)`);

    const dups = await c.query(
      `SELECT driver_id::text AS driver_id, currency, COUNT(*)::int AS cnt FROM driver_ledger
       WHERE transaction_type = 'opening_balance' GROUP BY driver_id, currency HAVING COUNT(*) > 1`
    );
    if (dups.rows.length) {
      throw new Error(`أرصدة افتتاحية مكررة لسائقين: ${dups.rows.map((r) => `${r.driver_id}/${r.currency} ×${r.cnt}`).join('; ')} — عالجها أولًا`);
    }
    await c.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_driver_ledger_opening
       ON driver_ledger (driver_id, currency) WHERE transaction_type = 'opening_balance'`
    );

    await c.query('COMMIT');
    console.log('✅ m38 اكتمل');
  } catch (err) {
    await c.query('ROLLBACK');
    console.error('❌ m38 فشل:', err.message);
    process.exit(1);
  } finally {
    c.release();
    process.exit(0);
  }
})();
