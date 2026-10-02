'use strict';
/**
 * البوابة الوحيدة لكتابة قيود الدفتر. كل مسار مالي يمر من هنا.
 *  - يجب استدعاؤها داخل Transaction مفتوحة (client من pool.connect()).
 *  - قفل صف العميل FOR UPDATE يُسلسل كل الحركات المتزامنة على نفس العميل.
 *  - idempotencyKey: نفس المفتاح مرتين = قيد واحد (يُرجع القيد الموجود duplicate:true).
 *    ويحميه كذلك Unique Index في قاعدة البيانات (خط دفاع أخير ضد السباق).
 *  - الرصيد لكل عملة على حدة في customer_balances. customers.current_balance يُحدَّث للريال فقط
 *    (توافقًا مع شاشات تعتمده) ولا يُستخدم كمصدر حقيقة.
 */
const {
  AccountingError, assertCurrency, toMinor, fromMinor,
} = require('./accounting.engine');

const needTx = (client) => {
  if (!client || typeof client.query !== 'function') {
    throw new AccountingError('يجب تنفيذ القيد داخل Transaction', 'NO_TRANSACTION', 500);
  }
};

const normalizeAmounts = (debit, credit) => {
  const d = toMinor(debit || 0);
  const c = toMinor(credit || 0);
  if (d < 0 || c < 0) throw new AccountingError('لا يُسمح بمبلغ سالب في القيد', 'NEGATIVE_AMOUNT');
  if (d > 0 && c > 0) throw new AccountingError('القيد إما مدين أو دائن وليس الاثنين', 'BOTH_SIDES');
  if (d === 0 && c === 0) throw new AccountingError('مبلغ القيد صفر', 'ZERO_AMOUNT');
  return { d, c };
};

/** قيد في دفتر العميل. يُرجع { entry, balance (نص), duplicate }. */
const postCustomerEntry = async (client, p) => {
  needTx(client);
  const currency = assertCurrency(p.currency);
  const { d, c } = normalizeAmounts(p.debit, p.credit);
  if (!p.transactionType) throw new AccountingError('نوع القيد مطلوب', 'TYPE_REQUIRED');
  if (!p.referenceCode && !p.sourceId) throw new AccountingError('كل قيد يحتاج مرجعًا', 'REFERENCE_REQUIRED');

  // قفل العميل أولًا (تسلسل الحركات)
  const cust = await client.query(`SELECT id FROM customers WHERE id = $1 FOR UPDATE`, [p.customerId]);
  if (!cust.rows.length) throw new AccountingError('العميل غير موجود', 'CUSTOMER_NOT_FOUND', 404);

  if (p.idempotencyKey) {
    const ex = await client.query(`SELECT * FROM customer_ledger WHERE idempotency_key = $1`, [p.idempotencyKey]);
    if (ex.rows.length) {
      const bal = await readBalance(client, p.customerId, currency);
      return { entry: ex.rows[0], balance: fromMinor(bal), duplicate: true };
    }
  }

  const prev = await readBalance(client, p.customerId, currency, true);
  const next = prev + d - c;

  const ins = await client.query(
    `INSERT INTO customer_ledger
       (customer_id, order_id, transaction_type, debit, credit, balance_after, currency,
        description, payment_method, reference_code, created_by, source_type, source_id,
        idempotency_key, reversal_of_id, reason, entry_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, COALESCE($17, NOW()))
     ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
     RETURNING *`,
    [p.customerId, p.orderId || null, p.transactionType, fromMinor(d), fromMinor(c), fromMinor(next), currency,
      p.description || null, p.paymentMethod || null, p.referenceCode || null, p.createdBy || null,
      p.sourceType || null, p.sourceId || null, p.idempotencyKey || null, p.reversalOfId || null,
      p.reason || null, p.entryDate || null]
  );
  if (!ins.rows.length) {
    // سباق نادر: قيد بنفس المفتاح أُدخل من اتصال آخر بين الفحص والإدخال
    const ex = await client.query(`SELECT * FROM customer_ledger WHERE idempotency_key = $1`, [p.idempotencyKey]);
    const bal = await readBalance(client, p.customerId, currency);
    return { entry: ex.rows[0], balance: fromMinor(bal), duplicate: true };
  }

  await client.query(
    `INSERT INTO customer_balances (customer_id, currency, balance, updated_at)
     VALUES ($1,$2,$3,NOW())
     ON CONFLICT (customer_id, currency) DO UPDATE SET balance = EXCLUDED.balance, updated_at = NOW()`,
    [p.customerId, currency, fromMinor(next)]
  );
  if (currency === 'YER') {
    await client.query(`UPDATE customers SET current_balance = $1 WHERE id = $2`, [fromMinor(next), p.customerId]);
  }
  return { entry: ins.rows[0], balance: fromMinor(next), duplicate: false };
};

