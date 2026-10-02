'use strict';
/**
 * الترحيل المحاسبي للطلب عند التحميل الفعلي.
 *
 * متى ينشأ القيد المالي؟  عند التحميل الفعلي فقط (postActualLoading).
 *   - إنشاء الطلب / التسعير / اعتماد الآجل / إصدار الفاكس  ← لا قيد مالي.
 *   - اعتماد الدفعة ← قيد دائن مستقل للدفعة (payments.service) في عملتها.
 *   - التحميل الفعلي ← قيد مدين واحد لقيمة (الكمية المحملة × السعر − الخصم + النقل على العميل).
 *     وهو لا يُسجّل أي "دائن" للدفعات (تُقيَّد منفصلة عند اعتمادها) ← لا تكرار للدفعة.
 *
 * عدم التكرار: UNIQUE(order_id) في order_accounting_postings + قفل الطلب FOR UPDATE
 *   + مفاتيح idempotency على قيود الدفتر.
 */
const { pool, query } = require('../../config/db');
const engine = require('./accounting.engine');
const ledger = require('./ledger.core');
const { logAudit } = require('../audit/audit.service');

const { toMinor, fromMinor, calcOrderValue, diffPosting, signedToEntry, AccountingError } = engine;

const requireReason = (reason) => {
  if (!reason || String(reason).trim().length < 3) {
    throw new AccountingError('سبب العملية مطلوب', 'REASON_REQUIRED', 400);
  }
  return String(reason).trim();
};
const httpErr = (e) => { const x = new Error(e.message); x.status = e.status || 400; x.code = e.code; if (e.data) x.data = e.data; return x; };
const wrap = (e) => (e instanceof AccountingError ? httpErr(e) : e);

/** من يتحمل أجور النقل؟ (قاعدة وحيدة، لا ازدواج). */
const resolveBeneficiary = (order, fax) => {
  if (order.transport_beneficiary === 'driver' || order.transport_beneficiary === 'trader') return order.transport_beneficiary;
  if (fax.transport_payer === 'trader') return 'trader';
  if (fax.driver_id && fax.is_managed_by_institution !== false && fax.driver_type_snapshot !== 'trader_driver') return 'driver';
  return 'trader';
};

const resolveTransport = (order, fax) => {
  const fromFax = fax.transport_total !== null && fax.transport_total !== undefined ? fax.transport_total : null;
  const amount = fromFax !== null ? fromFax : (order.shipping_amount || 0);
  const mode = order.transport_mode || (toMinor(amount) > 0 ? 'separate' : 'none');
  return {
    mode,
    amount,
    unit: fax.transport_rate_unit || order.transport_unit || 'bag',
    beneficiary: resolveBeneficiary(order, fax),
    requestedQuantity: fax.requested_quantity || null,
  };
};

const sumApprovedPayments = async (client, orderId, currency) => {
  const r = await client.query(
    `SELECT COALESCE(SUM(amount_transferred),0) AS s FROM payments
     WHERE order_id = $1 AND status = 'approved' AND payment_currency = $2`, [orderId, currency]);
  return toMinor(r.rows[0].s);
};

