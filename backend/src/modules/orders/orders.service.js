const { pool, query } = require('../../config/db');
const transportService = require('./transport.service');
const ledgerService = require('../customers/ledger.service');
const engine = require('../accounting/accounting.engine');
const { logAudit } = require('../audit/audit.service');
const ceilingsService = require('../ceilings/ceilings.service');

const generateOrderNumber = async () => {
  const year = new Date().getFullYear();
  const r = await query(
    `SELECT COUNT(*) FROM orders WHERE order_number LIKE $1`,
    [`GHO-${year}-%`]
  );
  return `GHO-${year}-${String(parseInt(r.rows[0].count, 10) + 1).padStart(6, '0')}`;
};

const checkCreditAvailability = async (client, customerId, additionalAmount) => {
  const cust = await client.query(
    `SELECT current_balance, credit_limit FROM customers WHERE id = $1`,
    [customerId]
  );
  if (cust.rows.length === 0) {
    const err = new Error('العميل غير موجود');
    err.status = 404;
    throw err;
  }
  const balance = parseFloat(cust.rows[0].current_balance || 0);
  const limit = parseFloat(cust.rows[0].credit_limit || 0);

  const pending = await client.query(
    `SELECT COALESCE(SUM(credit_amount), 0) AS total FROM orders
     WHERE customer_id = $1 AND status = 'PENDING_ADMIN_APPROVAL'`,
    [customerId]
  );
  const pendingBalance = parseFloat(pending.rows[0].total || 0);
  const total = balance + pendingBalance + additionalAmount;
  const unlimited = limit === 0;

  return {
    current_balance: balance,
    pending_balance: pendingBalance,
    additional_amount: additionalAmount,
    total_after: total,
    credit_limit: limit,
    has_limit: !unlimited,
    can_approve: unlimited || total <= limit,
    available_credit: unlimited ? null : Math.max(0, limit - balance - pendingBalance),
  };
};

