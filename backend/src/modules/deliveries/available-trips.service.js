'use strict';
const { query } = require('../../config/db');
const { capacitySql, usedBagsSql, eligibleStatusesSql } = require('./trip-capacity');
const { scoreTrip } = require('./auto-assign.service');

const norm = (v) => String(v || '').trim();

/**
 * ترتيب الرحلات بالنقاط (نفس scoreTrip المستخدم في التكليف التلقائي).
 * بلا محافظة: تُعاد الرحلات بترتيبها الأصلي (الأقدم أولًا) و match_score = null.
 * مع محافظة: تُستبعد الرحلات غير المناسبة (score = null) وتُرتَّب بالنقاط ثم الأقدم.
 */
const rankTrips = (rows, governorate) => {
  const g = norm(governorate);
  if (!g) return rows.map((r) => ({ ...r, match_score: null, match_reason: null }));
  const ranked = [];
  rows.forEach((r, i) => {
    const sc = scoreTrip(r, g);
    if (!sc) return;
    ranked.push({ ...r, match_score: sc.score, match_reason: sc.reason, _i: i });
  });
  ranked.sort((a, b) => b.match_score - a.match_score || a._i - b._i);
  return ranked.map(({ _i, ...rest }) => rest);
};

/**
 * الرحلات النشطة (فاكسات مؤسسة لم تُسلَّم بعد) مع الكمية المتبقية بالأكياس.
 * السعة والمستخدم من trip-capacity.js: الطن ×20 والوجهات الملغاة مستبعدة (كما في التكليف التلقائي).
 * فلاتر: governorate (ترتيب بالنقاط)، factoryId، minRemaining (بالأكياس).
 */
const listAvailableTrips = async (filters = {}) => {
  const params = [];
  const gov = norm(filters.governorate);

  let hasDestSql = 'FALSE';
  if (gov) {
    params.push(gov);
    hasDestSql = `EXISTS (SELECT 1 FROM delivery_destinations dg
                          WHERE dg.fax_id = f.id AND dg.status <> 'CANCELLED'
                            AND TRIM(dg.governorate) = $${params.length})`;
  }

  let factoryWhere = '';
  if (filters.factoryId) { params.push(filters.factoryId); factoryWhere = ` AND f.factory_id = $${params.length}`; }

  const minRemaining = Number(filters.minRemaining) > 0 ? Number(filters.minRemaining) : 0;
  params.push(minRemaining);

  const r = await query(`
    SELECT f.id AS fax_id, f.fax_number, f.status, f.factory_id, f.driver_id, f.vehicle_id,
           f.delivery_governorate, f.delivery_area, f.route, f.requested_at,
           s.name_ar AS factory_name, d.full_name AS driver_name, v.plate_number,
           ${capacitySql('f')} AS capacity,
           ${usedBagsSql('f')} AS assigned,
           ${capacitySql('f')} - ${usedBagsSql('f')} AS remaining,
           (SELECT COUNT(*)::int FROM delivery_destinations dc
            WHERE dc.fax_id = f.id AND dc.status <> 'CANCELLED') AS destinations_count,
           ${hasDestSql} AS has_dest_in_gov
    FROM loading_faxes f
    LEFT JOIN product_sources s ON s.id = f.factory_id
    LEFT JOIN drivers d ON d.id = f.driver_id
    LEFT JOIN vehicles v ON v.id = f.vehicle_id
    WHERE f.status IN (${eligibleStatusesSql()})
      AND COALESCE(f.is_managed_by_institution, TRUE) = TRUE${factoryWhere}
      AND ${capacitySql('f')} - ${usedBagsSql('f')} >= $${params.length}
    ORDER BY f.requested_at ASC
  `, params);

  return rankTrips(r.rows, gov);
};

module.exports = { listAvailableTrips, rankTrips };
