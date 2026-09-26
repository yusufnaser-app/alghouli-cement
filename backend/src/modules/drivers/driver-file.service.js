const { pool, query } = require('../../config/db');

// معلومات السائق الكاملة
const getFullProfile = async (driverId) => {
  const d = await query(
    `SELECT d.*, u.email, u.last_login_at, u.status AS user_status,
            (SELECT json_agg(json_build_object(
              'id', v.id, 'plate_number', v.plate_number,
              'vehicle_type', v.vehicle_type,
              'capacity_tons', v.capacity_tons,
              'operating_status', v.operating_status,
              'current_driver_id', v.current_driver_id
            ))
            FROM vehicles v WHERE v.current_driver_id = d.id) AS vehicles,
            (SELECT COALESCE(SUM(debit), 0) FROM driver_ledger dl
              WHERE dl.driver_id = d.id AND dl.transaction_type = 'transport_due') AS total_dues,
            (SELECT COALESCE(SUM(credit), 0) FROM driver_ledger dl
              WHERE dl.driver_id = d.id AND dl.transaction_type = 'payment') AS total_paid,
            (SELECT COALESCE(SUM(debit), 0) FROM driver_ledger dl
              WHERE dl.driver_id = d.id AND dl.transaction_type = 'advance') AS total_advances,
            (SELECT COALESCE(SUM(debit), 0) FROM driver_ledger dl
              WHERE dl.driver_id = d.id AND dl.transaction_type = 'deduction') AS total_deductions,
            (SELECT COUNT(*) FROM loading_faxes WHERE driver_id = d.id) AS total_trips,
            (SELECT COUNT(*) FROM loading_faxes WHERE driver_id = d.id AND status IN ('REQUESTED','APPROVED','ISSUED','USED')) AS active_trips,
            (SELECT json_build_object(
              'id', lf.id, 'status', lf.status,
              'factory_name', ps.name_ar,
              'requested_quantity', lf.requested_quantity,
              'plate_number', v.plate_number
            )
            FROM loading_faxes lf
            LEFT JOIN product_sources ps ON ps.id = lf.factory_id
            LEFT JOIN vehicles v ON v.id = lf.vehicle_id
            WHERE lf.driver_id = d.id
              AND lf.status IN ('REQUESTED','APPROVED','ISSUED','USED')
            ORDER BY lf.requested_at DESC LIMIT 1) AS current_trip
     FROM drivers d
     JOIN users u ON u.id = d.user_id
     WHERE d.id = $1`,
    [driverId]
  );
  return d.rows[0] || null;
};

// الرحلات والفاكسات
const getTrips = async (driverId, { limit = 100, from, to } = {}) => {
  let sql = `
    SELECT lf.id, lf.status, lf.requested_at, lf.used_at,
           lf.requested_quantity, lf.loaded_quantity,
           lf.quantity_discrepancy, lf.fax_number,
           lf.route, lf.transport_rate, lf.transport_rate_unit,
           lf.transport_total, lf.transport_payer,
           ps.name_ar AS factory_name,
           v.plate_number,
           o.order_number,
           u.full_name AS customer_name
    FROM loading_faxes lf
    LEFT JOIN product_sources ps ON ps.id = lf.factory_id
    LEFT JOIN vehicles v ON v.id = lf.vehicle_id
    LEFT JOIN orders o ON o.id = lf.order_id
    LEFT JOIN customers c ON c.id = o.customer_id
    LEFT JOIN users u ON u.id = c.user_id
    WHERE lf.driver_id = $1
  `;
  const params = [driverId];
  if (from) { params.push(from); sql += ` AND lf.requested_at >= $${params.length}`; }
  if (to) { params.push(to); sql += ` AND lf.requested_at <= $${params.length}`; }
  params.push(limit);
  sql += ` ORDER BY lf.requested_at DESC LIMIT $${params.length}`;

  const r = await query(sql, params);
  return r.rows;
};

