'use strict';
/**
 * المحرك المحاسبي — دوال نقية (بدون قاعدة بيانات) = مصدر القواعد الوحيد.
 *
 * القواعد المعتمدة:
 *  - كل المبالغ تُحسب كأعداد صحيحة بالوحدة الصغرى (منزلتان عشريتان) → لا أخطاء فاصلة عائمة.
 *  - الرصيد الختامي = الرصيد الافتتاحي + المدين − الدائن، لكل عملة على حدة.
 *  - لا تحويل بين العملات ولا سعر صرف.
 *  - قيمة البيع تُحسب على الكمية المحملة فعليًا (loaded_quantity) وليس المطلوبة.
 *  - الخصم يُطبَّق على الأسمنت فقط (سطر الصنف) ويتناسب مع الكمية المحملة. لا خصم على النقل.
 *  - النقل: none | separate | included
 *      none     → لا نقل.
 *      separate → السعر بدون نقل، النقل يُضاف فوق قيمة الأسمنت.
 *      included → السعر شامل النقل، لا يُضاف مرة ثانية على العميل.
 *  - جهة تحمل النقل (beneficiary):
 *      trader → يظهر في حساب العميل/التاجر (مدين) ولا يُقيَّد في حساب السائق.
 *      driver → يظهر في حساب السائق فقط ولا يُضاف على العميل.
 *    (منع Double Counting: النقل يُقيَّد في حساب واحد فقط).
 */

const CURRENCIES = Object.freeze(['YER', 'USD', 'SAR']);
const FIXED_TRANSPORT_UNITS = Object.freeze(['trip', 'truck', 'load', 'fixed']);
const TRANSPORT_MODES = Object.freeze(['none', 'separate', 'included']);
const TZ_OFFSET_MS = 3 * 60 * 60 * 1000; // توقيت اليمن UTC+3

class AccountingError extends Error {
  constructor(message, code = 'ACCOUNTING_ERROR', status = 400, data = null) {
    super(message);
    this.code = code;
    this.status = status;
    if (data) this.data = data;
  }
}

// ───────────── العملات ─────────────
const assertCurrency = (c) => {
  const cur = String(c || '').toUpperCase();
  if (!CURRENCIES.includes(cur)) {
    throw new AccountingError(`عملة غير مدعومة: ${c}`, 'INVALID_CURRENCY', 400);
  }
  return cur;
};

// ───────────── المبالغ (وحدة صغرى) ─────────────
/** يحوّل نصًا/رقمًا إلى عدد صحيح بالوحدة الصغرى (تقريب نصف للأعلى) دون المرور بعائم. */
const toMinor = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  let s = typeof v === 'number' ? v : String(v).trim();
  if (typeof s === 'number') {
    if (!Number.isFinite(s)) throw new AccountingError('مبلغ غير صالح', 'INVALID_AMOUNT');
    s = s.toFixed(6);
  }
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new AccountingError(`مبلغ غير صالح: ${v}`, 'INVALID_AMOUNT');
  const sign = m[1] === '-' ? -1 : 1;
  const int = Number(m[2]);
  const frac = ((m[3] || '') + '000').slice(0, 3);
  const f = Number(frac);
  let minor = int * 100 + Math.floor(f / 10) + (f % 10 >= 5 ? 1 : 0);
  if (!Number.isSafeInteger(minor)) throw new AccountingError('مبلغ كبير جدًا', 'INVALID_AMOUNT');
  return sign * minor;
};

/** عدد صحيح بالوحدة الصغرى → نص عشري بمنزلتين (يصلح كمعامل NUMERIC في pg). */
const fromMinor = (minor) => {
  const n = Number(minor) || 0;
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const int = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  return `${sign}${int}.${frac}`;
};

/** قسمة BigInt بتقريب نصف للأعلى (للقيم الموجبة والسالبة). */
const divRound = (num, den) => {
  const n = BigInt(num);
  const d = BigInt(den);
  if (d === 0n) throw new AccountingError('قسمة على صفر', 'DIV_ZERO');
  const neg = (n < 0n) !== (d < 0n);
  const an = n < 0n ? -n : n;
  const ad = d < 0n ? -d : d;
  const q = (an * 2n + ad) / (ad * 2n);
  return Number(neg ? -q : q);
};