const readBalance = async (client, customerId, currency, lock = false) => {
  const r = await client.query(
    `SELECT balance FROM customer_balances WHERE customer_id = $1 AND currency = $2${lock ? ' FOR UPDATE' : ''}`,
    [customerId, currency]
  );
  return r.rows.length ? toMinor(r.rows[0].balance) : 0;
};

/** كل أرصدة العميل: { YER: '...', USD: '...', SAR: '...' } (فقط العملات الموجودة). */
const getBalances = async (client, customerId) => {
  const r = await client.query(`SELECT currency, balance FROM customer_balances WHERE customer_id = $1`, [customerId]);
  const out = {};
  r.rows.forEach((x) => { out[x.currency] = fromMinor(toMinor(x.balance)); });
  return out;
};

/**
 * عكس قيد: قيد جديد معاكس مرتبط بالأصل. الأصل لا يُعدَّل ولا يُحذف.
 * لا يمكن عكس قيد مرتين (Unique Index على reversal_of_id + فحص مسبق).
 */
const reverseCustomerEntry = async (client, entryId, { reason, userId, referenceCode } = {}) => {
  needTx(client);
  if (!reason || String(reason).trim().length < 3) {
    throw new AccountingError('سبب العكس مطلوب', 'REASON_REQUIRED');
  }
  const o = await client.query(`SELECT * FROM customer_ledger WHERE id = $1`, [entryId]);
  if (!o.rows.length) throw new AccountingError('القيد غير موجود', 'ENTRY_NOT_FOUND', 404);
  const orig = o.rows[0];
  if (orig.reversal_of_id) throw new AccountingError('لا يمكن عكس قيد عكس', 'REVERSE_OF_REVERSAL');

  const res = await postCustomerEntry(client, {
    customerId: orig.customer_id,
    orderId: orig.order_id,
    currency: orig.currency,
    debit: orig.credit,
    credit: orig.debit,
    transactionType: 'reversal',
    description: `عكس قيد ${orig.reference_code || orig.id}: ${reason}`,
    referenceCode: referenceCode || orig.reference_code || `REV-${orig.id}`,
    sourceType: orig.source_type,
    sourceId: orig.source_id,
    idempotencyKey: `reverse:${orig.id}`,
    reversalOfId: orig.id,
    reason,
    createdBy: userId,
  });
  return { ...res, original: orig };
};

// ───────────── دفتر السائق (نفس المبادئ) ─────────────
/** مستحق النقل للسائق: debit = مستحق للسائق، credit = مدفوع/خصم. (اصطلاح الدفتر الحالي) */
const postDriverEntry = async (client, p) => {
  needTx(client);
  const currency = assertCurrency(p.currency || 'YER');
  const { d, c } = normalizeAmounts(p.debit, p.credit);
  const drv = await client.query(`SELECT current_balance FROM drivers WHERE id = $1 FOR UPDATE`, [p.driverId]);
  if (!drv.rows.length) throw new AccountingError('السائق غير موجود', 'DRIVER_NOT_FOUND', 404);

  if (p.idempotencyKey) {
    const ex = await client.query(`SELECT * FROM driver_ledger WHERE idempotency_key = $1`, [p.idempotencyKey]);
    if (ex.rows.length) return { entry: ex.rows[0], balance: fromMinor(toMinor(drv.rows[0].current_balance)), duplicate: true };
  }
  const next = toMinor(drv.rows[0].current_balance) + d - c;
  const ins = await client.query(
    `INSERT INTO driver_ledger
       (driver_id, order_id, transaction_type, description, debit, credit, balance_after, currency,
        reference_code, created_by, source_type, source_id, idempotency_key, reversal_of_id, reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
     RETURNING *`,
    [p.driverId, p.orderId || null, p.transactionType, p.description || null, fromMinor(d), fromMinor(c), fromMinor(next),
      currency, p.referenceCode || null, p.createdBy || null, p.sourceType || null, p.sourceId || null,
      p.idempotencyKey || null, p.reversalOfId || null, p.reason || null]
  );
  if (!ins.rows.length) {
    const ex = await client.query(`SELECT * FROM driver_ledger WHERE idempotency_key = $1`, [p.idempotencyKey]);
    return { entry: ex.rows[0], balance: fromMinor(next - d + c), duplicate: true };
  }
  await client.query(`UPDATE drivers SET current_balance = $1 WHERE id = $2`, [fromMinor(next), p.driverId]);
  return { entry: ins.rows[0], balance: fromMinor(next), duplicate: false };
};

module.exports = {
  postCustomerEntry, reverseCustomerEntry, getBalances, readBalance, postDriverEntry,
};
