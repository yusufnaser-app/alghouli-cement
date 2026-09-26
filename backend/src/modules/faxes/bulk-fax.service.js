const { pool, query } = require('../../config/db');

const generateFaxNumber = async (client) => {
  const year = new Date().getFullYear();
  const r = await client.query(
    `SELECT COUNT(*) FROM loading_faxes 
     WHERE fax_number IS NOT NULL 
       AND fax_number LIKE $1`,
    [`FX-${year}-%`]
  );
  const count = parseInt(r.rows[0].count, 10) + 1;
  return `FX-${year}-${String(count).padStart(5, '0')}`;
};



const getSuggestions = async (filters = {}) => {
  let sql = `
    SELECT d.id AS driver_id, d.full_name, d.phone, d.driver_type,
           d.status AS driver_status, d.approval_status,
           (SELECT v.plate_number FROM vehicles v
            WHERE v.current_driver_id = d.id
            ORDER BY v.created_at DESC LIMIT 1) AS plate_number,
           (SELECT v.id FROM vehicles v
            WHERE v.current_driver_id = d.id
            ORDER BY v.created_at DESC LIMIT 1) AS vehicle_id,
           (SELECT lf.factory_id FROM loading_faxes lf
            WHERE lf.driver_id = d.id
            ORDER BY lf.requested_at DESC LIMIT 1) AS last_factory_id,
           (SELECT ps.name_ar FROM loading_faxes lf
            JOIN product_sources ps ON ps.id = lf.factory_id
            WHERE lf.driver_id = d.id
            ORDER BY lf.requested_at DESC LIMIT 1) AS last_factory_name,
           (SELECT lf.requested_quantity FROM loading_faxes lf
            WHERE lf.driver_id = d.id
            ORDER BY lf.requested_at DESC LIMIT 1) AS last_quantity,
           (SELECT COUNT(*) FROM loading_faxes lf
            WHERE lf.driver_id = d.id) AS trips_count,
           (SELECT MAX(lf.requested_at) FROM loading_faxes lf
            WHERE lf.driver_id = d.id) AS last_trip_at
    FROM drivers d
    WHERE d.approval_status = 'active'
      AND d.status = 'available'
  `;
  const params = [];
  if (filters.driverType) {
    params.push(filters.driverType);
    sql += ` AND d.driver_type = $${params.length}`;
  }
  sql += ` ORDER BY d.full_name ASC`;
  const r = await query(sql, params);
  return r.rows;
};

const createBulkFaxes = async (items, staffUserId) => {
  const client = await pool.connect();
  const results = { created: [], failed: [] };
  try {
    await client.query('BEGIN');
    for (const item of items) {
      try {
        const d = await client.query(
          `SELECT id, driver_type, owner_trader_id FROM drivers 
           WHERE id = $1 AND approval_status = 'active'`,
          [item.driverId]
        );
        if (d.rows.length === 0) {
          results.failed.push({
            driverId: item.driverId,
            driverName: item.driverName,
            reason: 'السائق غير متاح',
          });
          continue;
        }
        const driver = d.rows[0];

        const v = await client.query(`SELECT id FROM vehicles WHERE id = $1`, [item.vehicleId]);
        if (v.rows.length === 0) {
          results.failed.push({
            driverId: item.driverId,
            driverName: item.driverName,
            reason: 'القاطرة غير موجودة',
          });
          continue;
        }

        const f = await client.query(
          `SELECT id, name_ar FROM product_sources WHERE id = $1 AND status = 'active'`,
          [item.factoryId]
        );
        if (f.rows.length === 0) {
          results.failed.push({
            driverId: item.driverId,
            driverName: item.driverName,
            reason: 'المصنع غير موجود',
          });
          continue;
        }

        const ex = await client.query(
          `SELECT id FROM loading_faxes
           WHERE driver_id = $1 AND vehicle_id = $2
             AND status IN ('REQUESTED','APPROVED','ISSUED') LIMIT 1`,
          [driver.id, item.vehicleId]
        );
        if (ex.rows.length > 0) {
          results.failed.push({
            driverId: item.driverId,
            driverName: item.driverName,
            reason: 'لديه فاكس نشط',
          });
          continue;
        }

        const isManaged = driver.driver_type !== 'trader_driver';

        // توليد رقم الفاكس
        const faxNumber = await generateFaxNumber(client);

        // إنشاء + إصدار فوري
        const fax = await client.query(
          `INSERT INTO loading_faxes
           (driver_id, vehicle_id, factory_id, requested_quantity,
            status, requested_at, notes, created_by,
            requested_by_user_id, trader_id, driver_type_snapshot, is_managed_by_institution,
            fax_number, approved_at, issued_at, approved_quantity)
           VALUES ($1,$2,$3,$4,'ISSUED',NOW(),$5,$6,$7,$8,$9,$10,
                   $11, NOW(), NOW(), $4)
           RETURNING id, fax_number`,
          [
            driver.id, item.vehicleId, item.factoryId, item.quantity,
            item.notes || null, staffUserId,
            staffUserId, driver.owner_trader_id || null,
            driver.driver_type, isManaged,
            faxNumber,
          ]
        );

        await client.query(
          `INSERT INTO automation_events (event_type, entity_type, entity_id, payload)
           VALUES ('fax.bulk_requested', 'loading_faxes', $1, $2)`,
          [fax.rows[0].id, JSON.stringify({ staff_id: staffUserId })]
        );

        await client.query(
          `INSERT INTO notifications (user_id, title_ar, body_ar, type, reference_type, reference_id)
           SELECT d.user_id,
                  'فاكس تحميل جديد',
                  'فاكس رقم ' || $1 || ' من ' || $2 || '. الكمية: ' || $3 || ' كيس. يرجى التوجه للمصنع.',
                  'FAX_ISSUED',
                  'loading_faxes',
                  $4
           FROM drivers d WHERE d.id = $5`,
          [faxNumber, f.rows[0].name_ar, item.quantity, fax.rows[0].id, driver.id]
        );

        await client.query(
          `INSERT INTO sms_messages (phone, message_type, message, status)
           VALUES ($1, 'FAX_ISSUED', $2, 'pending')`,
          [
            driver.phone,
            `مؤسسة الغولي: تم إصدار فاكس التحميل رقم ${faxNumber} من ${f.rows[0].name_ar}. الكمية: ${item.quantity} كيس.`,
          ]
        );

        results.created.push({
          driverId: driver.id,
          faxId: fax.rows[0].id,
          driverName: item.driverName,
          factoryName: f.rows[0].name_ar,
          quantity: item.quantity,
        });
      } catch (err) {
        results.failed.push({
          driverId: item.driverId,
          driverName: item.driverName,
          reason: err.message,
        });
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return results;
};

module.exports = { getSuggestions, createBulkFaxes };