// ───────────── حساب قيمة الطلب على الكمية المحملة ─────────────
/**
 * @param {object} p
 * @param {Array<{quantity, unitPrice, discount?}>} p.items  عناصر الطلب (الكمية المطلوبة لكل صنف)
 * @param {number|string} p.loadedQuantity  الكمية المحملة الفعلية (إجمالي)
 * @param {object} [p.transport] {mode, amount, unit, beneficiary, requestedQuantity}
 * @param {string} [p.currency]
 * @param {boolean} [p.allowOverLoad=false]
 */
const calcOrderValue = ({ items, loadedQuantity, transport = {}, currency = 'YER', allowOverLoad = false }) => {
  const cur = assertCurrency(currency);
  if (!Array.isArray(items) || items.length === 0) {
    throw new AccountingError('لا توجد أصناف في الطلب', 'NO_ITEMS');
  }
  const reqH = items.reduce((s, i) => s + toMinor(i.quantity), 0); // بالمئات
  const loadedH = toMinor(loadedQuantity);
  if (reqH <= 0) throw new AccountingError('كمية الطلب غير صحيحة', 'INVALID_QUANTITY');
  if (loadedH <= 0) throw new AccountingError('الكمية المحملة غير صحيحة', 'INVALID_QUANTITY');
  if (!allowOverLoad && loadedH > reqH) {
    throw new AccountingError(
      `الكمية المحملة ${fromMinor(loadedH)} أكبر من كمية الطلب ${fromMinor(reqH)}`,
      'LOADED_EXCEEDS_REQUESTED'
    );
  }

  let gross = 0;
  let discount = 0;
  for (const it of items) {
    const unit = toMinor(it.unitPrice);
    const qtyH = toMinor(it.quantity);
    if (unit < 0) throw new AccountingError('سعر غير صحيح', 'INVALID_PRICE');
    // قيمة الصنف على حصته من الكمية المحملة: unit × (qty × loaded / req)
    gross += divRound(BigInt(unit) * BigInt(qtyH) * BigInt(loadedH), BigInt(reqH) * 100n);
    const disc = toMinor(it.discount || 0);
    if (disc < 0) throw new AccountingError('خصم غير صحيح', 'INVALID_DISCOUNT');
    discount += divRound(BigInt(disc) * BigInt(loadedH), BigInt(reqH));
  }
  if (discount > gross) throw new AccountingError('الخصم أكبر من قيمة الأسمنت', 'DISCOUNT_EXCEEDS_VALUE');
  const net = gross - discount;

  const mode = TRANSPORT_MODES.includes(transport.mode) ? transport.mode : 'none';
  const tAmount = toMinor(transport.amount || 0);
  if (tAmount < 0) throw new AccountingError('أجور نقل غير صحيحة', 'INVALID_TRANSPORT');
  const unitName = String(transport.unit || 'bag').toLowerCase();
  const tReqH = transport.requestedQuantity ? toMinor(transport.requestedQuantity) : reqH;
  let transportTotal = 0;
  if (mode !== 'none' && tAmount > 0) {
    transportTotal = FIXED_TRANSPORT_UNITS.includes(unitName)
      ? tAmount
      : divRound(BigInt(tAmount) * BigInt(loadedH), BigInt(tReqH > 0 ? tReqH : reqH));
  }

  // من يتحمل النقل؟
  const beneficiary = transport.beneficiary === 'driver' ? 'driver' : 'trader';
  let customerTransport = 0;
  let driverTransport = 0;
  if (transportTotal > 0) {
    if (beneficiary === 'driver') driverTransport = transportTotal;
    else if (mode === 'separate') customerTransport = transportTotal; // included: لا يُضاف على العميل
  }

  return {
    currency: cur,
    mode,
    beneficiary,
    requested_quantity: fromMinor(reqH),
    loaded_quantity: fromMinor(loadedH),
    cement_gross: gross,
    discount,
    cement_net: net,
    transport_total: transportTotal,
    customer_transport: customerTransport,
    driver_transport: driverTransport,
    customer_total: net + customerTransport,
  };
};

/** فرق بين ترحيلين (قديم/جديد) → قيود تسوية موقّعة (موجب=مدين، سالب=دائن). */
const diffPosting = (prev, next) => ({
  customer_delta: (next.customer_total || 0) - (prev.customer_total || 0),
  driver_delta: (next.driver_transport || 0) - (prev.driver_transport || 0),
});