// ───────────────────────── الترحيل ─────────────────────────
// يجب استدعاؤها داخل Transaction مفتوحة بنفس client.
const postActualLoading = async (client, faxId, loadedQuantity, postedBy, notes = null, ctx = {}) => {
  const fRes = await client.query(`
    SELECT f.*, o.order_number, o.customer_id, o.status AS order_status, o.currency,
           o.delivery_type, o.payment_terms, o.total_amount, o.shipping_amount,
           o.transport_beneficiary, o.transport_mode, o.transport_unit, o.accounting_status
    FROM loading_faxes f
    JOIN orders o ON o.id = f.order_id
    WHERE f.id = $1 FOR UPDATE OF f, o`, [faxId]);
  if (!fRes.rows.length) { const e = new Error('الفاكس أو الطلب غير موجود'); e.status = 404; throw e; }
  const fax = fRes.rows[0];

  // عدم التكرار: ترحيل واحد لكل طلب
  const existing = await client.query(`SELECT * FROM order_accounting_postings WHERE order_id = $1 FOR UPDATE`, [fax.order_id]);
  if (existing.rows.length) return { already_posted: true, posting: existing.rows[0] };

  if (['CANCELLED', 'CREDIT_REJECTED'].includes(String(fax.order_status).toUpperCase())) {
    const e = new Error('لا يمكن ترحيل طلب ملغى أو مرفوض'); e.status = 400; throw e;
  }

  const items = await client.query(`
    SELECT oi.id, oi.product_id, oi.source_id, oi.quantity, oi.unit, oi.unit_price, COALESCE(oi.discount,0) AS discount
    FROM order_items oi WHERE oi.order_id = $1 ORDER BY oi.id`, [fax.order_id]);
  if (!items.rows.length) { const e = new Error('لا توجد أصناف في الطلب'); e.status = 400; throw e; }
  if (items.rows.some((x) => x.unit_price === null || x.unit_price === undefined)) {
    const e = new Error('الطلب غير مسعّر — لا يمكن الترحيل بسعر غير معتمد'); e.status = 400; throw e;
  }

  let calc;
  try {
    calc = calcOrderValue({
      items: items.rows.map((x) => ({ quantity: x.quantity, unitPrice: x.unit_price, discount: x.discount })),
      loadedQuantity,
      currency: fax.currency || 'YER',
      transport: resolveTransport(fax, fax),
    });
  } catch (err) { throw wrap(err); }

  const requestedQty = toMinor(fax.requested_quantity || calc.requested_quantity);
  const discrepancy = toMinor(loadedQuantity) - requestedQty;
  const cur = calc.currency;
  const ref = fax.fax_number || fax.order_number;

  // 1) قيد البيع الفعلي (مدين) — مرة واحدة
  let sale;
  try {
    sale = await ledger.postCustomerEntry(client, {
      customerId: fax.customer_id, orderId: fax.order_id, currency: cur,
      debit: fromMinor(calc.customer_total), credit: 0,
      transactionType: 'actual_sale',
      description: `بيع فعلي عند تحميل الطلب ${fax.order_number} — الكمية ${calc.loaded_quantity}`,
      paymentMethod: fax.payment_terms || null, referenceCode: ref,
      sourceType: 'order_fulfillment', sourceId: fax.order_id,
      idempotencyKey: `order:${fax.order_id}:sale`, createdBy: postedBy,
    });
  } catch (err) { throw wrap(err); }
  if (sale.duplicate) return { already_posted: true, posting: null };

  // 2) نقل السائق — يُسوّى مقابل ما قُيّد سابقًا (بيانات قديمة) فلا يتكرر
  let driverPosted = 0;
  const driverManaged = fax.driver_id && fax.is_managed_by_institution !== false;
  if (driverManaged) {
    const prior = await client.query(
      `SELECT COALESCE(SUM(debit),0) - COALESCE(SUM(credit),0) AS net FROM driver_ledger
       WHERE order_id = $1 AND transaction_type IN ('transport_due','transport_adjustment','transport_reversal')`, [fax.order_id]);
    const priorNet = toMinor(prior.rows[0].net);
    const delta = calc.driver_transport - priorNet;
    if (delta !== 0) {
      const e = signedToEntry(delta);
      await ledger.postDriverEntry(client, {
        driverId: fax.driver_id, orderId: fax.order_id, currency: 'YER',
        debit: fromMinor(e.debit), credit: fromMinor(e.credit),
        transactionType: priorNet === 0 ? 'transport_due' : 'transport_adjustment',
        description: `أجور نقل فعلية للطلب ${fax.order_number}`, referenceCode: ref,
        sourceType: 'order_fulfillment', sourceId: fax.order_id,
        idempotencyKey: `order:${fax.order_id}:driver-transport`, createdBy: postedBy,
      });
    }
    driverPosted = calc.driver_transport;
  }

  // 3) كمية المصنع (مرة واحدة لكل طلب)
  await client.query(`
    INSERT INTO factory_ledger
      (factory_id, order_id, fax_id, transaction_type, quantity, unit, description, reference_code, created_by)
    SELECT $1,$2,$3,'actual_loading',$4,$5,$6,$7,$8
    WHERE NOT EXISTS (SELECT 1 FROM factory_ledger WHERE order_id = $2 AND transaction_type = 'actual_loading')`, [
    fax.factory_id, fax.order_id, fax.id, calc.loaded_quantity, items.rows[0].unit || 'bag',
    `تحميل فعلي للطلب ${fax.order_number}`, ref, postedBy]);

  // 4) المخزون بالكمية الفعلية، وفك حجز الكمية المطلوبة
  const reqTotal = items.rows.reduce((s, x) => s + toMinor(x.quantity), 0);
  for (const item of items.rows) {
    const itemLoaded = fromMinor(Math.round(toMinor(calc.loaded_quantity) * toMinor(item.quantity) / reqTotal));
    await client.query(`
      UPDATE inventory
      SET available_qty = GREATEST(0, available_qty - $1),
          reserved_qty = GREATEST(0, reserved_qty - $2), updated_at = NOW()
      WHERE product_id = $3`, [itemLoaded, item.quantity, item.product_id]);
  }

  // 5) المدفوع (عرض فقط — القيود الدائنة تُنشأ عند اعتماد كل دفعة)
  const paid = await sumApprovedPayments(client, fax.order_id, cur);
  const remaining = Math.max(0, calc.customer_total - paid);

  await client.query(`
    UPDATE orders SET quantity_loaded=$1, quantity_discrepancy=$2,
      final_loaded_quantity=$1, loaded_at=NOW(), final_subtotal=$3,
      final_shipping_amount=$4, final_total_amount=$5, final_remaining_amount=$6,
      paid_amount=$9, remaining_amount=$6,
      accounting_status='POSTED', accounting_posted_at=NOW(),
      accounting_note=$7, status='LOADED', loading_completed_at=NOW(), updated_at=NOW()
    WHERE id=$8`, [calc.loaded_quantity, fromMinor(discrepancy), fromMinor(calc.cement_net),
    fromMinor(calc.customer_transport), fromMinor(calc.customer_total), fromMinor(remaining),
    notes || 'تم الترحيل عند التحميل الفعلي', fax.order_id, fromMinor(paid)]);

  const posting = await client.query(`
    INSERT INTO order_accounting_postings
      (order_id,fax_id,loaded_quantity,customer_debit,customer_payment_credit,
       driver_transport_debit,trader_transport_amount,posted_by,notes,currency)
    VALUES ($1,$2,$3,$4,0,$5,$6,$7,$8,$9)
    ON CONFLICT (order_id) DO NOTHING RETURNING *`, [
    fax.order_id, fax.id, calc.loaded_quantity, fromMinor(calc.customer_total),
    fromMinor(driverPosted), fromMinor(calc.customer_transport), postedBy, notes || null, cur]);
  if (!posting.rows.length) return { already_posted: true, posting: null };

  await client.query(`
    INSERT INTO order_status_history (order_id,from_status,to_status,changed_by,reason)
    VALUES ($1,$2,'LOADED',$3,$4)`, [fax.order_id, fax.order_status, postedBy, `تم التحميل الفعلي ${calc.loaded_quantity} وترحيل الحسابات`]);
  await client.query(`
    INSERT INTO automation_events (event_type,entity_type,entity_id,payload)
    VALUES ('order.accounting_posted','orders',$1,$2)`, [
    fax.order_id, JSON.stringify({ fax_id: fax.id, loaded_quantity: calc.loaded_quantity, final_total: fromMinor(calc.customer_total), currency: cur })]);
  await logAudit(client, {
    userId: postedBy, action: 'ORDER_POSTED', entityType: 'orders', entityId: fax.order_id, entityRef: fax.order_number,
    newValues: {
      currency: cur, requested_quantity: calc.requested_quantity, loaded_quantity: calc.loaded_quantity,
      cement_gross: fromMinor(calc.cement_gross), discount: fromMinor(calc.discount),
      transport_total: fromMinor(calc.transport_total), transport_beneficiary: calc.beneficiary,
      customer_debit: fromMinor(calc.customer_total), driver_transport: fromMinor(driverPosted),
    }, reason: notes || 'ترحيل عند التحميل الفعلي', ip: ctx.ip, userAgent: ctx.userAgent,
  });

  return {
    already_posted: false, posting: posting.rows[0], order_id: fax.order_id, order_number: fax.order_number,
    currency: cur, loaded_quantity: calc.loaded_quantity, discrepancy: fromMinor(discrepancy),
    final_subtotal: fromMinor(calc.cement_net), final_shipping_amount: fromMinor(calc.customer_transport),
    final_total_amount: fromMinor(calc.customer_total), paid_amount: fromMinor(paid),
    final_remaining_amount: fromMinor(remaining), driver_transport: fromMinor(driverPosted),
    customer_balance: sale.balance,
  };
};