const createOrder = async (userId, data) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const cust = await client.query(
      `SELECT id, customer_type, current_balance, credit_limit, governorate, area
       FROM customers WHERE user_id = $1`,
      [userId]
    );
    if (cust.rows.length === 0) {
      const err = new Error('العميل غير موجود');
      err.status = 404;
      throw err;
    }
    const customerId = cust.rows[0].id;
    const customer = cust.rows[0];

    let addressId = data.addressId;

    if (data.deliveryType === 'alghouli_delivery') {
      if (!addressId) {
        const err = new Error('عنوان التسليم مطلوب');
        err.status = 400;
        throw err;
      }
      const a = await client.query(
        `SELECT id FROM customer_addresses WHERE id = $1 AND customer_id = $2`,
        [addressId, customerId]
      );
      if (a.rows.length === 0) {
        const err = new Error('العنوان غير موجود');
        err.status = 404;
        throw err;
      }
    } else if (data.deliveryType === 'trader_pickup') {
      if (!data.traderTruckPlate || !data.traderDriverName) {
        const err = new Error('رقم الشاحنة واسم السائق مطلوبان');
        err.status = 400;
        throw err;
      }
      if (data.traderDriverId) {
        const d = await client.query(
          `SELECT id FROM drivers WHERE id = $1 AND owner_trader_id = $2`,
          [data.traderDriverId, customerId]
        );
        if (!d.rows.length) {
          const err = new Error('السائق المختار لا يتبع حسابك');
          err.status = 403;
          throw err;
        }
      }
      if (data.traderVehicleId) {
        const v = await client.query(
          `SELECT id, owner_trader_id, current_driver_id FROM vehicles WHERE id = $1`,
          [data.traderVehicleId]
        );
        if (!v.rows.length || v.rows[0].owner_trader_id !== customerId ||
            (data.traderDriverId && v.rows[0].current_driver_id && v.rows[0].current_driver_id !== data.traderDriverId)) {
          const err = new Error('القاطرة المختارة لا تتبع حسابك أو لا ترتبط بالسائق');
          err.status = 403;
          throw err;
        }
      }
      if (data.faxRequested && (!data.traderDriverId || !data.traderVehicleId)) {
        const err = new Error('للطلب مع الفاكس يجب اختيار السائق والقاطرة من حسابك');
        err.status = 400;
        throw err;
      }
      const ex = await client.query(
        `SELECT id FROM customer_addresses WHERE customer_id = $1 AND is_default = true LIMIT 1`,
        [customerId]
      );
      if (ex.rows.length > 0) {
        addressId = ex.rows[0].id;
      } else {
        const n = await client.query(
          `INSERT INTO customer_addresses
           (customer_id, label, governorate, area, address_text, is_default)
           VALUES ($1, 'افتراضي', $2, $3, 'يُحدد', true) RETURNING id`,
          [customerId, customer.governorate || 'صنعاء', customer.area || '']
        );
        addressId = n.rows[0].id;
      }
    }

    // لا يُحدَّد سعر هنا إطلاقًا (مواصفة الواجهة الجديدة، بند 13/17/21): العميل يختار
    // المصنع والنوع والكمية فقط، والموظف المخوَّل يحدد السعر لاحقًا عبر setOrderPricing.
    const items = [];
    for (const item of data.items) {
      const p = await client.query(
        `SELECT p.id, p.source_id, p.packaging_type, p.name_ar,
                COALESCE(i.unit, CASE WHEN p.packaging_type = 'bagged' THEN 'bag' ELSE 'ton' END) AS unit,
                COALESCE(i.available_qty, 0) AS available_qty
         FROM products p
         LEFT JOIN inventory i ON i.product_id = p.id
         WHERE p.id = $1`,
        [item.productId]
      );
      if (p.rows.length === 0) {
        const err = new Error('المنتج غير موجود');
        err.status = 404;
        throw err;
      }
      const product = p.rows[0];

      if (parseFloat(product.available_qty) < item.quantity) {
        const err = new Error(`الكمية غير كافية من: ${product.name_ar}`);
        err.status = 400;
        err.code = 'INSUFFICIENT_STOCK';
        throw err;
      }

      items.push({
        productId: product.id,
        sourceId: product.source_id,
        packagingType: item.packagingType || product.packaging_type,
        quantity: item.quantity,
        unit: product.unit,
      });
    }

    // فحص سقوف الكمية (بند 28) — يعتمد على الكمية فقط لأن السعر غير معروف بعد.
    // سقوف القيمة (بالريال) تُفحص لاحقًا عند التسعير في setOrderPricing.
    try {
      const bySource = {};
      for (const it of items) {
        const s = (bySource[it.sourceId] ||= { bags: 0 });
        if (it.unit === 'bag') s.bags += it.quantity;
      }
      for (const [sourceId, agg] of Object.entries(bySource)) {
        const check = await ceilingsService.checkOrderCeilings(client, {
          customerId, sourceId, categoryId: null,
          requestedBags: agg.bags, requestedAmount: 0,
        });
        if (check.exceeded) {
          const err = new Error('تم تجاوز السقف المسموح به لهذا الطلب. يمكنك إرسال طلب موافقة استثنائية.');
          err.status = 400;
          err.code = 'CEILING_EXCEEDED';
          err.data = check.results.filter((r) => r.exceeded);
          throw err;
        }
      }
    } catch (ceilErr) {
      if (ceilErr.code === 'CEILING_EXCEEDED') throw ceilErr;
      console.error('تحذير: تعذّر فحص سقوف الطلبات (تم تجاوز الفحص):', ceilErr.message);
    }

    const initialStatus = 'PENDING_PRICING';
    const orderNumber = await generateOrderNumber();

    const o = await client.query(
      `INSERT INTO orders
       (order_number, customer_id, address_id, status, source,
        subtotal, discount_amount, shipping_amount, total_amount,
        paid_amount, remaining_amount, notes, created_by,
        delivery_type, trader_truck_plate, trader_driver_name, trader_driver_phone,
        transport_unit, trader_driver_id, trader_vehicle_id, fax_requested, transport_beneficiary,
        transport_beneficiary_trader_id, factory_id)
       VALUES ($1, $2, $3, $4, 'ONLINE',
               NULL, 0, NULL, NULL, 0, NULL, $5, $6,
               $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       RETURNING id, order_number, status, created_at`,
      [
        orderNumber, customerId, addressId, initialStatus,
        data.notes || null, userId,
        data.deliveryType, data.traderTruckPlate || null,
        data.traderDriverName || null, data.traderDriverPhone || null,
        items[0]?.unit || 'bag', data.traderDriverId || null, data.traderVehicleId || null,
        !!data.faxRequested, data.transportBeneficiary || null,
        data.transportBeneficiary === 'trader' ? customerId : null,
        items[0]?.sourceId || null,
      ]
    );
    const order = o.rows[0];

    for (const it of items) {
      // اجلب source_id و unit من المنتج
      const pInfo = await client.query(
        `SELECT source_id, unit FROM products WHERE id = $1`,
        [it.productId]
      );
      const sourceId = it.sourceId || pInfo.rows[0]?.source_id || null;
      const unit = it.unit || pInfo.rows[0]?.unit || 'bag';
      const packagingType = it.packagingType || 'bagged';

      await client.query(
        `INSERT INTO order_items
         (order_id, product_id, source_id, packaging_type, quantity, unit,
          unit_price, discount, line_total)
         VALUES ($1, $2, $3, $4, $5, $6, NULL, 0, NULL)`,
        [order.id, it.productId, sourceId, packagingType, it.quantity, unit]
      );
      await client.query(
        `UPDATE inventory SET reserved_qty = reserved_qty + $1, updated_at = NOW()
         WHERE product_id = $2`,
        [it.quantity, it.productId]
      );
    }

    await client.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, reason)
       VALUES ($1, NULL, $2, $3, 'طلب جديد بانتظار التسعير')`,
      [order.id, initialStatus, userId]
    );

    await client.query('COMMIT');
    return { ...order, delivery_type: data.deliveryType, fax_requested: !!data.faxRequested, transport_beneficiary: data.transportBeneficiary || null };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * تسعير الطلب من موظف مخوَّل (بند 21-23): يحدد سعر كل عنصر + أجرة النقل، وتُحسب
 * القيمة الإجمالية تلقائيًا. لا يمكن للعميل رؤية أي سعر قبل هذه الخطوة، ولا يمكن
 * تسعير طلب أكثر من مرة عبر هذا المسار (تعديل لاحق يكون عبر إجراء منفصل + سجل تعديل).
 */
const setOrderPricing = async (orderId, staffUserId, data) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const o = await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [orderId]);
    if (o.rows.length === 0) { const e = new Error('الطلب غير موجود'); e.status = 404; throw e; }
    const order = o.rows[0];
    if (order.status !== 'PENDING_PRICING') {
      const e = new Error('لا يمكن تسعير الطلب في حالته الحالية'); e.status = 400; throw e;
    }

    const existingItems = await client.query(`SELECT * FROM order_items WHERE order_id = $1`, [orderId]);
    const priceById = new Map((data.items || []).map((i) => [i.orderItemId, i]));
    const { toMinor, fromMinor } = engine;
    const currency = engine.assertCurrency(data.currency || order.currency || 'YER');
    const transportMode = ['none', 'separate', 'included'].includes(data.transportMode)
      ? data.transportMode : (toMinor(data.transportAmount || 0) > 0 ? 'separate' : 'none');

    // الحساب بوحدات صحيحة: سعر الكيس × الكمية − الخصم (الخصم على الأسمنت فقط ومرة واحدة)
    let subtotalM = 0;
    let bySourceAmount = {};
    const lines = [];
    for (const item of existingItems.rows) {
      const input = priceById.get(item.id);
      if (!input) { const e = new Error(`سعر مفقود لعنصر الطلب ${item.id}`); e.status = 400; throw e; }
      const unitM = toMinor(input.unitPrice);
      const discM = toMinor(input.discount || 0);
      if (unitM < 0) { const e = new Error('سعر غير صحيح'); e.status = 400; throw e; }
      const grossM = engine.divRound(BigInt(unitM) * BigInt(toMinor(item.quantity)), 100n);
      if (discM < 0 || discM > grossM) { const e = new Error('الخصم غير صالح أو أكبر من قيمة الصنف'); e.status = 400; throw e; }
      const lineM = grossM - discM;
      subtotalM += lineM;
      bySourceAmount[item.source_id] = (bySourceAmount[item.source_id] || 0) + lineM / 100;
      lines.push({ id: item.id, unitM, discM, lineM, old: { unit_price: item.unit_price, discount: item.discount } });
    }
    for (const l of lines) {
      await client.query(
        `UPDATE order_items SET unit_price = $1, discount = $2, line_total = $3 WHERE id = $4`,
        [fromMinor(l.unitM), fromMinor(l.discM), fromMinor(l.lineM), l.id]
      );
    }

    // السعر الشامل للنقل: لا يُضاف نقل ثانٍ على الفاتورة. السعر بدون نقل: يُضاف فوقه.
    const transportM = transportMode === 'separate' ? toMinor(data.transportAmount || 0) : 0;
    const subtotal = fromMinor(subtotalM);
    const transportAmount = fromMinor(transportM);
    const totalAmount = fromMinor(subtotalM + transportM);

    // فحص سقوف القيمة الآن بعد معرفتها (تحذير فقط: لا يوقف الموظف، فهو مخوَّل بالفعل)
    try {
      for (const [sourceId, amount] of Object.entries(bySourceAmount)) {
        const check = await ceilingsService.checkOrderCeilings(client, {
          customerId: order.customer_id, sourceId, categoryId: null,
          requestedBags: 0, requestedAmount: amount,
        });
        if (check.exceeded) {
          console.warn(`تنبيه: تسعير الطلب ${order.order_number} يتجاوز سقف القيمة المحدد لهذا العميل/المصنع.`);
        }
      }
    } catch (ceilErr) {
      console.error('تعذّر فحص سقوف القيمة عند التسعير (تم تجاوزه):', ceilErr.message);
    }

    const beneficiary = data.transportBeneficiary || order.transport_beneficiary || null;
    await client.query(
      `UPDATE orders SET
         subtotal = $1, shipping_amount = $2, total_amount = $3, remaining_amount = $3,
         status = 'PENDING_PAYMENT_METHOD', priced_by = $4, priced_at = NOW(),
         transport_beneficiary = $5::text,
         transport_beneficiary_trader_id =
           CASE WHEN $5::text = 'trader' THEN customer_id ELSE NULL END,
         currency = $7, transport_mode = $8,
         updated_at = NOW()
       WHERE id = $6`,
      [subtotal, transportAmount, totalAmount, staffUserId, beneficiary, orderId, currency, transportMode]
    );
    await logAudit(client, {
      userId: staffUserId, action: 'ORDER_PRICED', entityType: 'orders', entityId: orderId, entityRef: order.order_number,
      oldValues: { items: lines.map((l) => l.old), subtotal: order.subtotal, shipping_amount: order.shipping_amount },
      newValues: { items: lines.map((l) => ({ id: l.id, unit_price: fromMinor(l.unitM), discount: fromMinor(l.discM) })),
        subtotal, shipping_amount: transportAmount, total_amount: totalAmount, currency, transport_mode: transportMode, transport_beneficiary: beneficiary },
      reason: data.reason || 'تحديد سعر الطلب',
    });

    await client.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, reason)
       VALUES ($1, 'PENDING_PRICING', 'PENDING_PAYMENT_METHOD', $2, 'تم تحديد السعر')`,
      [orderId, staffUserId]
    );

    // إشعار العميل بقيمة الطلب (بند 23) — غير حرج: لا يوقف التسعير لو فشل
    try {
      await client.query('SAVEPOINT price_notify_sp');
      const cust = await client.query(
        `SELECT u.id AS user_id FROM customers c JOIN users u ON u.id = c.user_id WHERE c.id = $1`,
        [order.customer_id]
      );
      if (cust.rows[0]) {
        await client.query(
          `INSERT INTO notifications (user_id, title_ar, body_ar, type, reference_type, reference_id)
           VALUES ($1, 'تم تحديد قيمة طلبك', $2, 'ORDER_PRICED', 'orders', $3)`,
          [cust.rows[0].user_id, `إشعار قيمة الطلب رقم ${order.order_number}: ${Number(totalAmount).toLocaleString('en-US')} ${currency}. يرجى اختيار طريقة السداد.`, orderId]
        );
      }
    } catch (notifyErr) {
      await client.query('ROLLBACK TO SAVEPOINT price_notify_sp');
      console.error('تعذّر إرسال إشعار التسعير (تم تجاهله):', notifyErr.message);
    }

    await client.query('COMMIT');
    return { id: orderId, status: 'PENDING_PAYMENT_METHOD', subtotal: Number(subtotal), shipping_amount: Number(transportAmount), total_amount: Number(totalAmount), currency, transport_mode: transportMode };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * اختيار طريقة السداد بعد معرفة السعر (بند 24): فوري / آجل / جزئي.
 * هذه الخطوة تحل محل منطق الدفع الذي كان يحدث عند الإنشاء سابقًا، وتُبقي
 * على نفس تدفق العمل بعدها دون تغيير (اعتماد الائتمان / رفع إيصال الدفع).
 */