/** يحوّل فرقًا موقّعًا إلى {debit, credit} بالوحدة الصغرى. */
const signedToEntry = (delta) => (delta >= 0 ? { debit: delta, credit: 0 } : { debit: 0, credit: -delta });

// ───────────── الفترات والتوقيت ─────────────
/** بداية اليوم بتوقيت اليمن كـ Date (UTC). */
const periodStart = (d) => {
  if (!d) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(d))) {
    const [y, m, day] = String(d).split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, day) - TZ_OFFSET_MS);
  }
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) throw new AccountingError('تاريخ غير صالح', 'INVALID_DATE');
  return dt;
};
/** نهاية اليوم (شاملة) بتوقيت اليمن. */
const periodEnd = (d) => {
  if (!d) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(d))) {
    const [y, m, day] = String(d).split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, day, 23, 59, 59, 999) - TZ_OFFSET_MS);
  }
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) throw new AccountingError('تاريخ غير صالح', 'INVALID_DATE');
  return dt;
};

// ───────────── الأرصدة وكشف الحساب ─────────────
const entryTime = (e) => new Date(e.entry_date || e.created_at).getTime();
const entrySeq = (e) => (e.seq !== undefined && e.seq !== null ? Number(e.seq) : 0);
const sortEntries = (rows) =>
  [...rows].sort((a, b) => entryTime(a) - entryTime(b) || entrySeq(a) - entrySeq(b) || String(a.id).localeCompare(String(b.id)));

const balanceSide = (minor) => (minor > 0 ? 'مدين' : minor < 0 ? 'دائن' : 'متوازن');

/** أرصدة لكل عملة من قيود (بدون خلط). → { YER: minor, USD: minor, ... } */
const computeBalances = (entries) => {
  const out = {};
  for (const e of entries) {
    const cur = assertCurrency(e.currency || 'YER');
    out[cur] = (out[cur] || 0) + toMinor(e.debit) - toMinor(e.credit);
  }
  return out;
};

/**
 * كشف حساب: لكل عملة قسم مستقل.
 * الرصيد الافتتاحي = قيود opening_balance + كل الحركات قبل بداية الفترة.
 */
const buildStatement = (entries, { from = null, to = null, currency = null } = {}) => {
  const fromDt = periodStart(from);
  const toDt = periodEnd(to);
  const wanted = currency ? assertCurrency(currency) : null;
  const byCur = {};
  for (const e of entries) {
    const cur = assertCurrency(e.currency || 'YER');
    if (wanted && cur !== wanted) continue;
    (byCur[cur] = byCur[cur] || []).push(e);
  }
  const sections = [];
  const curs = wanted ? [wanted] : CURRENCIES.filter((c) => byCur[c]);
  for (const cur of curs) {
    const all = sortEntries(byCur[cur] || []);
    let opening = 0;
    const movements = [];
    for (const e of all) {
      const t = entryTime(e);
      const isOpeningEntry = e.transaction_type === 'opening_balance';
      if (toDt && t > toDt.getTime()) continue;
      if (isOpeningEntry && !fromDt) { opening += toMinor(e.debit) - toMinor(e.credit); continue; }
      if (fromDt && t < fromDt.getTime()) { opening += toMinor(e.debit) - toMinor(e.credit); continue; }
      movements.push(e);
    }
    let running = opening;
    let totalDebit = 0;
    let totalCredit = 0;
    const rows = movements.map((e) => {
      const d = toMinor(e.debit);
      const c = toMinor(e.credit);
      running += d - c;
      totalDebit += d;
      totalCredit += c;
      return {
        id: e.id,
        date: e.entry_date || e.created_at,
        description: e.description || e.transaction_type,
        transaction_type: e.transaction_type,
        reference: e.reference_code || null,
        order_number: e.order_number || null,
        currency: cur,
        debit: fromMinor(d),
        credit: fromMinor(c),
        balance: fromMinor(running),
        is_reversal: !!e.reversal_of_id,
        reversal_of_id: e.reversal_of_id || null,
        reason: e.reason || null,
      };
    });
    const closing = opening + totalDebit - totalCredit;
    if (closing !== running) throw new AccountingError('خلل داخلي في حساب الرصيد الختامي', 'STATEMENT_INVARIANT', 500);
    sections.push({
      currency: cur,
      opening_balance: fromMinor(opening),
      total_debit: fromMinor(totalDebit),
      total_credit: fromMinor(totalCredit),
      closing_balance: fromMinor(closing),
      closing_side: balanceSide(closing),
      rows,
    });
  }
  return {
    period: { from: from || null, to: to || null },
    sections,
    no_movements: sections.every((s) => s.rows.length === 0 && s.opening_balance === '0.00'),
  };
};

