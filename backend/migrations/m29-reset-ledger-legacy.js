require('dotenv').config();
const { pool } = require('../src/config/db');

/**
 * m29: تصفير البيانات المحاسبية التجريبية
 * - حذف كل قيود customer_ledger و driver_ledger
 * - حذف order_accounting_postings
 * - تصفير أرصدة customers و drivers
 * - إعادة الطلبات المُحمَّلة إلى حالة قبل الترحيل
 */
(async () => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    console.log('🧹 m29: تصفير البيانات المحاسبية...');

    const before = await c.query(`
      SELECT
        (SELECT COUNT(*) FROM customer_ledger)::int AS cust_ledger,
        (SELECT COUNT(*) FROM driver_ledger)::int AS driver_ledger,
        (SELECT COUNT(*) FROM order_accounting_postings)::int AS postings
    `);
    console.log('قبل:', before.rows[0]);

    await c.query('DELETE FROM customer_ledger');
    await c.query('DELETE FROM driver_ledger');
    await c.query('DELETE FROM order_accounting_postings');

    await c.query('UPDATE customers SET current_balance = 0');
    await c.query('UPDATE drivers SET current_balance = 0');

    await c.query(`
      UPDATE orders
      SET accounting_status = 'PENDING',
          accounting_posted_at = NULL,
          accounting_note = NULL,
          final_subtotal = NULL,
          final_shipping_amount = NULL,
          final_total_amount = NULL,
          final_remaining_amount = NULL,
          final_loaded_quantity = NULL,
          loaded_at = NULL,
          quantity_loaded = NULL,
          quantity_discrepancy = NULL,
          status = CASE WHEN status = 'LOADED' THEN 'PREPARING' ELSE status END
      WHERE accounting_status = 'POSTED' OR status = 'LOADED'
    `);

    await c.query('COMMIT');
    console.log('✅ m29 اكتمل — البيانات جاهزة لاختبار جديد');
  } catch (err) {
    await c.query('ROLLBACK');
    console.error('❌ فشل m29:', err.message);
    process.exit(1);
  } finally {
    c.release();
    process.exit(0);
  }
})();
