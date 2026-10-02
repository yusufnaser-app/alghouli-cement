'use strict';
require('dotenv').config();
const { pool } = require('../src/config/db');

const KEEP_PHONE = '967775477377';

// ترتيب الحذف: من الأعمق إلى الجذر
const TABLES_ORDER = [
  // مستوى 1: تفاصيل
  'invoice_items',
  'invoices',
  'order_status_history',
  'order_items',
  'order_accounting_postings',
  'customer_ledger',
  'driver_ledger',
  'factory_ledger',
  'customer_balances',
  'audit_logs',
  'notifications',
  'automation_events',
  'sms_messages',
  'marketing_campaigns',
  'accounting_sync_queue',
  'incentive_rules',
  'delivery_status_history',
  'pos_sessions',
  'sales_points',
  'offers',
  'payments',
  'deliveries',
  'loading_faxes',
  'orders',
  'factory_purchases',
  'order_groups',
  'order_ceilings',
  'ceiling_overrides',
  'customer_addresses',
  'customer_transport_rates',
  'customer_product_prices',
  'inventory',
  // مستوى 2: الكيانات
  'vehicles',
  'drivers',
  'customers',
  // user_roles نُبقي صفوف admin
  // users نُبقي admin
];

const safe = async (c, label, sql, params = []) => {
  await c.query('SAVEPOINT sp');
  try {
    const r = await c.query(sql, params);
    await c.query('RELEASE SAVEPOINT sp');
    return { ok: true, rowCount: r.rowCount };
  } catch (e) {
    await c.query('ROLLBACK TO SAVEPOINT sp');
    await c.query('RELEASE SAVEPOINT sp');
    if (label) console.log(`   ⚠️  ${label}: ${e.message.slice(0, 80)}`);
    return { ok: false, error: e.message, code: e.code };
  }
};

const tableExists = async (c, t) => {
  const r = await c.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`, [t]);
  return r.rowCount > 0;
};

const colExists = async (c, t, col) => {
  const r = await c.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2`, [t, col]);
  return r.rowCount > 0;
};