/**
 * إعادة بناء الرصيد من الصفر ومقارنته بالرصيد المخزّن.
 * stored: { YER: '123.00', ... } (أو أرقام). يُرجع الفروقات الظاهرة (لا تُخفى).
 */
const rebuildAndCompare = (entries, stored = {}) => {
  const calc = computeBalances(entries);
  const curs = new Set([...Object.keys(calc), ...Object.keys(stored).map((c) => String(c).toUpperCase())]);
  const sorted = sortEntries(entries);
  const result = [];
  for (const cur of curs) {
    const calcMinor = calc[cur] || 0;
    const storedMinor = toMinor(stored[cur] ?? 0);
    const last = [...sorted].reverse().find((e) => (e.currency || 'YER') === cur) || null;
    const diff = storedMinor - calcMinor;
    result.push({
      currency: cur,
      stored_balance: fromMinor(storedMinor),
      calculated_balance: fromMinor(calcMinor),
      difference: fromMinor(diff),
      matches: diff === 0,
      last_entry: last ? { id: last.id, type: last.transaction_type, reference: last.reference_code || null, date: last.entry_date || last.created_at } : null,
      probable_cause: diff === 0 ? null : probableCause(diff, entries.filter((e) => (e.currency || 'YER') === cur)),
    });
  }
  return result;
};

const probableCause = (diff, entries) => {
  if (!entries.length) return 'رصيد مخزّن بدون أي قيود دفتر (رصيد افتتاحي غير مسجّل كقيد).';
  const amounts = new Map();
  for (const e of entries) {
    const v = Math.abs(toMinor(e.debit) - toMinor(e.credit));
    amounts.set(v, (amounts.get(v) || 0) + 1);
  }
  if (amounts.has(Math.abs(diff))) return 'الفرق يساوي قيمة قيد موجود — احتمال قيد مكرر أو قيد لم يُحدّث الرصيد المخزّن.';
  return 'تعديل مباشر للرصيد المخزّن خارج الدفتر، أو قيود قديمة كُتبت دون تحديث الرصيد.';
};

/** تحقق من سلسلة balance_after داخل الدفتر نفسه (لكل عملة). */
const verifyRunningChain = (entries) => {
  const problems = [];
  const byCur = {};
  for (const e of sortEntries(entries)) (byCur[e.currency || 'YER'] = byCur[e.currency || 'YER'] || []).push(e);
  for (const [cur, rows] of Object.entries(byCur)) {
    let running = 0;
    for (const e of rows) {
      running += toMinor(e.debit) - toMinor(e.credit);
      if (e.balance_after !== undefined && e.balance_after !== null && toMinor(e.balance_after) !== running) {
        problems.push({ id: e.id, currency: cur, expected: fromMinor(running), stored: fromMinor(toMinor(e.balance_after)) });
      }
    }
  }
  return problems;
};

// ───────────── فحوص سلامة الحسابات (Accounting Integrity) ─────────────
const SALE_TYPES = ['actual_sale', 'sale', 'purchase'];
const PAYMENT_TYPES = ['payment', 'manual_payment', 'order_payment'];

const finding = (code, severity, message, extra = {}) => ({ code, severity, message, ...extra });

/**
 * @param {object} d  { ledger, orders, payments, postings, balances, faxes, driverLedger, items }
 *  - ledger: صفوف customer_ledger
 *  - orders: [{id, status, currency, accounting_status, final_loaded_quantity, quantity_loaded, transport_beneficiary}]
 *  - payments: [{id, order_id, status, payment_currency, amount_transferred}]
 *  - postings: [{order_id, loaded_quantity, customer_debit, driver_transport_debit, ...}]
 *  - balances: { [customerId]: { YER: '..', ... } } الأرصدة المخزّنة
 *  - faxes: [{order_id, status, loaded_quantity}]
 *  - driverLedger: [{order_id, transaction_type, debit, credit, driver_id}]
 */
