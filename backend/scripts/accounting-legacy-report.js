/**
 * تقرير البيانات القديمة غير الصحيحة + تصحيح اختياري يحفظ Audit Trail.
 *   node scripts/accounting-legacy-report.js            → تقرير فقط (لا يغيّر شيئًا)
 *   node scripts/accounting-legacy-report.js --apply    → ينفّذ التصحيحات المقترحة كقيود عكس/تسوية (لا حذف)
 *   node scripts/accounting-legacy-report.js --out=report.json
 * كل بند: السجل | القيمة الحالية | القيمة الصحيحة | الفرق | السبب | التصحيح المقترح.
 */
require('dotenv').config();
const fs = require('fs');
const { pool } = require('../src/config/db');
const core = require('../src/modules/accounting/ledger.core');
const { logAudit } = require('../src/modules/audit/audit.service');
const { toMinor, fromMinor } = require('../src/modules/accounting/accounting.engine');

const apply = process.argv.includes('--apply');
const outArg = process.argv.find((a) => a.startsWith('--out='));

(async () => {
  const c = await pool.connect();
  const items = [];
  try {
    // A) قيد "purchase" عند اعتماد الآجل + "actual_sale" عند التحميل = ازدواج للطلب نفسه
    const dbl = await c.query(`
      SELECT p.id AS purchase_entry_id, p.customer_id, p.order_id, p.debit AS purchase_debit, p.currency,
             s.id AS sale_entry_id, s.debit AS sale_debit, o.order_number
      FROM customer_ledger p
      JOIN customer_ledger s ON s.order_id = p.order_id AND s.transaction_type = 'actual_sale' AND s.reversal_of_id IS NULL
      JOIN orders o ON o.id = p.order_id
      WHERE p.transaction_type = 'purchase' AND p.reversal_of_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM customer_ledger r WHERE r.reversal_of_id = p.id)`);
    for (const r of dbl.rows) items.push({
      kind: 'DOUBLE_COUNT_PURCHASE_AND_SALE', record: `ledger:${r.purchase_entry_id}`, order: r.order_number,
      current_value: fromMinor(toMinor(r.purchase_debit)), correct_value: '0.00', difference: fromMinor(toMinor(r.purchase_debit)),
      currency: r.currency, cause: 'قيد الآجل (purchase) سُجّل عند الاعتماد ثم قُيّد البيع كاملًا عند التحميل: الطلب محسوب مرتين.',
      proposed: 'عكس قيد purchase (قيد عكس مرتبط بالأصل)', _fix: { entryId: r.purchase_entry_id, customer: r.customer_id },
    });

    // B) قيود إلغاء/رفض (credit) لطلبات لم يوجد لها قيد مدين سابق → دائن وهمي
    const phantom = await c.query(`
      SELECT x.id, x.customer_id, x.order_id, x.credit, x.currency, o.order_number
      FROM customer_ledger x JOIN orders o ON o.id = x.order_id
      WHERE x.transaction_type = 'cancellation' AND x.reversal_of_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM customer_ledger r WHERE r.reversal_of_id = x.id)
        AND NOT EXISTS (SELECT 1 FROM customer_ledger d WHERE d.order_id = x.order_id AND d.transaction_type IN ('purchase','actual_sale') AND d.debit > 0)`);
    for (const r of phantom.rows) items.push({
      kind: 'PHANTOM_CANCELLATION_CREDIT', record: `ledger:${r.id}`, order: r.order_number,
      current_value: `-${fromMinor(toMinor(r.credit))}`, correct_value: '0.00', difference: `-${fromMinor(toMinor(r.credit))}`,
      currency: r.currency, cause: 'قيد دائن لإلغاء طلب لم يُقيَّد عليه أي مدين.', proposed: 'عكس القيد', _fix: { entryId: r.id, customer: r.customer_id },
    });

    // C) دفعات معتمدة بلا قيد دائن (قبل هذا الإصلاح كان الدائن مدمجًا في قيد البيع)
    const missingPay = await c.query(`
      SELECT p.id, p.reference_code, p.amount_transferred, p.payment_currency, p.order_id, o.customer_id, o.order_number,
             EXISTS (SELECT 1 FROM customer_ledger s WHERE s.order_id = p.order_id AND s.transaction_type = 'actual_sale'
                     AND s.credit > 0 AND s.source_type = 'order_fulfillment') AS embedded_credit
      FROM payments p JOIN orders o ON o.id = p.order_id
      WHERE p.status = 'approved'
        AND NOT EXISTS (SELECT 1 FROM customer_ledger l WHERE l.source_type = 'payment' AND l.source_id = p.id)`);
    for (const r of missingPay.rows) {
      if (r.embedded_credit) {
        items.push({ kind: 'PAYMENT_CREDIT_EMBEDDED_IN_SALE_ROW', record: `payment:${r.reference_code}`, order: r.order_number,
          current_value: 'مدمج في قيد البيع', correct_value: `قيد دائن مستقل ${r.amount_transferred}`, difference: '0.00',
          currency: r.payment_currency, cause: 'قيد البيع القديم يحمل مدين ودائن معًا: الرصيد صحيح لكن الكشف يخلط الدفعة مع البيع.',
          proposed: 'لا تغيير في الرصيد؛ يُنصح بمراجعة يدوية', _fix: null });
      } else {
        items.push({ kind: 'APPROVED_PAYMENT_WITHOUT_ENTRY', record: `payment:${r.reference_code}`, order: r.order_number,
          current_value: '0.00', correct_value: `-${r.amount_transferred}`, difference: `-${r.amount_transferred}`,
          currency: r.payment_currency, cause: 'دفعة معتمدة لم يُنشأ لها قيد دائن في الدفتر.', proposed: 'إنشاء قيد دائن بنفس مفتاح الاعتماد',
          _fix: { payment: r } });
      }
    }

    // D) فرق الرصيد المخزّن القديم (customers.current_balance) عن مجموع الدفتر
    const diff = await c.query(`
      SELECT s.customer_id, s.stored_current_balance, s.ledger_net FROM accounting_legacy_snapshot s
      WHERE s.migration = 'm29' AND COALESCE(s.stored_current_balance,0) <> COALESCE(s.ledger_net,0)`);
    for (const r of diff.rows) items.push({
      kind: 'STORED_BALANCE_DIFFERS_FROM_LEDGER', record: `customer:${r.customer_id}`,
      current_value: fromMinor(toMinor(r.stored_current_balance)), correct_value: fromMinor(toMinor(r.ledger_net)),
      difference: fromMinor(toMinor(r.stored_current_balance) - toMinor(r.ledger_net)), currency: 'YER',
      cause: 'الرصيد القديم عُدِّل خارج الدفتر أو قيود قديمة لم تحدّثه.',
      proposed: 'الرصيد الجديد (customer_balances) = الدفتر. إن كان الرصيد القديم هو الصحيح فأنشئ رصيدًا افتتاحيًا/تسوية بالفرق بعد المراجعة.', _fix: null });

    // E) أرصدة قديمة قد تكون كلها "بالريال" بلا عملة (كل القيود القديمة عُيّنت YER افتراضيًا)
    const nonYer = await c.query(`SELECT COUNT(*)::int AS n FROM payments WHERE payment_currency <> 'YER' AND status = 'approved'`);
    if (nonYer.rows[0].n > 0) items.push({ kind: 'FOREIGN_CURRENCY_PAYMENTS_HISTORY', record: 'payments', current_value: String(nonYer.rows[0].n),
      correct_value: 'يجب أن يكون لكل دفعة أجنبية قيد دائن بعملتها', difference: '-', currency: 'USD/SAR',
      cause: 'كانت الدفعات الأجنبية لا تؤثر على أي رصيد قبل هذا الإصلاح.', proposed: 'تعالجها فقرة C أعلاه (قيد دائن بعملتها)', _fix: null });

    // ── التنفيذ ──
    let applied = 0;
    if (apply) {
      await c.query('BEGIN');
      for (const it of items) {
        if (!it._fix) continue;
        if (it._fix.entryId) {
          const r = await core.reverseCustomerEntry(c, it._fix.entryId, { reason: `تصحيح بيانات قديمة: ${it.kind}`, userId: null });
          await logAudit(c, { userId: null, action: 'LEGACY_CORRECTION', entityType: 'customer_ledger', entityId: it._fix.entryId,
            oldValues: { value: it.current_value }, newValues: { reversal_entry_id: r.entry.id, kind: it.kind }, reason: it.cause });
          applied++;
        } else if (it._fix.payment) {
          const p = it._fix.payment;
          await core.postCustomerEntry(c, { customerId: p.customer_id, orderId: p.order_id, currency: p.payment_currency, debit: 0,
            credit: p.amount_transferred, transactionType: 'payment', description: `قيد دفعة معتمدة (تصحيح قديم) للطلب ${p.order_number}`,
            referenceCode: p.reference_code, sourceType: 'payment', sourceId: p.id, idempotencyKey: `payment:${p.id}:approve`, createdBy: null });
          await logAudit(c, { userId: null, action: 'LEGACY_CORRECTION', entityType: 'payments', entityId: p.id,
            newValues: { kind: it.kind, amount: p.amount_transferred, currency: p.payment_currency }, reason: it.cause });
          applied++;
        }
      }
      await c.query('COMMIT');
    }
    const clean = items.map(({ _fix, ...rest }) => rest);
    const report = { generated_at: new Date().toISOString(), mode: apply ? 'APPLIED' : 'REPORT_ONLY', total: clean.length, applied, items: clean };
    if (outArg) fs.writeFileSync(outArg.split('=')[1], JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } catch (e) {
    if (apply) await c.query('ROLLBACK').catch(() => {});
    console.error('❌', e.message); process.exitCode = 1;
  } finally { c.release(); await pool.end(); }
})();