// ───────────────────────── تسوية بعد الترحيل ─────────────────────────
/**
 * تعديل السعر/الخصم/الكمية المحملة/النقل بعد الترحيل.
 * لا يُضاف مبلغ جديد فوق القديم: يُحسب الفرق عن المرحّل فعلًا ويُقيَّد قيد تسوية بالفرق فقط.
 */
const adjustPostedOrder = async (orderId, input, userId, ctx = {}) => {
  const reason = requireReason(input.reason);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const o = await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [orderId]);
    if (!o.rows.length) { const e = new Error('الطلب غير موجود'); e.status = 404; throw e; }
    const order = o.rows[0];
    const p = await client.query(`SELECT * FROM order_accounting_postings WHERE order_id = $1 FOR UPDATE`, [orderId]);
    if (!p.rows.length || p.rows[0].reversed_at) {
      const e = new Error('الطلب غير مرحّل (أو تم عكس ترحيله)'); e.status = 400; throw e;
    }
    const posting = p.rows[0];
    const fx = await client.query(
      `SELECT * FROM loading_faxes WHERE order_id = $1 AND status = 'USED' ORDER BY used_at DESC NULLS LAST LIMIT 1 FOR UPDATE`, [orderId]);
    if (!fx.rows.length) { const e = new Error('لا يوجد فاكس محمّل لهذا الطلب'); e.status = 400; throw e; }
    const fax = fx.rows[0];
    const itemsBefore = (await client.query(`SELECT * FROM order_items WHERE order_id = $1 ORDER BY id`, [orderId])).rows;

    const oldValues = {
      loaded_quantity: posting.loaded_quantity, customer_debit: posting.customer_debit,
      driver_transport_debit: posting.driver_transport_debit,
      items: itemsBefore.map((i) => ({ id: i.id, unit_price: i.unit_price, discount: i.discount })),
      transport_total: fax.transport_total,
    };

    const byId = new Map(itemsBefore.map((i) => [i.id, i]));
    const items = itemsBefore.map((i) => ({ ...i }));
    for (const upd of input.items || []) {
      const it = items.find((x) => x.id === upd.orderItemId);
      if (!it) throw new AccountingError(`عنصر غير موجود: ${upd.orderItemId}`, 'ITEM_NOT_FOUND', 404);
      if (upd.unitPrice !== undefined) it.unit_price = upd.unitPrice;
      if (upd.discount !== undefined) it.discount = upd.discount;
    }
    const newLoaded = input.loadedQuantity !== undefined ? input.loadedQuantity : posting.loaded_quantity;
    const faxAdj = { ...fax };
    if (input.transportAmount !== undefined) faxAdj.transport_total = input.transportAmount;

    const next = calcOrderValue({
      items: items.map((x) => ({ quantity: x.quantity, unitPrice: x.unit_price, discount: x.discount || 0 })),
      loadedQuantity: newLoaded, currency: order.currency || 'YER',
      transport: resolveTransport({ ...order }, faxAdj),
    });
    const prev = { customer_total: toMinor(posting.customer_debit), driver_transport: toMinor(posting.driver_transport_debit) };
    const delta = diffPosting(prev, next);
    const qtyDiff = toMinor(newLoaded) - toMinor(posting.loaded_quantity);
    const itemsChanged = (input.items || []).length > 0;
    const transportChanged = input.transportAmount !== undefined && toMinor(input.transportAmount) !== toMinor(fax.transport_total);
    if (delta.customer_delta === 0 && delta.driver_delta === 0 && qtyDiff === 0 && !itemsChanged && !transportChanged) {
      await client.query('ROLLBACK');
      return { unchanged: true, order_id: orderId };
    }

    for (const it of items) {
      const before = byId.get(it.id);
      if (toMinor(before.unit_price) !== toMinor(it.unit_price) || toMinor(before.discount) !== toMinor(it.discount)) {
        const lineTotal = fromMinor(Math.round(toMinor(it.unit_price) * toMinor(it.quantity) / 100) - toMinor(it.discount || 0));
        await client.query(`UPDATE order_items SET unit_price=$1, discount=$2, line_total=$3 WHERE id=$4`,
          [fromMinor(toMinor(it.unit_price)), fromMinor(toMinor(it.discount || 0)), lineTotal, it.id]);
      }
    }
    if (transportChanged) {
      await client.query(
        `UPDATE loading_faxes SET transport_previous_rate = transport_rate, transport_total = $1,
           transport_edit_reason = $2, updated_at = NOW() WHERE id = $3`, [fromMinor(toMinor(input.transportAmount)), reason, fax.id]);
    }
    if (qtyDiff !== 0) {
      await client.query(
        `UPDATE loading_faxes SET loaded_quantity = $1,
           quantity_discrepancy = $1 - COALESCE(requested_quantity, $1), updated_at = NOW() WHERE id = $2`, [next.loaded_quantity, fax.id]);
      await client.query(
        `INSERT INTO factory_ledger (factory_id, order_id, fax_id, transaction_type, quantity, unit, description, reference_code, created_by)
         VALUES ($1,$2,$3,'loading_adjustment',$4,$5,$6,$7,$8)`,
        [fax.factory_id, orderId, fax.id, fromMinor(qtyDiff), itemsBefore[0].unit || 'bag',
          `تسوية كمية التحميل للطلب ${order.order_number}: ${reason}`, fax.fax_number || order.order_number, userId]);
      const reqTotal = itemsBefore.reduce((s, x) => s + toMinor(x.quantity), 0);
      for (const item of itemsBefore) {
        const share = fromMinor(Math.round(qtyDiff * toMinor(item.quantity) / reqTotal));
        await client.query(`UPDATE inventory SET available_qty = GREATEST(0, available_qty - $1), updated_at = NOW() WHERE product_id = $2`, [share, item.product_id]);
      }
    }

    const n = Number(posting.adjustment_count || 0) + 1;
    const ref = fax.fax_number || order.order_number;
    let customerEntry = null;
    if (delta.customer_delta !== 0) {
      const e = signedToEntry(delta.customer_delta);
      customerEntry = await ledger.postCustomerEntry(client, {
        customerId: order.customer_id, orderId, currency: next.currency,
        debit: fromMinor(e.debit), credit: fromMinor(e.credit), transactionType: 'adjustment',
        description: `تسوية بعد الترحيل للطلب ${order.order_number}: ${reason}`, referenceCode: `${ref}-ADJ${n}`,
        sourceType: 'order_adjustment', sourceId: orderId, idempotencyKey: `order:${orderId}:adj:${n}`,
        reason, createdBy: userId,
      });
    }
    const driverManaged = fax.driver_id && fax.is_managed_by_institution !== false;
    if (delta.driver_delta !== 0 && driverManaged) {
      const e = signedToEntry(delta.driver_delta);
      await ledger.postDriverEntry(client, {
        driverId: fax.driver_id, orderId, currency: 'YER', debit: fromMinor(e.debit), credit: fromMinor(e.credit),
        transactionType: 'transport_adjustment', description: `تسوية نقل الطلب ${order.order_number}: ${reason}`,
        referenceCode: `${ref}-ADJ${n}`, sourceType: 'order_adjustment', sourceId: orderId,
        idempotencyKey: `order:${orderId}:driver-adj:${n}`, reason, createdBy: userId,
      });
    }

    const paid = await sumApprovedPayments(client, orderId, next.currency);
    const remaining = Math.max(0, next.customer_total - paid);
    await client.query(
      `UPDATE order_accounting_postings SET loaded_quantity=$1, customer_debit=$2, driver_transport_debit=$3,
         trader_transport_amount=$4, adjustment_count=$5, adjusted_at=NOW() WHERE order_id=$6`,
      [next.loaded_quantity, fromMinor(next.customer_total), fromMinor(next.driver_transport), fromMinor(next.customer_transport), n, orderId]);
    await client.query(
      `UPDATE orders SET quantity_loaded=$1, final_loaded_quantity=$1, final_subtotal=$2, final_shipping_amount=$3,
         final_total_amount=$4, final_remaining_amount=$5, remaining_amount=$5, paid_amount=$6, updated_at=NOW() WHERE id=$7`,
      [next.loaded_quantity, fromMinor(next.cement_net), fromMinor(next.customer_transport), fromMinor(next.customer_total),
        fromMinor(remaining), fromMinor(paid), orderId]);

    await logAudit(client, {
      userId, action: 'ORDER_POSTING_ADJUSTED', entityType: 'orders', entityId: orderId, entityRef: order.order_number,
      oldValues, reason, ip: ctx.ip, userAgent: ctx.userAgent,
      newValues: {
        loaded_quantity: next.loaded_quantity, customer_debit: fromMinor(next.customer_total),
        driver_transport_debit: fromMinor(next.driver_transport), customer_delta: fromMinor(delta.customer_delta),
        driver_delta: fromMinor(delta.driver_delta), adjustment_no: n,
        items: items.map((i) => ({ id: i.id, unit_price: i.unit_price, discount: i.discount })),
      },
    });
    await client.query('COMMIT');
    return {
      unchanged: false, order_id: orderId, currency: next.currency, adjustment_no: n,
      customer_delta: fromMinor(delta.customer_delta), driver_delta: fromMinor(delta.driver_delta),
      new_customer_total: fromMinor(next.customer_total), customer_balance: customerEntry ? customerEntry.balance : null,
    };
  } catch (e) {
    await client.query('ROLLBACK');
    throw wrap(e);
  } finally { client.release(); }
};

