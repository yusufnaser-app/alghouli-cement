'use strict';
const { pool, query } = require('../../config/db');

const listDestinations = async (faxId) => {
  const r = await query(`
    SELECT d.*,
           c.id AS trader_id,
           u.full_name AS trader_name,
           u.phone AS trader_phone,
           w.name_ar AS warehouse_name,
           w.code AS warehouse_code
    FROM delivery_destinations d
    LEFT JOIN customers c ON c.id = d.trader_id
    LEFT JOIN users u ON u.id = c.user_id
    LEFT JOIN institution_warehouses w ON w.id = d.warehouse_id
    WHERE d.fax_id = $1
    ORDER BY d.sort_order, d.created_at
  `, [faxId]);
  return r.rows;
};

const replaceDestinations = async (client, faxId, destinations, userId) => {
  await client.query(
    `DELETE FROM delivery_destinations WHERE fax_id = $1 AND status = 'PENDING'`,
    [faxId]
  );

  const inserted = [];
  for (let i = 0; i < destinations.length; i++) {
    const d = destinations[i];

    let traderInfo = null;
    if (d.destinationType === 'trader' && d.traderId) {
      const t = await client.query(`
        SELECT c.id, c.governorate, c.area, c.default_address, u.full_name, u.phone
        FROM customers c JOIN users u ON u.id = c.user_id WHERE c.id = $1
      `, [d.traderId]);
      if (!t.rows.length) { const e = new Error('التاجر غير موجود'); e.status = 404; throw e; }
      traderInfo = t.rows[0];
    }

    let warehouseInfo = null;
    if (d.destinationType === 'warehouse' && d.warehouseId) {
      const w = await client.query(`
        SELECT id, name_ar, governorate, area, address_text, contact_phone, manager_name
        FROM institution_warehouses WHERE id = $1
      `, [d.warehouseId]);
      if (!w.rows.length) { const e = new Error('المستودع غير موجود'); e.status = 404; throw e; }
      warehouseInfo = w.rows[0];
    }

    const res = await client.query(`
      INSERT INTO delivery_destinations
        (fax_id, destination_type, trader_id, warehouse_id,
         quantity, unit, label, governorate, area, address_text,
         contact_phone, contact_name, sort_order, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *
    `, [
      faxId, d.destinationType,
      traderInfo?.id || null,
      warehouseInfo?.id || null,
      d.quantity, d.unit || 'bag',
      d.label || traderInfo?.full_name || warehouseInfo?.name_ar || null,
      d.governorate || traderInfo?.governorate || warehouseInfo?.governorate || null,
      d.area || traderInfo?.area || warehouseInfo?.area || null,
      d.addressText || traderInfo?.default_address || warehouseInfo?.address_text || null,
      d.contactPhone || traderInfo?.phone || warehouseInfo?.contact_phone || null,
      d.contactName || traderInfo?.full_name || warehouseInfo?.manager_name || null,
      i, userId,
    ]);
    inserted.push(res.rows[0]);
  }
  return inserted;
};