const runIntegrityChecks = (d) => {
  const ledger = d.ledger || [];
  const orders = d.orders || [];
  const payments = d.payments || [];
  const postings = d.postings || [];
  const faxes = d.faxes || [];
  const driverLedger = d.driverLedger || [];
  const out = [];
  const orderById = new Map(orders.map((o) => [o.id, o]));
  const payById = new Map(payments.map((p) => [p.id, p]));
  const reversedIds = new Set(ledger.filter((e) => e.reversal_of_id).map((e) => e.reversal_of_id));

  // 1) قيود مكررة (نفس البصمة) — يستثني قيود العكس
  const seen = new Map();
  for (const e of ledger) {
    if (e.reversal_of_id) continue;
    const key = [e.customer_id, e.order_id || '', e.transaction_type, e.currency, toMinor(e.debit), toMinor(e.credit), e.source_id || e.reference_code || ''].join('|');
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key).push(e);
  }
  for (const [, arr] of seen) {
    if (arr.length > 1) {
      // نفس البصمة تمامًا لقيدين مختلفين
      out.push(finding('DUPLICATE_ENTRY', 'high', 'قيود متطابقة مكررة', { account: arr[0].customer_id, entry_ids: arr.map((x) => x.id) }));
    }
  }

  for (const e of ledger) {
    const deb = toMinor(e.debit);
    const cre = toMinor(e.credit);
    // 2) بدون مرجع
    if (!e.reference_code && !e.source_id && e.transaction_type !== 'opening_balance') {
      out.push(finding('MISSING_REFERENCE', 'medium', 'قيد بدون مرجع', { account: e.customer_id, entry_id: e.id }));
    }
    // 3) طلب غير موجود
    if (e.order_id && !orderById.has(e.order_id)) {
      out.push(finding('ORPHAN_ORDER', 'high', 'قيد مرتبط بطلب غير موجود', { account: e.customer_id, entry_id: e.id, order_id: e.order_id }));
    }
    // 8) عملة خاطئة
    if (!CURRENCIES.includes(String(e.currency || '').toUpperCase())) {
      out.push(finding('BAD_CURRENCY', 'high', 'عملة غير مدعومة في القيد', { account: e.customer_id, entry_id: e.id, currency: e.currency }));
    }
    // 9) إشارات مدين/دائن خاطئة
    if (deb < 0 || cre < 0 || (deb > 0 && cre > 0) || (deb === 0 && cre === 0)) {
      out.push(finding('BAD_AMOUNT', 'high', 'مبالغ مدين/دائن غير صالحة', { account: e.customer_id, entry_id: e.id }));
    }
    if (!e.reversal_of_id) {
      if (SALE_TYPES.includes(e.transaction_type) && cre > 0 && e.transaction_type !== 'adjustment') {
        out.push(finding('WRONG_SIGN', 'high', 'قيد بيع بإشارة دائنة', { account: e.customer_id, entry_id: e.id }));
      }
      if (PAYMENT_TYPES.includes(e.transaction_type) && deb > 0) {
        out.push(finding('WRONG_SIGN', 'high', 'قيد دفعة بإشارة مدينة', { account: e.customer_id, entry_id: e.id }));
      }
    }
    // 5) دفعة غير معتمدة تؤثر على الرصيد
    if (e.source_type === 'payment' && e.source_id && !e.reversal_of_id) {
      const p = payById.get(e.source_id);
      if (p && p.status !== 'approved' && !reversedIds.has(e.id)) {
        out.push(finding('UNAPPROVED_PAYMENT_AFFECTS_BALANCE', 'high', `دفعة بحالة ${p.status} تؤثر على الرصيد`, { account: e.customer_id, entry_id: e.id, payment_id: p.id }));
      }
      if (p && e.currency !== p.payment_currency) {
        out.push(finding('BAD_CURRENCY', 'high', 'عملة القيد تخالف عملة الدفعة', { account: e.customer_id, entry_id: e.id, payment_id: p.id }));
      }
    }
    // عملة قيد البيع مقابل عملة الطلب
    if (SALE_TYPES.includes(e.transaction_type) && e.order_id && orderById.has(e.order_id)) {
      const o = orderById.get(e.order_id);
      if ((o.currency || 'YER') !== e.currency) {
        out.push(finding('BAD_CURRENCY', 'high', 'عملة قيد البيع تخالف عملة الطلب', { account: e.customer_id, entry_id: e.id, order_id: o.id }));
      }
    }
  }

  // 4) دفعات معتمدة بدون قيد
  const paymentEntryIds = new Set(ledger.filter((e) => e.source_type === 'payment' && !e.reversal_of_id).map((e) => e.source_id));
  for (const p of payments) {
    if (p.status === 'approved' && !paymentEntryIds.has(p.id)) {
      out.push(finding('APPROVED_PAYMENT_WITHOUT_ENTRY', 'high', 'دفعة معتمدة بدون قيد في الدفتر', { payment_id: p.id, order_id: p.order_id }));
    }
  }

  // 6) طلبات ملغاة ما زالت تؤثر على الرصيد (صافي الطلب ≠ 0 بعد استبعاد الدفعات المستقلة عن الأسمنت)
  const netByOrder = new Map();
  for (const e of ledger) {
    if (!e.order_id || e.source_type === 'payment') continue;
    const k = `${e.order_id}|${e.currency}`;
    netByOrder.set(k, (netByOrder.get(k) || 0) + toMinor(e.debit) - toMinor(e.credit));
  }
  for (const [k, net] of netByOrder) {
    const [orderId, cur] = k.split('|');
    const o = orderById.get(orderId);
    if (o && ['CANCELLED', 'REVERSED'].includes(String(o.status).toUpperCase()) && net !== 0) {
      out.push(finding('CANCELLED_ORDER_STILL_AFFECTS', 'high', 'طلب ملغى ما زال يؤثر على الرصيد', { order_id: orderId, currency: cur, net_effect: fromMinor(net) }));
    }
  }

  // 7) تحميلات بدون ترحيل + 13) اختلاف الكمية + 14) ترحيل متعدد
  const postingByOrder = new Map();
  for (const p of postings) {
    if (!postingByOrder.has(p.order_id)) postingByOrder.set(p.order_id, []);
    postingByOrder.get(p.order_id).push(p);
  }
  for (const f of faxes) {
    if (f.status === 'USED' && Number(f.loaded_quantity) > 0) {
      const posts = postingByOrder.get(f.order_id) || [];
      const o = orderById.get(f.order_id);
      if (!posts.length || (o && o.accounting_status !== 'POSTED' && o.accounting_status !== 'REVERSED')) {
        out.push(finding('LOADED_NOT_POSTED', 'high', 'تحميل فعلي بدون ترحيل محاسبي', { order_id: f.order_id }));
      }
      if (posts[0] && toMinor(posts[0].loaded_quantity) !== toMinor(f.loaded_quantity)) {
        out.push(finding('QUANTITY_MISMATCH', 'high', 'كمية التحميل تخالف كمية الترحيل', { order_id: f.order_id, loaded: f.loaded_quantity, posted: posts[0].loaded_quantity }));
      }
    }
  }
  for (const [orderId, posts] of postingByOrder) {
    if (posts.length > 1) out.push(finding('ORDER_POSTED_MULTIPLE_TIMES', 'high', 'طلب مرحّل أكثر من مرة', { order_id: orderId }));
    const sales = ledger.filter((e) => e.order_id === orderId && e.transaction_type === 'actual_sale' && !e.reversal_of_id);
    const activeSales = sales.filter((e) => !reversedIds.has(e.id));
    if (activeSales.length > 1) out.push(finding('ORDER_POSTED_MULTIPLE_TIMES', 'high', 'أكثر من قيد بيع فعلي نشط للطلب', { order_id: orderId, entry_ids: activeSales.map((x) => x.id) }));
    const o = orderById.get(orderId);
    if (o && o.accounting_status === 'POSTED' && activeSales.length === 0) {
      out.push(finding('MISSING_ENTRY', 'high', 'طلب مرحّل بدون قيد بيع في الدفتر', { order_id: orderId }));
    }
    // 11) نقل محسوب مرتين: على السائق والعميل معًا
    const p = posts[0];
    if (p && toMinor(p.driver_transport_debit) > 0 && toMinor(p.trader_transport_amount) > 0) {
      out.push(finding('TRANSPORT_DOUBLE_COUNTED', 'high', 'النقل مقيّد على السائق وعلى التاجر معًا', { order_id: orderId }));
    }
  }
  // نقل السائق: أكثر من قيد مستحق فعّال للطلب نفسه
  const dTransport = new Map();
  for (const r of driverLedger) {
    if (r.transaction_type !== 'transport_due' || !r.order_id) continue;
    if (!dTransport.has(r.order_id)) dTransport.set(r.order_id, []);
    dTransport.get(r.order_id).push(r);
  }
  for (const [orderId, rows] of dTransport) {
    if (rows.length > 1) out.push(finding('TRANSPORT_DOUBLE_COUNTED', 'high', 'أكثر من قيد نقل مستحق للسائق لنفس الطلب', { order_id: orderId, count: rows.length }));
  }

  // 12) خصم/نقل/سعر: مقارنة مبلغ الترحيل بإعادة الحساب من أصناف الطلب
  const itemsByOrder = new Map();
  for (const it of d.items || []) {
    if (!itemsByOrder.has(it.order_id)) itemsByOrder.set(it.order_id, []);
    itemsByOrder.get(it.order_id).push(it);
  }
  for (const [orderId, posts] of postingByOrder) {
    const o = orderById.get(orderId);
    const items = itemsByOrder.get(orderId);
    if (!o || !items || !items.length || o.accounting_status === 'REVERSED') continue;
    try {
      const recalculated = calcOrderValue({
        items,
        loadedQuantity: posts[0].loaded_quantity,
        currency: o.currency || 'YER',
        transport: { mode: o.transport_mode || (toMinor(o.shipping_amount) > 0 ? 'separate' : 'none'), amount: o.transport_total_for_check ?? o.shipping_amount, unit: o.transport_unit, beneficiary: o.transport_beneficiary, requestedQuantity: o.transport_requested_quantity },
      });
      const posted = toMinor(posts[0].customer_debit);
      if (posted !== recalculated.customer_total) {
        out.push(finding('POSTED_AMOUNT_MISMATCH', 'medium', 'مبلغ الترحيل يخالف إعادة الحساب (خصم/نقل/سعر)', {
          order_id: orderId, posted: fromMinor(posted), recalculated: fromMinor(recalculated.customer_total), difference: fromMinor(posted - recalculated.customer_total),
        }));
      }
    } catch (_) { /* بيانات ناقصة — تُغطّيها فحوص أخرى */ }
  }

  // 15) أرصدة افتتاحية مكررة
  const openCount = new Map();
  for (const e of ledger) {
    if (e.transaction_type !== 'opening_balance' || e.reversal_of_id) continue;
    const k = `${e.customer_id}|${e.currency}`;
    openCount.set(k, (openCount.get(k) || 0) + 1);
  }
  for (const [k, n] of openCount) {
    if (n > 1) out.push(finding('DUPLICATE_OPENING_BALANCE', 'high', 'أكثر من رصيد افتتاحي لنفس الحساب/العملة', { key: k, count: n }));
  }

  // 10) تطابق الأرصدة المخزّنة مع الدفتر + سلسلة balance_after
  const byCustomer = new Map();
  // القيود ذات العملة غير الصالحة أُبلغ عنها أعلاه (BAD_CURRENCY) وتُستثنى من إعادة البناء كي لا ينهار الفاحص
  for (const e of ledger.filter((x) => CURRENCIES.includes(String(x.currency || '').toUpperCase()))) {
    if (!byCustomer.has(e.customer_id)) byCustomer.set(e.customer_id, []);
    byCustomer.get(e.customer_id).push(e);
  }
  const customerIds = new Set([...byCustomer.keys(), ...Object.keys(d.balances || {})]);
  for (const cid of customerIds) {
    const rows = byCustomer.get(cid) || [];
    for (const r of rebuildAndCompare(rows, (d.balances || {})[cid] || {})) {
      if (!r.matches) out.push(finding('BALANCE_MISMATCH', 'high', 'الرصيد المخزّن لا يطابق الدفتر', { account: cid, ...r }));
    }
    for (const p of verifyRunningChain(rows)) {
      out.push(finding('RUNNING_BALANCE_BROKEN', 'medium', 'balance_after لا يطابق التراكم', { account: cid, ...p }));
    }
  }

  return out;
};

module.exports = {
  CURRENCIES, TRANSPORT_MODES, AccountingError,
  assertCurrency, toMinor, fromMinor, divRound,
  calcOrderValue, diffPosting, signedToEntry,
  periodStart, periodEnd,
  computeBalances, buildStatement, rebuildAndCompare, verifyRunningChain, runIntegrityChecks,
  balanceSide, sortEntries,
};