(async () => {
  const c = await pool.connect();
  try {
    console.log('════════════════════════════════════════════════');
    console.log('🚨  حذف شامل — تطبيق من الصفر');
    console.log('════════════════════════════════════════════════');

    await c.query('BEGIN');

    const before = await c.query(`
      SELECT
        (SELECT count(*)::int FROM users) AS users,
        (SELECT count(*)::int FROM customers) AS customers,
        (SELECT count(*)::int FROM drivers) AS drivers,
        (SELECT count(*)::int FROM vehicles) AS vehicles,
        (SELECT count(*)::int FROM orders) AS orders;
    `);
    console.log('\n📊 قبل:', JSON.stringify(before.rows[0]));

    const admin = await c.query(
      `SELECT id, phone, full_name FROM users WHERE phone = $1`, [KEEP_PHONE]);
    if (!admin.rows.length) throw new Error(`admin ${KEEP_PHONE} غير موجود`);
    const adminId = admin.rows[0].id;
    console.log(`✅ admin محفوظ: ${admin.rows[0].full_name}`);

    // 1) كسر العلاقات الدائرية أولًا
    console.log('\n🔗 كسر العلاقات...');
    const fkNull = [
      ['orders', 'fax_id'],
      ['orders', 'trader_driver_id'],
      ['orders', 'trader_vehicle_id'],
      ['orders', 'factory_pickup_confirmed_by'],
      ['orders', 'credit_approved_by'],
      ['orders', 'priced_by'],
      ['orders', 'transport_beneficiary_trader_id'],
      ['vehicles', 'current_order_id'],
      ['vehicles', 'current_driver_id'],
      ['vehicles', 'owner_trader_id'],
      ['drivers', 'owner_trader_id'],
    ];
    for (const [t, col] of fkNull) {
      if (!(await tableExists(c, t))) continue;
      if (!(await colExists(c, t, col))) continue;
      const r = await safe(c, `${t}.${col}`, `UPDATE ${t} SET ${col} = NULL WHERE ${col} IS NOT NULL`);
      if (r.ok) console.log(`   ✅ ${t}.${col}`);
    }

    // 2) تعطيل triggers الحماية
    console.log('\n🔓 تعطيل triggers...');
    for (const t of ['customer_ledger', 'driver_ledger', 'audit_logs']) {
      if (!(await tableExists(c, t))) continue;
      await safe(c, null, `ALTER TABLE ${t} DISABLE TRIGGER USER`);
      console.log(`   ✅ ${t}`);
    }

    // 3) الحذف بالترتيب
    console.log('\n🗑️  الحذف...');
    let deleted = 0;
    for (const t of TABLES_ORDER) {
      if (!(await tableExists(c, t))) continue;
      const r = await safe(c, null, `DELETE FROM ${t}`);
      if (r.ok && r.rowCount > 0) {
        console.log(`   ✅ ${t.padEnd(28)} ${r.rowCount}`);
        deleted += r.rowCount;
      } else if (!r.ok) {
        console.log(`   ❌ ${t.padEnd(28)} فشل`);
      }
    }

    // 4) user_roles (نُبقي admin)
    console.log('\n🗑️  user_roles...');
    const dr = await safe(c, null, `DELETE FROM user_roles WHERE user_id != $1`, [adminId]);
    if (dr.ok) console.log(`   ✅ user_roles ${dr.rowCount}`);

    // 5) user_permissions
    if (await tableExists(c, 'user_permissions')) {
      const dp = await safe(c, null, `DELETE FROM user_permissions WHERE user_id != $1`, [adminId]);
      if (dp.ok) console.log(`   ✅ user_permissions ${dp.rowCount}`);
    }

    // 6) حذف المستخدمين (ما عدا admin)
    console.log('\n🗑️  users (كل عدا admin)...');
    const du = await safe(c, null, `DELETE FROM users WHERE id != $1`, [adminId]);
    if (du.ok) console.log(`   ✅ حُذف ${du.rowCount}`);

    // 7) إعادة triggers
    console.log('\n🔒 إعادة triggers...');
    for (const t of ['customer_ledger', 'driver_ledger', 'audit_logs']) {
      if (!(await tableExists(c, t))) continue;
      await safe(c, null, `ALTER TABLE ${t} ENABLE TRIGGER USER`);
      console.log(`   ✅ ${t}`);
    }

    // 8) إعادة التسلسلات
    await safe(c, null, `ALTER SEQUENCE IF EXISTS orders_order_number_seq RESTART WITH 1`);
    await safe(c, null, `ALTER SEQUENCE IF EXISTS loading_faxes_fax_number_seq RESTART WITH 1`);

    await c.query('COMMIT');
    console.log('\n✅ تم COMMIT — حُذف إجمالًا:', deleted);

    // 9) التقرير النهائي
    const after = await c.query(`
      SELECT
        (SELECT count(*)::int FROM users) AS users,
        (SELECT count(*)::int FROM customers) AS customers,
        (SELECT count(*)::int FROM drivers) AS drivers,
        (SELECT count(*)::int FROM vehicles) AS vehicles,
        (SELECT count(*)::int FROM orders) AS orders,
        (SELECT count(*)::int FROM payments) AS payments,
        (SELECT count(*)::int FROM loading_faxes) AS faxes,
        (SELECT count(*)::int FROM roles) AS roles,
        (SELECT count(*)::int FROM permissions) AS permissions,
        (SELECT count(*)::int FROM payment_methods) AS methods,
        (SELECT count(*)::int FROM products) AS products;
    `);
    console.log('\n📊 بعد:', JSON.stringify(after.rows[0]));
    console.log('\n✅ التطبيق نظيف — جاهز للاختبار');
  } catch (err) {
    await c.query('ROLLBACK').catch(() => {});
    console.error('\n❌ فشل:', err.message);
    process.exit(1);
  } finally {
    c.release();
    process.exit(0);
  }
})();