const choosePaymentMethod = async (orderId, userId, data) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cust = await client.query(`SELECT id FROM customers WHERE user_id = $1`, [userId]);
    if (cust.rows.length === 0) { const e = new Error('العميل غير موجود'); e.status = 404; throw e; }
    const customerId = cust.rows[0].id;
    const o = await client.query(
      `SELECT * FROM orders WHERE id = $1 AND customer_id = $2 FOR UPDATE`,
      [orderId, customerId]
    );
    if (!o.rows.length) { const e = new Error('الطلب غير موجود'); e.status = 404; throw e; }
    const order = o.rows[0];
    if (order.status !== 'PENDING_PAYMENT_METHOD') {
      const e = new Error('لا يمكن اختيار طريقة السداد في هذه الحالة'); e.status = 400; throw e;
    }

    let paymentTerms = data.paymentTerms;
    if (paymentTerms === 'cash') paymentTerms = 'network_transfer';
    if (paymentTerms === 'credit') paymentTerms = 'on_account';

    const totalAmount = parseFloat(order.total_amount || 0);
    let paidNow = 0;
    let creditAmount = 0;
    const cm = (v) => engine.toMinor(v);

    if (paymentTerms === 'on_account') {
      paidNow = parseFloat(data.paidAmountNow || 0);
      if (isNaN(paidNow) || paidNow < 0) {
        const e = new Error('المبلغ المدفوع الآن غير صالح');
        e.status = 400;
        throw e;
      }
      if (paidNow > totalAmount) {
        const e = new Error('المبلغ المدفوع الآن أكبر من إجمالي الطلب');
        e.status = 400;
        throw e;
      }
      creditAmount = parseFloat(engine.fromMinor(cm(totalAmount) - cm(paidNow)));
    } else if (paymentTerms === 'partial') {
      paidNow = parseFloat(data.paidAmountNow || 0);
      if (!(paidNow > 0 && paidNow < totalAmount)) {
        const e = new Error('الدفع الجزئي يجب أن يكون أكبر من صفر وأقل من الإجمالي'); e.status = 400; throw e;
      }
      creditAmount = parseFloat(engine.fromMinor(cm(totalAmount) - cm(paidNow)));
    } else if (['network_transfer', 'e_wallet'].includes(paymentTerms)) {
      paidNow = totalAmount;
      creditAmount = 0;
    } else {
      const e = new Error('طريقة السداد غير مدعومة'); e.status = 400; throw e;
    }

    let creditCheck = null;
    if (creditAmount > 0) {
      creditCheck = await checkCreditAvailability(client, customerId, creditAmount);
      if (!creditCheck.can_approve) {
        const e = new Error(`تجاوز الحد الائتماني. الرصيد: ${creditCheck.current_balance}، الحد: ${creditCheck.credit_limit}`);
        e.status = 400; e.code = 'CREDIT_LIMIT_EXCEEDED'; e.data = creditCheck; throw e;
      }
    }

    const nextStatus = creditAmount > 0 ? 'PENDING_ADMIN_APPROVAL' : 'PENDING_PAYMENT';
    await client.query(
      `UPDATE orders SET payment_terms = $1, paid_amount_now = $2, credit_amount = $3,
         status = $4, updated_at = NOW() WHERE id = $5`,
      [paymentTerms, paidNow, creditAmount, nextStatus, orderId]
    );

    await client.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, reason)
       VALUES ($1, 'PENDING_PAYMENT_METHOD', $2, $3, $4)`,
      [orderId, nextStatus, userId,
       paymentTerms === 'on_account' ? 'اختيار الدفع تحت الحساب' :
       paymentTerms === 'partial' ? 'اختيار دفع جزئي' : `اختيار ${paymentTerms === 'e_wallet' ? 'محفظة إلكترونية' : 'تحويل شبكة'}`]
    );

    await client.query('COMMIT');
    return { id: orderId, status: nextStatus, payment_terms: paymentTerms,
      paid_amount_now: paidNow, credit_amount: creditAmount, credit_check: creditCheck };
  } catch (err) {
    await client.query('ROLLBACK'); throw err;
  } finally { client.release(); }
};

/**
 * الطلب الجماعي للتاجر (بند 27): طلب واحد لمصنع/نوع أسمنت، بقاطرات متعددة —
 * كل قاطرة تصبح طلبًا مستقلاً كاملاً (يُسعَّر ويُسدَّد بشكل منفصل)، مرتبطة
 * جميعها برقم مجموعة واحد GR-YYYY-XXXXXX. لا يُنشئ نظام طلبات ثانٍ — يعيد
 * استخدام نفس جدول orders ونفس دورة العمل (PENDING_PRICING ثم...).
 */
const createGroupOrder = async (userId, data) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const cust = await client.query(
      `SELECT id, customer_type, governorate, area FROM customers WHERE user_id = $1`,
      [userId]
    );
    if (cust.rows.length === 0) { const e = new Error('العميل غير موجود'); e.status = 404; throw e; }
    const customer = cust.rows[0];
    const customerId = customer.id;
    if (!['trader', 'distributor'].includes(customer.customer_type)) {
      const e = new Error('الطلب الجماعي متاح للتجار والموزعين فقط'); e.status = 403; throw e;
    }
    if (!Array.isArray(data.trucks) || data.trucks.length < 2) {
      const e = new Error('الطلب الجماعي يحتاج قاطرتين على الأقل (لطلب قاطرة واحدة استخدم الطلب العادي)');
      e.status = 400; throw e;
    }

    const p = await client.query(
      `SELECT p.id, p.source_id, p.packaging_type, p.name_ar,
              COALESCE(i.unit, CASE WHEN p.packaging_type = 'bagged' THEN 'bag' ELSE 'ton' END) AS unit,
              COALESCE(i.available_qty, 0) AS available_qty
       FROM products p LEFT JOIN inventory i ON i.product_id = p.id
       WHERE p.id = $1`,
      [data.productId]
    );
    if (p.rows.length === 0) { const e = new Error('المنتج غير موجود'); e.status = 404; throw e; }
    const product = p.rows[0];

    const totalQuantity = data.trucks.reduce((s, t) => s + parseFloat(t.quantity || 0), 0);
    if (parseFloat(product.available_qty) < totalQuantity) {
      const e = new Error(`الكمية الإجمالية غير كافية من: ${product.name_ar}`);
      e.status = 400; e.code = 'INSUFFICIENT_STOCK'; throw e;
    }

    // فحص سقف الكمية على إجمالي المجموعة دفعة واحدة (بدل فحص كل طلب منفرد لاحقًا
    // بلا رؤية بعضها البعض ضمن نفس المعاملة)
    try {
      if (product.unit === 'bag') {
        const check = await ceilingsService.checkOrderCeilings(client, {
          customerId, sourceId: product.source_id, categoryId: null,
          requestedBags: totalQuantity, requestedAmount: 0,
        });
        if (check.exceeded) {
          const e = new Error('تجاوزت الكمية الإجمالية للمجموعة السقف المسموح به.');
          e.status = 400; e.code = 'CEILING_EXCEEDED'; e.data = check.results.filter((r) => r.exceeded);
          throw e;
        }
      }
    } catch (ceilErr) {
      if (ceilErr.code === 'CEILING_EXCEEDED') throw ceilErr;
      console.error('تحذير: تعذّر فحص سقوف الطلب الجماعي (تم تجاوز الفحص):', ceilErr.message);
    }

    let addressId = data.addressId || null;
    if (!addressId) {
      const ex = await client.query(
        `SELECT id FROM customer_addresses WHERE customer_id = $1 AND is_default = true LIMIT 1`,
        [customerId]
      );
      if (ex.rows.length > 0) {
        addressId = ex.rows[0].id;
      } else {
        const n = await client.query(
          `INSERT INTO customer_addresses (customer_id, label, governorate, area, address_text, is_default)
           VALUES ($1, 'افتراضي', $2, $3, 'يُحدد', true) RETURNING id`,
          [customerId, customer.governorate || 'صنعاء', customer.area || '']
        );
        addressId = n.rows[0].id;
      }
    }

    const year = new Date().getFullYear();
    const gCount = await client.query(`SELECT COUNT(*) FROM order_groups WHERE group_number LIKE $1`, [`GR-${year}-%`]);
    const groupNumber = `GR-${year}-${String(parseInt(gCount.rows[0].count, 10) + 1).padStart(6, '0')}`;
    const g = await client.query(
      `INSERT INTO order_groups (group_number, customer_id) VALUES ($1, $2) RETURNING id`,
      [groupNumber, customerId]
    );
    const groupId = g.rows[0].id;

    const createdOrders = [];
    for (const truck of data.trucks) {
      const qty = parseFloat(truck.quantity);
      if (!(qty > 0)) { const e = new Error('كمية غير صحيحة لإحدى القاطرات'); e.status = 400; throw e; }
      if (!truck.truckPlate || !truck.driverName) {
        const e = new Error('رقم القاطرة واسم السائق مطلوبان لكل قاطرة في المجموعة'); e.status = 400; throw e;
      }

      const orderNumber = await generateOrderNumber();
      const o = await client.query(
        `INSERT INTO orders
         (order_number, customer_id, address_id, status, source,
          subtotal, discount_amount, shipping_amount, total_amount,
          paid_amount, remaining_amount, notes, created_by,
          delivery_type, trader_truck_plate, trader_driver_name, trader_driver_phone,
          transport_unit, group_id)
         VALUES ($1, $2, $3, 'PENDING_PRICING', 'ONLINE',
                 NULL, 0, NULL, NULL, 0, NULL, $4, $5,
                 'trader_pickup', $6, $7, $8, $9, $10)
         RETURNING id, order_number, status, created_at`,
        [
          orderNumber, customerId, addressId, data.notes || null, userId,
          truck.truckPlate, truck.driverName, truck.driverPhone || null,
          product.unit, groupId,
        ]
      );
      const order = o.rows[0];

      await client.query(
        `INSERT INTO order_items (order_id, product_id, source_id, packaging_type, quantity, unit, unit_price, discount, line_total)
         VALUES ($1, $2, $3, $4, $5, $6, NULL, 0, NULL)`,
        [order.id, product.id, product.source_id, product.packaging_type, qty, product.unit]
      );
      await client.query(
        `UPDATE inventory SET reserved_qty = reserved_qty + $1, updated_at = NOW() WHERE product_id = $2`,
        [qty, product.id]
      );
      await client.query(
        `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, reason)
         VALUES ($1, NULL, 'PENDING_PRICING', $2, $3)`,
        [order.id, userId, `جزء من الطلب الجماعي ${groupNumber}`]
      );

      createdOrders.push({ ...order, truck_plate: truck.truckPlate, quantity: qty });
    }

    await client.query('COMMIT');
    return { groupId, groupNumber, orders: createdOrders };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const getGroupOrder = async (groupId, customerId) => {
  const g = await query(
    `SELECT * FROM order_groups WHERE id = $1 AND customer_id = $2`,
    [groupId, customerId]
  );
  if (g.rows.length === 0) { const e = new Error('المجموعة غير موجودة'); e.status = 404; throw e; }
  const orders = await query(
    `SELECT o.id, o.order_number, o.status, o.total_amount, o.trader_truck_plate, o.trader_driver_name,
            oi.quantity, oi.unit
     FROM orders o JOIN order_items oi ON oi.order_id = o.id
     WHERE o.group_id = $1 ORDER BY o.created_at ASC`,
    [groupId]
  );
  return { ...g.rows[0], orders: orders.rows };
};

const listPendingPricing = async () => {
  const r = await query(
    `SELECT o.id, o.order_number, o.delivery_type, o.created_at,
            u.full_name AS customer_name, u.phone AS customer_phone
     FROM orders o
     JOIN customers c ON c.id = o.customer_id
     JOIN users u ON u.id = c.user_id
     WHERE o.status = 'PENDING_PRICING'
     ORDER BY o.created_at ASC`
  );
  return r.rows;
};

const approveCreditOrder = async (orderId, adminId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const o = await client.query(
      `SELECT id, status FROM orders WHERE id = $1 FOR UPDATE`,
      [orderId]
    );
    if (o.rows.length === 0) {
      const err = new Error('الطلب غير موجود');
      err.status = 404;
      throw err;
    }
    if (o.rows[0].status !== 'PENDING_ADMIN_APPROVAL') {
      const err = new Error('الطلب ليس بانتظار الموافقة');
      err.status = 400;
      throw err;
    }
    const full = await client.query(`SELECT customer_id, credit_amount, order_number FROM orders WHERE id = $1`, [orderId]);
    const order = full.rows[0];
    await client.query(
      `UPDATE orders SET status = 'PAYMENT_APPROVED', credit_approved_by = $1,
       credit_approved_at = NOW(), paid_amount = 0, remaining_amount = total_amount, updated_at = NOW() WHERE id = $2`,
      [adminId, orderId]
    );
    // لا قيد مالي هنا: القيد يُنشأ عند التحميل الفعلي فقط (كان يُقيَّد هنا مدين ثم يُقيَّد البيع كاملًا عند التحميل = ازدواج).
    await logAudit(client, {
      userId: adminId, action: 'CREDIT_ORDER_APPROVED', entityType: 'orders', entityId: orderId, entityRef: order.order_number,
      oldValues: { status: 'PENDING_ADMIN_APPROVAL' }, newValues: { status: 'PAYMENT_APPROVED', credit_amount: order.credit_amount },
    });
    await client.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, reason)
       VALUES ($1, 'PENDING_ADMIN_APPROVAL', 'PAYMENT_APPROVED', $2, 'اعتماد الدفع تحت الحساب')`,
      [orderId, adminId]
    );
    // للطلب الذي اختار فاكسًا وسائقًا تابعًا للتاجر: أنشئ طلب الفاكس تلقائيًا بعد الاعتماد.
    try {
      const faxService = require('../faxes/fax.service');
      await faxService.createFaxFromOrder(client, orderId, adminId);
    } catch (faxErr) {
      if (faxErr.code !== 'FAX_NOT_READY') throw faxErr;
    }
    await client.query('COMMIT');
    return { id: orderId, status: 'PREPARING' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const rejectCreditOrder = async (orderId, adminId, reason) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const o = await client.query(
      `SELECT id, status, customer_id, credit_amount FROM orders WHERE id = $1 FOR UPDATE`,
      [orderId]
    );
    if (o.rows.length === 0) {
      const err = new Error('الطلب غير موجود');
      err.status = 404;
      throw err;
    }
    const order = o.rows[0];
    if (order.status !== 'PENDING_ADMIN_APPROVAL') {
      const err = new Error('الطلب ليس بانتظار الموافقة');
      err.status = 400;
      throw err;
    }
    await client.query(
      `UPDATE orders SET status = 'CREDIT_REJECTED',
       credit_rejection_reason = $1, updated_at = NOW() WHERE id = $2`,
      [reason, orderId]
    );

    // أعد الكميات
    const its = await client.query(
      `SELECT product_id, quantity FROM order_items WHERE order_id = $1`,
      [orderId]
    );
    for (const it of its.rows) {
      await client.query(
        `UPDATE inventory SET reserved_qty = GREATEST(0, reserved_qty - $1),
         updated_at = NOW() WHERE product_id = $2`,
        [it.quantity, it.product_id]
      );
    }

    // لا يوجد قيد مالي قبل التحميل، فلا شيء يُعكس في الدفتر.
    await logAudit(client, {
      userId: adminId, action: 'CREDIT_ORDER_REJECTED', entityType: 'orders', entityId: orderId,
      oldValues: { status: order.status }, newValues: { status: 'CREDIT_REJECTED' }, reason,
    });

    await client.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, reason)
       VALUES ($1, 'PENDING_ADMIN_APPROVAL', 'CREDIT_REJECTED', $2, $3)`,
      [orderId, adminId, `رفض: ${reason}`]
    );

    await client.query('COMMIT');
    return { id: orderId, status: 'CREDIT_REJECTED' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const listPendingCreditOrders = async () => {
  const r = await query(
    `SELECT o.id, o.order_number, o.status, o.total_amount, o.created_at,
            o.delivery_type, o.payment_terms,
            o.credit_amount, o.paid_amount_now,
            c.id AS customer_id, c.customer_type, c.current_balance, c.credit_limit,
            u.full_name AS customer_name, u.phone AS customer_phone
     FROM orders o
     JOIN customers c ON c.id = o.customer_id
     JOIN users u ON u.id = c.user_id
     WHERE o.status = 'PENDING_ADMIN_APPROVAL'
     ORDER BY o.created_at ASC`
  );
  return r.rows;
};

const getMyOrders = async (userId) => {
  const r = await query(
    `SELECT o.id, o.order_number, o.status, o.source,
            o.subtotal, o.shipping_amount, o.total_amount,
            o.paid_amount, o.remaining_amount,
            o.delivery_type, o.payment_terms, o.credit_rejection_reason,
            o.paid_amount_now, o.credit_amount, o.created_at,
            (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) AS items_count
     FROM orders o
     JOIN customers c ON c.id = o.customer_id
     WHERE c.user_id = $1
     ORDER BY o.created_at DESC`,
    [userId]
  );
  return r.rows;
};

const getOrderById = async (orderId, userId = null, isAdmin = false) => {
  let sql = `
    SELECT o.*, c.current_balance, c.credit_limit, c.customer_type,
           u.full_name AS customer_name, u.phone AS customer_phone,
           a.label AS address_label, a.governorate, a.area,
           a.address_text, a.alt_phone
    FROM orders o
    JOIN customers c ON c.id = o.customer_id
    JOIN users u ON u.id = c.user_id
    JOIN customer_addresses a ON a.id = o.address_id
    WHERE o.id = $1`;
  const params = [orderId];
  if (!isAdmin && userId) {
    sql += ` AND c.user_id = $2`;
    params.push(userId);
  }
  const r = await query(sql, params);
  if (r.rows.length === 0) return null;
  const order = r.rows[0];
  const its = await query(
    `SELECT oi.*, p.name_ar AS product_name, p.grade,
            s.name_ar AS source_name, s.code AS source_code,
            cat.name_ar AS category_name, cat.color_code, cat.color_name_ar
     FROM order_items oi
     JOIN products p ON p.id = oi.product_id
     JOIN product_sources s ON s.id = oi.source_id
     JOIN product_categories cat ON cat.id = p.category_id
     WHERE oi.order_id = $1`,
    [orderId]
  );
  order.items = its.rows;
  const [fax, posting, deliveries] = await Promise.all([
    query(`SELECT f.id,f.fax_number,f.status,f.requested_quantity,f.approved_quantity,f.loaded_quantity,
                  f.quantity_discrepancy,f.factory_entered_at,f.issued_at,f.used_at,
                  s.name_ar AS factory_name,d.full_name AS driver_name,v.plate_number
           FROM loading_faxes f
           LEFT JOIN product_sources s ON s.id=f.factory_id
           LEFT JOIN drivers d ON d.id=f.driver_id
           LEFT JOIN vehicles v ON v.id=f.vehicle_id
           WHERE f.order_id=$1 ORDER BY f.requested_at DESC LIMIT 1`, [orderId]),
    query(`SELECT id,loaded_quantity,customer_debit,customer_payment_credit,driver_transport_debit,
                  trader_transport_amount,posted_at,notes FROM order_accounting_postings WHERE order_id=$1`, [orderId]),
    query(`SELECT d.id,d.trip_number,d.status,d.driver_id,d.vehicle_id,d.started_at,d.delivered_at,
                  dr.full_name AS driver_name,v.plate_number FROM deliveries d
           LEFT JOIN drivers dr ON dr.id=d.driver_id LEFT JOIN vehicles v ON v.id=d.vehicle_id
           WHERE d.order_id=$1 ORDER BY d.created_at ASC`, [orderId]),
  ]);
  order.fax = fax.rows[0] || null;
  order.accounting_posting = posting.rows[0] || null;
  order.deliveries = deliveries.rows;
  return order;
};

const cancelOrder = async (orderId, userId, reason) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `SELECT o.id, o.status, o.customer_id, o.credit_amount
       FROM orders o JOIN customers c ON c.id = o.customer_id
       WHERE o.id = $1 AND c.user_id = $2
       FOR UPDATE OF o`,
      [orderId, userId]
    );
    if (r.rows.length === 0) {
      const err = new Error('الطلب غير موجود');
      err.status = 404;
      throw err;
    }
    const order = r.rows[0];
    if (!['PENDING_PRICING', 'PENDING_PAYMENT_METHOD', 'PENDING_PAYMENT', 'RECEIPT_UPLOADED', 'CREATED', 'PENDING_ADMIN_APPROVAL'].includes(order.status)) {
      const err = new Error('لا يمكن الإلغاء في هذه الحالة');
      err.status = 400;
      throw err;
    }
    const its = await client.query(
      `SELECT product_id, quantity FROM order_items WHERE order_id = $1`,
      [orderId]
    );
    for (const it of its.rows) {
      await client.query(
        `UPDATE inventory SET reserved_qty = GREATEST(0, reserved_qty - $1),
         updated_at = NOW() WHERE product_id = $2`,
        [it.quantity, it.product_id]
      );
    }
    await client.query(
      `UPDATE orders SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1`,
      [orderId]
    );
    // قبل التحميل لا يوجد قيد مالي. الدفعات المعتمدة (إن وُجدت) تبقى رصيدًا دائنًا للعميل ولا تُحذف.
    await logAudit(client, {
      userId, action: 'ORDER_CANCELLED', entityType: 'orders', entityId: orderId,
      oldValues: { status: order.status }, newValues: { status: 'CANCELLED' }, reason: reason || 'إلغاء',
    });
    await client.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, reason)
       VALUES ($1, $2, 'CANCELLED', $3, $4)`,
      [orderId, order.status, userId, reason || 'إلغاء']
    );
    await client.query('COMMIT');
    return { id: orderId, status: 'CANCELLED' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

module.exports = {
  createOrder, createGroupOrder, getGroupOrder,
  setOrderPricing, choosePaymentMethod, listPendingPricing,
  approveCreditOrder, rejectCreditOrder,
  listPendingCreditOrders, checkCreditAvailability,
  getMyOrders, getOrderById, cancelOrder,
};
