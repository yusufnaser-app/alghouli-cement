const { query } = require('../../config/db');

/**
 * الرحلات النشطة (فاكسات لم تُسلَّم بعد) مع الكمية المتبقية.
 * المتبقي = COALESCE(loaded_quantity, approved_quantity, requested_quantity) - مجموع وجهات الفاكس غير الملغاة.
 * فلاتر: governorate، factoryId، minRemaining
 */
const listAvailableTrips = async (filters = {}) => {
  const params = [];
  let where = `WHERE f.status IN ('REQUESTED','APPROVED','ISSUED','USED','READY_FOR_TRANSIT')`;
  if (filters.governorate) { params.push(filters.governorate); where += ` AND COALESCE(f.delivery_governorate, '') = $${params.length}`; }
  if (filters.factoryId) { params.push(filters.factoryId); where += ` AND f.factory_id = $${params.length}`; }
  const minRemaining = Number(filters.minRemaining) > 0 ? Number(filters.minRemaining) : 0;
  params.push(minRemaining);

  const r = await query(`
    SELECT f.id AS fax_id, f.fax_number, f.status, f.factory_id, f.driver_id, f.vehicle_id,
           f.delivery_governorate, f.delivery_area,
           s.name_ar AS factory_name, d.full_name AS driver_name, v.plate_number,
           COALESCE(f.loaded_quantity, f.approved_quantity, f.requested_quantity, 0) AS capacity,
           COALESCE(x.used, 0) AS assigned,
           COALESCE(f.loaded_quantity, f.approved_quantity, f.requested_quantity, 0) - COALESCE(x.used, 0) AS remaining,
           COALESCE(x.cnt, 0) AS destinations_count
    FROM loading_faxes f
    LEFT JOIN product_sources s ON s.id = f.factory_id
    LEFT JOIN drivers d ON d.id = f.driver_id
    LEFT JOIN vehicles v ON v.id = f.vehicle_id
    LEFT JOIN (
      SELECT fax_id, SUM(quantity) AS used, COUNT(*) AS cnt
      FROM delivery_destinations GROUP BY fax_id
    ) x ON x.fax_id = f.id
    ${where}
      AND COALESCE(f.is_managed_by_institution, TRUE) = TRUE
      AND COALESCE(f.loaded_quantity, f.approved_quantity, f.requested_quantity, 0) - COALESCE(x.used, 0) >= $${params.length}
    ORDER BY f.requested_at ASC
  `, params);
  return r.rows;
};

module.exports = { listAvailableTrips };