// سجل النشاط
const getActivity = async (driverId, { limit = 100 } = {}) => {
  const activities = [];

  // الفاكسات
  const faxes = await query(
    `SELECT 'fax' AS type, id AS ref_id,
            CASE 
              WHEN status = 'REQUESTED' THEN 'طلب فاكس'
              WHEN status = 'APPROVED' THEN 'اعتماد الفاكس'
              WHEN status = 'ISSUED' THEN 'إصدار الفاكس'
              WHEN status = 'USED' THEN 'تسجيل التحميل'
              WHEN status = 'CANCELLED' THEN 'إلغاء الفاكس'
              ELSE status
            END AS description,
            requested_at AS created_at,
            fax_number,
            NULL AS amount
     FROM loading_faxes WHERE driver_id = $1
     ORDER BY requested_at DESC LIMIT 50`,
    [driverId]
  );
  activities.push(...faxes.rows);

  // الحساب المالي
  const ledger = await query(
    `SELECT 'ledger' AS type, id AS ref_id,
            CASE 
              WHEN transaction_type = 'transport_due' THEN 'تقييد مستحق نقل'
              WHEN transaction_type = 'payment' THEN 'تحويل دفعة'
              WHEN transaction_type = 'advance' THEN 'تسجيل سلفة'
              WHEN transaction_type = 'deduction' THEN 'تسجيل خصم'
              ELSE transaction_type
            END AS description,
            created_at,
            reference_code AS fax_number,
            CASE 
              WHEN transaction_type = 'payment' THEN credit
              ELSE debit
            END AS amount
     FROM driver_ledger WHERE driver_id = $1
     ORDER BY created_at DESC LIMIT 50`,
    [driverId]
  );
  activities.push(...ledger.rows);

  // رتب حسب التاريخ
  activities.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return activities.slice(0, limit);
};

// قائمة التحويلات
const getTransfers = async (driverId) => {
  const r = await query(
    `SELECT dl.id, dl.created_at, dl.credit AS amount,
            dl.description, dl.reference_code,
            dl.balance_after,
            u.full_name AS created_by_name
     FROM driver_ledger dl
     LEFT JOIN users u ON u.id = dl.created_by
     WHERE dl.driver_id = $1 AND dl.transaction_type = 'payment'
     ORDER BY dl.created_at DESC`,
    [driverId]
  );
  return r.rows;
};

// تسجيل تحويل
const createTransfer = async (driverId, data, userId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const d = await client.query(
      `SELECT current_balance FROM drivers WHERE id = $1 FOR UPDATE`,
      [driverId]
    );
    if (d.rows.length === 0) {
      const err = new Error('السائق غير موجود');
      err.status = 404;
      throw err;
    }

    const currentBalance = parseFloat(d.rows[0].current_balance || 0);
    const amount = parseFloat(data.amount);

    if (amount > currentBalance) {
      const err = new Error(`المبلغ أكبر من الرصيد (${currentBalance})`);
      err.status = 400;
      throw err;
    }

    const newBalance = currentBalance - amount;

    await client.query(
      `INSERT INTO driver_ledger
       (driver_id, transaction_type, description, debit, credit, balance_after,
        reference_code, created_by)
       VALUES ($1, 'payment', $2, 0, $3, $4, $5, $6)`,
      [
        driverId,
        data.notes || `تحويل - ${data.method || 'نقدي'}`,
        amount, newBalance,
        data.reference || null,
        userId,
      ]
    );

    await client.query(
      `UPDATE drivers SET current_balance = $1 WHERE id = $2`,
      [newBalance, driverId]
    );

    // إشعار للسائق
    await client.query(
      `INSERT INTO notifications (user_id, title_ar, body_ar, type, reference_type, reference_id)
       SELECT d.user_id,
              'تم تحويل مبلغ',
              'تم تحويل ' || $1 || ' ريال إلى حسابك عبر ' || COALESCE($2, 'نقدي') || '.',
              'PAYMENT_RECEIVED',
              'drivers',
              $3
       FROM drivers d WHERE d.id = $3`,
      [amount, data.method, driverId]
    );

    await client.query('COMMIT');
    return { new_balance: newBalance, amount };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// إحصائيات السائقين (للقائمة)
const getStats = async () => {
  const r = await query(`
    SELECT
      COUNT(*) AS total,
      COUNT(CASE WHEN status = 'available' THEN 1 END) AS available,
      COUNT(CASE WHEN status = 'busy' THEN 1 END) AS busy,
      COUNT(CASE WHEN approval_status = 'pending_approval' THEN 1 END) AS pending,
      COUNT(CASE WHEN approval_status = 'suspended' THEN 1 END) AS suspended,
      COALESCE(SUM(current_balance), 0) AS total_dues
    FROM drivers
  `);
  return r.rows[0];
};

module.exports = {
  getFullProfile,
  getTrips,
  getActivity,
  getTransfers,
  createTransfer,
  getStats,
};