const deliverDestination = async (destinationId, userId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const d = await client.query(`
      SELECT d.*, f.fax_number, f.driver_id, f.order_id AS fax_order_id, f.factory_id
      FROM delivery_destinations d
      JOIN loading_faxes f ON f.id = d.fax_id
      WHERE d.id = $1
    `, [destinationId]);

    if (!d.rows.length) { const e = new Error('الوجهة غير موجودة'); e.status = 404; throw e; }
    const dest = d.rows[0];

    if (dest.status === 'DELIVERED') { const e = new Error('تم التسليم مسبقًا'); e.status = 400; throw e; }

    const drv = await client.query(`SELECT id FROM drivers WHERE user_id = $1`, [userId]);
    if (!drv.rows.length || drv.rows[0].id !== dest.driver_id) {
      const e = new Error('غير مصرح'); e.status = 403; throw e;
    }

    let createdOrder = null;

    if (dest.destination_type === 'trader' && dest.trader_id) {
      const year = new Date().getFullYear();
      const cnt = await client.query(
        `SELECT COUNT(*) FROM orders WHERE order_number LIKE $1`, [`GHO-${year}-%`]
      );
      const seq = (parseInt(cnt.rows[0].count, 10) + 1).toString().padStart(6, '0');
      const orderNumber = `GHO-${year}-${seq}`;

      const orderRes = await client.query(`
        INSERT INTO orders
          (order_number, customer_id, status, source, delivery_type,
           factory_id, created_by, notes, payment_terms,
           source_fax_id, source_destination_id)
        VALUES ($1,$2,'PENDING_PRICING','ONLINE','alghouli_delivery',
                $3,$4,$5,'on_account',$6,$7)
        RETURNING id, order_number
      `, [orderNumber, dest.trader_id, dest.factory_id, userId,
          `تسليم فاكس ${dest.fax_number || ''} — ${dest.quantity} كيس`,
          dest.fax_id, dest.id]);
      createdOrder = orderRes.rows[0];

      // ✅ احصل على المنتج الافتراضي للمصنع
      const srcRes = await client.query(`
        SELECT default_product_id FROM product_sources WHERE id = $1
      `, [dest.factory_id]);
      const productId = srcRes.rows[0]?.default_product_id || null;

      await client.query(`
        INSERT INTO order_items
          (order_id, product_id, source_id, packaging_type, quantity, unit, unit_price, discount, line_total)
        VALUES ($1, $2, $3, 'bagged', $4, $5, NULL, 0, NULL)
      `, [createdOrder.id, productId, dest.factory_id, dest.quantity, dest.unit || 'bag']);

      await client.query(`
        INSERT INTO order_status_history
          (order_id, from_status, to_status, changed_by, reason)
        VALUES ($1, NULL, 'PENDING_PRICING', $2, $3)
      `, [createdOrder.id, userId,
          `تسليم من فاكس ${dest.fax_number || ''} — ${dest.quantity}`]);

      const traderUser = await client.query(`SELECT user_id FROM customers WHERE id = $1`, [dest.trader_id]);
      if (traderUser.rows.length) {
        await client.query(`
          INSERT INTO notifications
            (user_id, title_ar, body_ar, type, reference_type, reference_id)
          VALUES ($1, $2, $3, 'ORDER_CREATED', 'orders', $4)
        `, [traderUser.rows[0].user_id,
            'شحنة جديدة بانتظار التسعير',
            `تم تسليم ${dest.quantity} ${dest.unit === 'ton' ? 'طن' : 'كيس'} أسمنت لحسابك — طلب رقم ${createdOrder.order_number}`,
            createdOrder.id]);
      }
    }

    if (dest.destination_type === 'warehouse' && dest.warehouse_id) {
      await client.query(`
        INSERT INTO institution_warehouse_ledger
          (warehouse_id, source_id, quantity, unit, direction,
           reference_type, reference_id, description, created_by)
        VALUES ($1, $2, $3, $4, 'in', 'delivery_destination', $5, $6, $7)
      `, [dest.warehouse_id, dest.factory_id, dest.quantity, dest.unit || 'bag',
          dest.id, `استلام من فاكس ${dest.fax_number || ''}`, userId]);
    }

    await client.query(`
      UPDATE delivery_destinations
      SET status = 'DELIVERED', delivered_at = NOW(), delivered_by = $1,
          order_id = $2, updated_at = NOW()
      WHERE id = $3
    `, [userId, createdOrder?.id || null, destinationId]);

    const remaining = await client.query(`
      SELECT COUNT(*)::int AS count FROM delivery_destinations
      WHERE fax_id = $1 AND status = 'PENDING'
    `, [dest.fax_id]);

    if (remaining.rows[0].count === 0) {
      await client.query(`
        UPDATE loading_faxes SET status = 'DELIVERED', updated_at = NOW()
        WHERE id = $1
      `, [dest.fax_id]);
    }

    await client.query('COMMIT');
    return {
      ok: true,
      destination_id: destinationId,
      order_created: !!createdOrder,
      order_number: createdOrder?.order_number || null,
      all_delivered: remaining.rows[0].count === 0,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const listWarehouses = async () => {
  const r = await query(`
    SELECT id, code, name_ar, governorate, area, address_text,
           contact_phone, manager_name, status
    FROM institution_warehouses WHERE status = 'active' ORDER BY name_ar
  `);
  return r.rows;
};

const listTraders = async () => {
  const r = await query(`
    SELECT c.id, u.full_name, u.phone, c.governorate, c.area, c.default_address
    FROM customers c
    JOIN users u ON u.id = c.user_id
    WHERE u.status = 'active' AND c.customer_type IN ('trader', 'contractor')
    ORDER BY u.full_name
  `);
  return r.rows;
};

module.exports = { listDestinations, replaceDestinations, deliverDestination, listWarehouses, listTraders };
