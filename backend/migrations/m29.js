require('dotenv').config();
const { pool } = require('../src/config/db');
const { PERMISSIONS, ROLE_PERMISSIONS, EXTRA_ROLES } = require('../src/modules/auth/permissions');

/**
 * m29 — المرحلة المحاسبية الشاملة
 *  1) customer_ledger: عملة + مفتاح عدم التكرار + عكس + سبب + تاريخ القيد + ترتيب ثابت
 *  2) customer_balances: رصيد لكل (عميل، عملة) — بدل رقم واحد يخلط العملات
 *  3) snapshot للبيانات القديمة قبل أي تغيير (دليل للتسوية — لا يُحذف شيء)
 *  4) driver_ledger: عملة + مفتاح عدم التكرار
 *  5) orders: عملة + نمط النقل ;  payments: حقول العكس
 *  6) order_accounting_postings: حقول التسوية/العكس
 *  7) منع UPDATE/DELETE على السجل المالي وسجل التدقيق (Trigger)
 *  8) صلاحيات دقيقة: permissions / role_permissions / user_permissions + أدوار جديدة
 * كل الأوامر IF NOT EXISTS / قابلة لإعادة التنفيذ.
 */
(async () => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');

    // ── 1) customer_ledger ──
    await c.query(`ALTER TABLE customer_ledger ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'YER'`);
    await c.query(`ALTER TABLE customer_ledger ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(150)`);
    await c.query(`ALTER TABLE customer_ledger ADD COLUMN IF NOT EXISTS reversal_of_id UUID REFERENCES customer_ledger(id)`);
    await c.query(`ALTER TABLE customer_ledger ADD COLUMN IF NOT EXISTS reason TEXT`);
    await c.query(`ALTER TABLE customer_ledger ADD COLUMN IF NOT EXISTS entry_date TIMESTAMP`);
    await c.query(`UPDATE customer_ledger SET entry_date = created_at WHERE entry_date IS NULL`);
    await c.query(`ALTER TABLE customer_ledger ALTER COLUMN entry_date SET DEFAULT NOW()`);
    await c.query(`ALTER TABLE customer_ledger ADD COLUMN IF NOT EXISTS seq BIGSERIAL`);
    await c.query(`ALTER TABLE customer_ledger DROP CONSTRAINT IF EXISTS customer_ledger_currency_check`);
    await c.query(`ALTER TABLE customer_ledger ADD CONSTRAINT customer_ledger_currency_check CHECK (currency IN ('YER','USD','SAR'))`);
    // NOT VALID: لا يفشل على بيانات قديمة مخالفة؛ يُطبَّق على كل قيد جديد.
    await c.query(`ALTER TABLE customer_ledger DROP CONSTRAINT IF EXISTS customer_ledger_amounts_check`);
    await c.query(`ALTER TABLE customer_ledger ADD CONSTRAINT customer_ledger_amounts_check
      CHECK (debit >= 0 AND credit >= 0 AND NOT (debit > 0 AND credit > 0)) NOT VALID`);
    await c.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_ledger_idem ON customer_ledger(idempotency_key) WHERE idempotency_key IS NOT NULL`);
    await c.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_ledger_one_reversal ON customer_ledger(reversal_of_id) WHERE reversal_of_id IS NOT NULL`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_customer_ledger_cust_cur ON customer_ledger(customer_id, currency, entry_date, seq)`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_customer_ledger_source ON customer_ledger(source_type, source_id)`);

    // ── 3) snapshot قبل أي إعادة بناء (دليل للبيانات القديمة) ──
    await c.query(`
      CREATE TABLE IF NOT EXISTS accounting_legacy_snapshot (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id UUID NOT NULL,
        stored_current_balance DECIMAL(16,2),
        ledger_debit DECIMAL(16,2),
        ledger_credit DECIMAL(16,2),
        ledger_net DECIMAL(16,2),
        taken_at TIMESTAMP NOT NULL DEFAULT NOW(),
        migration VARCHAR(20) NOT NULL DEFAULT 'm29',
        UNIQUE (customer_id, migration)
      )`);
    await c.query(`
      INSERT INTO accounting_legacy_snapshot (customer_id, stored_current_balance, ledger_debit, ledger_credit, ledger_net)
      SELECT c.id, c.current_balance,
             COALESCE(SUM(cl.debit),0), COALESCE(SUM(cl.credit),0), COALESCE(SUM(cl.debit),0) - COALESCE(SUM(cl.credit),0)
      FROM customers c LEFT JOIN customer_ledger cl ON cl.customer_id = c.id
      GROUP BY c.id, c.current_balance
      ON CONFLICT (customer_id, migration) DO NOTHING`);

    // ── 2) customer_balances ──
    await c.query(`
      CREATE TABLE IF NOT EXISTS customer_balances (
        customer_id UUID NOT NULL REFERENCES customers(id),
        currency VARCHAR(3) NOT NULL CHECK (currency IN ('YER','USD','SAR')),
        balance DECIMAL(16,2) NOT NULL DEFAULT 0,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        PRIMARY KEY (customer_id, currency)
      )`);
    // الدفتر هو مصدر الحقيقة: الرصيد المخزّن = مجموع الدفتر. الفرق عن customers.current_balance القديم محفوظ في snapshot.
    await c.query(`
      INSERT INTO customer_balances (customer_id, currency, balance)
      SELECT customer_id, currency, SUM(debit) - SUM(credit)
      FROM customer_ledger GROUP BY customer_id, currency
      ON CONFLICT (customer_id, currency) DO NOTHING`);

    // ── 4) driver_ledger ──
    await c.query(`ALTER TABLE driver_ledger ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'YER'`);
    await c.query(`ALTER TABLE driver_ledger ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(150)`);
    await c.query(`ALTER TABLE driver_ledger ADD COLUMN IF NOT EXISTS reversal_of_id UUID REFERENCES driver_ledger(id)`);
    await c.query(`ALTER TABLE driver_ledger ADD COLUMN IF NOT EXISTS reason TEXT`);
    await c.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_driver_ledger_idem ON driver_ledger(idempotency_key) WHERE idempotency_key IS NOT NULL`);
    await c.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_driver_ledger_one_reversal ON driver_ledger(reversal_of_id) WHERE reversal_of_id IS NOT NULL`);

    // ── 5) orders / payments ──
    await c.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'YER'`);
    await c.query(`ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_currency_check`);
    await c.query(`ALTER TABLE orders ADD CONSTRAINT orders_currency_check CHECK (currency IN ('YER','USD','SAR'))`);
    await c.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS transport_mode VARCHAR(20)`);
    await c.query(`ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_transport_mode_check`);
    await c.query(`ALTER TABLE orders ADD CONSTRAINT orders_transport_mode_check CHECK (transport_mode IS NULL OR transport_mode IN ('none','separate','included'))`);
    await c.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS reversed_by UUID REFERENCES users(id)`);
    await c.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMP`);
    await c.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS reversal_reason TEXT`);

    // ── 6) order_accounting_postings ──
    await c.query(`ALTER TABLE order_accounting_postings ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'YER'`);
    await c.query(`ALTER TABLE order_accounting_postings ADD COLUMN IF NOT EXISTS adjustment_count INT NOT NULL DEFAULT 0`);
    await c.query(`ALTER TABLE order_accounting_postings ADD COLUMN IF NOT EXISTS adjusted_at TIMESTAMP`);
    await c.query(`ALTER TABLE order_accounting_postings ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMP`);
    await c.query(`ALTER TABLE order_accounting_postings ADD COLUMN IF NOT EXISTS reversal_reason TEXT`);

    // ── audit_logs: سبب العملية ──
    await c.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS reason TEXT`);
    await c.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS entity_ref VARCHAR(100)`);

    // ── 7) حماية السجل المالي من التعديل/الحذف ──
    await c.query(`
      CREATE OR REPLACE FUNCTION forbid_financial_mutation() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'السجل المالي غير قابل للتعديل أو الحذف (%). استخدم قيد عكس أو تسوية.', TG_TABLE_NAME
          USING ERRCODE = 'integrity_constraint_violation';
      END;
      $$ LANGUAGE plpgsql`);
    for (const t of ['customer_ledger', 'driver_ledger', 'audit_logs']) {
      await c.query(`DROP TRIGGER IF EXISTS trg_${t}_immutable ON ${t}`);
      await c.query(`CREATE TRIGGER trg_${t}_immutable BEFORE UPDATE OR DELETE ON ${t}
        FOR EACH ROW EXECUTE FUNCTION forbid_financial_mutation()`);
    }

    // ── 8) الصلاحيات الدقيقة ──
    await c.query(`
      CREATE TABLE IF NOT EXISTS permissions (
        code VARCHAR(60) PRIMARY KEY,
        description_ar VARCHAR(200)
      )`);
    await c.query(`
      CREATE TABLE IF NOT EXISTS role_permissions (
        role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        permission_code VARCHAR(60) NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
        PRIMARY KEY (role_id, permission_code)
      )`);
    // منح/سحب صريح لمستخدم بعينه (granted=false يسحب حتى لو منحه الدور)
    await c.query(`
      CREATE TABLE IF NOT EXISTS user_permissions (
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        permission_code VARCHAR(60) NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
        granted BOOLEAN NOT NULL DEFAULT TRUE,
        granted_by UUID REFERENCES users(id),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, permission_code)
      )`);

    for (const [code, ar] of Object.entries(PERMISSIONS)) {
      await c.query(
        `INSERT INTO permissions (code, description_ar) VALUES ($1,$2)
         ON CONFLICT (code) DO UPDATE SET description_ar = EXCLUDED.description_ar`, [code, ar]);
    }
    for (const [name, nameAr] of EXTRA_ROLES) {
      await c.query(`INSERT INTO roles (name, name_ar) VALUES ($1,$2) ON CONFLICT (name) DO NOTHING`, [name, nameAr]);
    }
    for (const [role, codes] of Object.entries(ROLE_PERMISSIONS)) {
      if (role === 'admin') continue; // admin = '*' في الكود (صلاحيات كاملة)
      for (const code of codes) {
        await c.query(
          `INSERT INTO role_permissions (role_id, permission_code)
           SELECT r.id, $2 FROM roles r WHERE r.name = $1
           ON CONFLICT DO NOTHING`, [role, code]);
      }
    }

    await c.query('COMMIT');
    console.log('✅ m29 — accounting integrity: currency, idempotency, immutability, RBAC permissions');
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('❌ m29:', e.message);
    process.exitCode = 1;
  } finally {
    c.release();
    await pool.end();
  }
})();
