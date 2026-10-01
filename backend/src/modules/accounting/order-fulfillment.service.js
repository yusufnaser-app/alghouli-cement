const { pool, query } = require('../../config/db');
const money = (v) => Math.round((Number(v) || 0) * 100) / 100;

// Must be called inside an open transaction using the same pg client.
const postActualLoading = async (client, faxId, loadedQuantity, postedBy, notes = null) => {
  const loaded = Number(loadedQuantity);
  if (!Number.isFinite(loaded) || loaded <= 0) {
    const e = new Error('الكمية المحملة غير صحيحة'); e.status = 400; throw e;
  }
  const fRes = await client.query(`
    SELECT f.*, o.order_number, o.customer_id, o.status AS order_status,
           o.delivery_type, o.payment_terms, o.paid_amount, o.total_amount,
           o.shipping_amount, o.transport_beneficiary
    FROM loading_faxes f
    JOIN orders o ON o.id = f.order_id
    WHERE f.id = $1 FOR UPDATE OF f, o`, [faxId]);
  if (!fRes.rows.length) { const e = new Error('الفاكس أو الطلب غير موجود'); e.status = 404; throw e; }
  const fax = fRes.rows[0];

  const existing = await client.query(`SELECT * FROM order_accounting_postings WHERE order_id = $1 FOR UPDATE`, [fax.order_id]);
  if (existing.rows.length) return { already_posted: true, posting: existing.rows[0] };

  const items = await client.query(`
    SELECT oi.id, oi.product_id, oi.source_id, oi.quantity, oi.unit,
           COALESCE(oi.unit_price,0) AS unit_price, COALESCE(oi.discount,0) AS discount
    FROM order_items oi WHERE oi.order_id = $1 ORDER BY oi.id`, [fax.order_id]);
  if (!items.rows.length) { const e = new Error('لا توجد أصناف في الطلب'); e.status = 400; throw e; }
  const requestedTotal = items.rows.reduce((s, x) => s + Number(x.quantity || 0), 0);
  const requestedQty = Number(fax.requested_quantity || requestedTotal);
  if (requestedTotal <= 0) { const e = new Error('كمية الطلب غير صحيحة'); e.status = 400; throw e; }
  if (loaded > requestedTotal) { const e = new Error(`الكمية المحملة ${loaded} أكبر من كمية الطلب ${requestedTotal}`); e.status = 400; throw e; }

  let finalSubtotal = 0;
  for (const item of items.rows) {
    const share = loaded * Number(item.quantity) / requestedTotal;
    const ratio = Number(item.quantity) ? share / Number(item.quantity) : 0;
    finalSubtotal += Number(item.unit_price) * share - Number(item.discount || 0) * ratio;
  }
  finalSubtotal = money(finalSubtotal);
  const originalShipping = Number(fax.transport_total ?? fax.shipping_amount ?? 0);
  const finalShipping = requestedQty > 0 ? money(originalShipping * loaded / requestedQty) : money(originalShipping);
  const finalTotal = money(finalSubtotal + finalShipping);
  const paidAmount = money(fax.paid_amount || 0);
  const remaining = money(Math.max(0, finalTotal - paidAmount));
  const discrepancy = money(loaded - requestedQty);

  const cust = await client.query(`SELECT current_balance FROM customers WHERE id = $1 FOR UPDATE`, [fax.customer_id]);
  if (!cust.rows.length) { const e = new Error('العميل غير موجود'); e.status = 404; throw e; }

  const refCode = fax.fax_number || fax.order_number;
  let running = money(Number(cust.rows[0].current_balance || 0));

  // قيد 1: قيمة الأسمنت (debit على التاجر)
  running = money(running + finalSubtotal);
  await client.query(`
    INSERT INTO customer_ledger
      (customer_id, order_id, transaction_type, debit, credit, balance_after, description,
       reference_code, created_by, source_type, source_id)
    VALUES ($1,$2,'sale',$3,0,$4,$5,$6,$7,'order_fulfillment',$2)`, [
      fax.customer_id, fax.order_id, finalSubtotal, running,
      `قيمة الأسمنت — طلب ${fax.order_number} — كمية ${loaded}`,
      refCode, postedBy]);

  // قيد 2: أجور النقل للتاجر (credit — فقط إن كان سائق تاجر)
  if (fax.transport_beneficiary === 'trader' && finalShipping > 0) {
    running = money(running - finalShipping);
    await client.query(`
      INSERT INTO customer_ledger
        (customer_id, order_id, transaction_type, debit, credit, balance_after, description,
         reference_code, created_by, source_type, source_id)
      VALUES ($1,$2,'transport_credit',0,$3,$4,$5,$6,$7,'order_fulfillment',$2)`, [
        fax.customer_id, fax.order_id, finalShipping, running,
        `أجور النقل المستحقة للتاجر — طلب ${fax.order_number}`,
        refCode, postedBy]);
  }

  // قيد 3: الدفعة (credit — فقط إن دفع)
  if (paidAmount > 0) {
    running = money(running - paidAmount);
    await client.query(`
      INSERT INTO customer_ledger
        (customer_id, order_id, transaction_type, debit, credit, balance_after, description,
         reference_code, created_by, source_type, source_id)
      VALUES ($1,$2,'payment',0,$3,$4,$5,$6,$7,'order_fulfillment',$2)`, [
        fax.customer_id, fax.order_id, paidAmount, running,
        `دفعة عند تحميل الطلب ${fax.order_number}`,
        refCode, postedBy]);
  }

  await client.query(`UPDATE customers SET current_balance = $1 WHERE id = $2`, [running, fax.customer_id]);

  let driverTransport = 0;
  if (fax.transport_beneficiary === 'driver' && fax.driver_id && finalShipping > 0) {
    const d = await client.query(`SELECT current_balance FROM drivers WHERE id = $1 FOR UPDATE`, [fax.driver_id]);
    if (d.rows.length) {
      const driverAfter = money(Number(d.rows[0].current_balance || 0) + finalShipping);
      await client.query(`
        INSERT INTO driver_ledger
          (driver_id, order_id, transaction_type, description, debit, credit, balance_after,
           reference_code, created_by, source_type, source_id)
        VALUES ($1,$2,'transport_due',$3,$4,0,$5,$6,$7,'order_fulfillment',$2)`, [
          fax.driver_id, fax.order_id, `أجور نقل فعلية للطلب ${fax.order_number}`,
          finalShipping, driverAfter, fax.fax_number || fax.order_number, postedBy]);
      await client.query(`UPDATE drivers SET current_balance = $1 WHERE id = $2`, [driverAfter, fax.driver_id]);
      driverTransport = finalShipping;
    }
  }

  await client.query(`
    INSERT INTO factory_ledger
      (factory_id, order_id, fax_id, transaction_type, quantity, unit, description, reference_code, created_by)
    VALUES ($1,$2,$3,'actual_loading',$4,$5,$6,$7,$8)`, [
      fax.factory_id, fax.order_id, fax.id, loaded, items.rows[0].unit || 'bag',
      `تحميل فعلي للطلب ${fax.order_number}`, fax.fax_number || fax.order_number, postedBy]);

  for (const item of items.rows) {
    const requested = Number(item.quantity);
    const itemLoaded = loaded * requested / requestedTotal;
    await client.query(`
      UPDATE inventory
      SET available_qty = GREATEST(0, available_qty - $1),
          reserved_qty = GREATEST(0, reserved_qty - $2), updated_at = NOW()
      WHERE product_id = $3`, [itemLoaded, requested, item.product_id]);
  }

  await client.query(`
    UPDATE orders SET quantity_loaded=$1, quantity_discrepancy=$2,
      final_loaded_quantity=$1, loaded_at=NOW(), final_subtotal=$3,
      final_shipping_amount=$4, final_total_amount=$5, final_remaining_amount=$6,
      accounting_status='POSTED', accounting_posted_at=NOW(),
      accounting_note=$7, status='LOADED', loading_completed_at=NOW(), updated_at=NOW()
    WHERE id=$8`, [loaded, discrepancy, finalSubtotal, finalShipping, finalTotal, remaining,
      notes || 'تم الترحيل عند التحميل الفعلي', fax.order_id]);

  const posting = await client.query(`
    INSERT INTO order_accounting_postings
      (order_id,fax_id,loaded_quantity,customer_debit,customer_payment_credit,
       driver_transport_debit,trader_transport_amount,posted_by,notes)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [
      fax.order_id, fax.id, loaded, finalTotal, paidAmount, driverTransport,
      fax.transport_beneficiary === 'trader' ? finalShipping : 0, postedBy, notes || null]);

  await client.query(`
    INSERT INTO order_status_history (order_id,from_status,to_status,changed_by,reason)
    VALUES ($1,$2,'LOADED',$3,$4)`, [fax.order_id, fax.order_status, postedBy, `تم التحميل الفعلي ${loaded} وترحيل الحسابات`]);
  await client.query(`
    INSERT INTO automation_events (event_type,entity_type,entity_id,payload)
    VALUES ('order.accounting_posted','orders',$1,$2)`, [
      fax.order_id, JSON.stringify({fax_id:fax.id,loaded_quantity:loaded,final_total:finalTotal})]);

  return { already_posted:false, posting:posting.rows[0], order_id:fax.order_id,
    order_number:fax.order_number, loaded_quantity:loaded, discrepancy,
    final_subtotal:finalSubtotal, final_shipping_amount:finalShipping,
    final_total_amount:finalTotal, paid_amount:paidAmount,
    final_remaining_amount:remaining, driver_transport:driverTransport };
};

const listAwaitingPosting = async () => {
  const r = await query(`
    SELECT o.id,o.order_number,o.status,o.accounting_status,o.total_amount,o.final_total_amount,
      o.quantity_loaded,f.id AS fax_id,f.fax_number,f.loaded_quantity,f.requested_quantity,
      s.name_ar AS factory_name,d.full_name AS driver_name,v.plate_number,u.full_name AS customer_name
    FROM orders o
    JOIN loading_faxes f ON f.order_id=o.id
    LEFT JOIN product_sources s ON s.id=f.factory_id
    LEFT JOIN drivers d ON d.id=f.driver_id
    LEFT JOIN vehicles v ON v.id=f.vehicle_id
    JOIN customers c ON c.id=o.customer_id JOIN users u ON u.id=c.user_id
    WHERE f.status='USED' AND COALESCE(o.accounting_status,'PENDING')<>'POSTED'
    ORDER BY f.used_at ASC NULLS LAST`);
  return r.rows;
};

const getOrderAccounting = async (orderId) => {
  const order = await query(`SELECT id,order_number,status,accounting_status,final_loaded_quantity,
    final_subtotal,final_shipping_amount,final_total_amount,final_remaining_amount,
    accounting_posted_at,customer_id,fax_id FROM orders WHERE id=$1`, [orderId]);
  if (!order.rows.length) return null;
  const [posting, customer, driver, factory] = await Promise.all([
    query(`SELECT * FROM order_accounting_postings WHERE order_id=$1`, [orderId]),
    query(`SELECT * FROM customer_ledger WHERE order_id=$1 ORDER BY created_at DESC`, [orderId]),
    query(`SELECT dl.*,d.full_name AS driver_name FROM driver_ledger dl JOIN drivers d ON d.id=dl.driver_id WHERE dl.order_id=$1 ORDER BY dl.created_at DESC`, [orderId]),
    query(`SELECT fl.*,s.name_ar AS factory_name FROM factory_ledger fl JOIN product_sources s ON s.id=fl.factory_id WHERE fl.order_id=$1 ORDER BY fl.created_at DESC`, [orderId]),
  ]);
  return {order:order.rows[0],posting:posting.rows[0]||null,customer_ledger:customer.rows,driver_ledger:driver.rows,factory_ledger:factory.rows};
};

const postExistingLoadedOrder = async (orderId,userId,notes) => {
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const f=await client.query(`SELECT id,loaded_quantity FROM loading_faxes WHERE order_id=$1 AND status='USED' ORDER BY used_at DESC LIMIT 1`,[orderId]);
    if(!f.rows.length){const e=new Error('لا يوجد فاكس محمّل يمكن ترحيله');e.status=400;throw e;}
    const result=await postActualLoading(client,f.rows[0].id,f.rows[0].loaded_quantity,userId,notes);
    await client.query('COMMIT'); return result;
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
};

module.exports={postActualLoading,listAwaitingPosting,getOrderAccounting,postExistingLoadedOrder};