// ───────────────────────── عكس الترحيل (إلغاء طلب مرحّل) ─────────────────────────
const reverseOrderPosting = async (orderId, { reason }, userId, ctx = {}) => {
  const why = requireReason(reason);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const o = await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [orderId]);
    if (!o.rows.length) { const e = new Error('الطلب غير موجود'); e.status = 404; throw e; }
    const order = o.rows[0];
    const p = await client.query(`SELECT * FROM order_accounting_postings WHERE order_id = $1 FOR UPDATE`, [orderId]);
    if (!p.rows.length) { const e = new Error('الطلب غير مرحّل'); e.status = 400; throw e; }
    if (p.rows[0].reversed_at) {
      await client.query('ROLLBACK');
      return { order_id: orderId, already_reversed: true };
    }
    const posting = p.rows[0];

    // عكس كل قيود الطلب الفعّالة (بيع + تسويات) — الدفعات لا تُعكس (تبقى رصيدًا دائنًا للعميل)
    const active = await client.query(
      `SELECT cl.* FROM customer_ledger cl
       WHERE cl.order_id = $1 AND cl.source_type IN ('order_fulfillment','order_adjustment') AND cl.reversal_of_id IS NULL
         AND NOT EXISTS (SELECT 1 FROM customer_ledger r WHERE r.reversal_of_id = cl.id)
       ORDER BY cl.seq`, [orderId]);
    const reversed = [];
    for (const row of active.rows) {
      const r = await ledger.reverseCustomerEntry(client, row.id, { reason: why, userId });
      reversed.push(r.entry.id);
    }
    const dActive = await client.query(
      `SELECT dl.* FROM driver_ledger dl
       WHERE dl.order_id = $1 AND dl.transaction_type IN ('transport_due','transport_adjustment') AND dl.reversal_of_id IS NULL
         AND NOT EXISTS (SELECT 1 FROM driver_ledger r WHERE r.reversal_of_id = dl.id)`, [orderId]);
    for (const row of dActive.rows) {
      await ledger.postDriverEntry(client, {
        driverId: row.driver_id, orderId, currency: row.currency || 'YER',
        debit: row.credit, credit: row.debit, transactionType: 'transport_reversal',
        description: `عكس نقل الطلب ${order.order_number}: ${why}`, referenceCode: row.reference_code || `REV-${row.id}`,
        sourceType: 'order_reversal', sourceId: orderId, idempotencyKey: `reverse:${row.id}`,
        reversalOfId: row.id, reason: why, createdBy: userId,
      });
    }

    // الكمية: إرجاع المخزون وقيد عكس في دفتر المصنع
    const loadedNow = toMinor(posting.loaded_quantity);
    const items = (await client.query(`SELECT product_id, quantity, unit FROM order_items WHERE order_id = $1`, [orderId])).rows;
    const fl = await client.query(`SELECT factory_id, fax_id, unit FROM factory_ledger WHERE order_id = $1 AND transaction_type = 'actual_loading' LIMIT 1`, [orderId]);
    if (fl.rows.length) {
      await client.query(
        `INSERT INTO factory_ledger (factory_id, order_id, fax_id, transaction_type, quantity, unit, description, reference_code, created_by)
         SELECT $1,$2,$3,'loading_reversal',$4,$5,$6,$7,$8
         WHERE NOT EXISTS (SELECT 1 FROM factory_ledger WHERE order_id = $2 AND transaction_type = 'loading_reversal')`,
        [fl.rows[0].factory_id, orderId, fl.rows[0].fax_id, fromMinor(-loadedNow), fl.rows[0].unit || 'bag',
          `عكس تحميل الطلب ${order.order_number}: ${why}`, order.order_number, userId]);
    }
    const reqTotal = items.reduce((s, x) => s + toMinor(x.quantity), 0) || 1;
    for (const it of items) {
      const share = fromMinor(Math.round(loadedNow * toMinor(it.quantity) / reqTotal));
      await client.query(`UPDATE inventory SET available_qty = available_qty + $1, updated_at = NOW() WHERE product_id = $2`, [share, it.product_id]);
    }

    await client.query(`UPDATE order_accounting_postings SET reversed_at = NOW(), reversal_reason = $1 WHERE order_id = $2`, [why, orderId]);
    await client.query(
      `UPDATE orders SET accounting_status = 'REVERSED', status = 'CANCELLED', accounting_note = $1, updated_at = NOW() WHERE id = $2`, [why, orderId]);
    await client.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, reason) VALUES ($1,$2,'CANCELLED',$3,$4)`,
      [orderId, order.status, userId, `عكس الترحيل: ${why}`]);
    await logAudit(client, {
      userId, action: 'ORDER_POSTING_REVERSED', entityType: 'orders', entityId: orderId, entityRef: order.order_number,
      oldValues: { status: order.status, accounting_status: order.accounting_status, customer_debit: posting.customer_debit, loaded_quantity: posting.loaded_quantity },
      newValues: { reversed_entries: reversed, status: 'CANCELLED', accounting_status: 'REVERSED' },
      reason: why, ip: ctx.ip, userAgent: ctx.userAgent,
    });
    await client.query('COMMIT');
    return { order_id: orderId, reversed_entries: reversed, status: 'CANCELLED', accounting_status: 'REVERSED' };
  } catch (e) {
    await client.query('ROLLBACK');
    throw wrap(e);
  } finally { client.release(); }
};

// ───────────────────────── استعلامات ─────────────────────────
const listAwaitingPosting = async () => {
  const r = await query(`
    SELECT o.id,o.order_number,o.status,o.accounting_status,o.total_amount,o.final_total_amount,o.currency,
      o.quantity_loaded,f.id AS fax_id,f.fax_number,f.loaded_quantity,f.requested_quantity,
      s.name_ar AS factory_name,d.full_name AS driver_name,v.plate_number,u.full_name AS customer_name
    FROM orders o
    JOIN loading_faxes f ON f.order_id=o.id
    LEFT JOIN product_sources s ON s.id=f.factory_id
    LEFT JOIN drivers d ON d.id=f.driver_id
    LEFT JOIN vehicles v ON v.id=f.vehicle_id
    JOIN customers c ON c.id=o.customer_id JOIN users u ON u.id=c.user_id
    WHERE f.status='USED' AND COALESCE(o.accounting_status,'PENDING') NOT IN ('POSTED','REVERSED')
    ORDER BY f.used_at ASC NULLS LAST`);
  return r.rows;
};

const getOrderAccounting = async (orderId) => {
  const order = await query(`SELECT id,order_number,status,currency,accounting_status,final_loaded_quantity,
    final_subtotal,final_shipping_amount,final_total_amount,final_remaining_amount,
    accounting_posted_at,customer_id,fax_id FROM orders WHERE id=$1`, [orderId]);
  if (!order.rows.length) return null;
  const [posting, customer, driver, factory] = await Promise.all([
    query(`SELECT * FROM order_accounting_postings WHERE order_id=$1`, [orderId]),
    query(`SELECT * FROM customer_ledger WHERE order_id=$1 ORDER BY seq`, [orderId]),
    query(`SELECT dl.*,d.full_name AS driver_name FROM driver_ledger dl JOIN drivers d ON d.id=dl.driver_id WHERE dl.order_id=$1 ORDER BY dl.created_at`, [orderId]),
    query(`SELECT fl.*,s.name_ar AS factory_name FROM factory_ledger fl JOIN product_sources s ON s.id=fl.factory_id WHERE fl.order_id=$1 ORDER BY fl.created_at`, [orderId]),
  ]);
  return { order: order.rows[0], posting: posting.rows[0] || null, customer_ledger: customer.rows, driver_ledger: driver.rows, factory_ledger: factory.rows };
};

const postExistingLoadedOrder = async (orderId, userId, notes, ctx = {}) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const f = await client.query(
      `SELECT id, loaded_quantity FROM loading_faxes WHERE order_id=$1 AND status='USED' ORDER BY used_at DESC NULLS LAST LIMIT 1`, [orderId]);
    if (!f.rows.length) { const e = new Error('لا يوجد فاكس محمّل يمكن ترحيله'); e.status = 400; throw e; }
    const result = await postActualLoading(client, f.rows[0].id, f.rows[0].loaded_quantity, userId, notes, ctx);
    await client.query('COMMIT');
    return result;
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
};

module.exports = {
  postActualLoading, listAwaitingPosting, getOrderAccounting, postExistingLoadedOrder,
  adjustPostedOrder, reverseOrderPosting, resolveBeneficiary, resolveTransport,
};
