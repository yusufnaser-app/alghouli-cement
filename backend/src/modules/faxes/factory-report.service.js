'use strict';
/**
 * تقرير فاكسات المصنع خلال فترة: الفاكسات الفعلية الصادرة للمصنع (بلا تكرار)، مع إجماليات.
 * الفاكس يُحسب مرة واحدة (لا يتكرر بسبب الوجهات). الملغى لا يدخل الإجماليات ويُعدّ منفصلًا.
 * الأكياس: المحمّلة إن وُجدت، وإلا المعتمدة، وإلا المطلوبة (الفاكس يحفظ الكميات بالأكياس دائمًا).
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const validateRange = (from, to) => {
  if (!DATE_RE.test(from || '') || !DATE_RE.test(to || '') || from > to) {
    const e = new Error('نطاق التاريخ غير صالح (YYYY-MM-DD، من ≤ إلى)');
    e.status = 400; e.code = 'INVALID_RANGE';
    throw e;
  }
};

/** يبني التقرير من الصفوف الخام (دالة خالصة تُختبر بلا قاعدة بيانات). */
const buildFactoryReport = (factory, rows) => {
  const seen = new Set();
  const faxes = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    const bags = r.bags === null || r.bags === undefined ? null : Number(r.bags);
    faxes.push({
      fax_number: r.fax_number,
      status: r.status,
      driver_name: r.driver_name || 'غير مسجّل',
      plate_number: r.plate_number || 'غير مسجّلة',
      product_name: r.product_name || 'غير محدد',
      bags,
      requested_at: r.requested_at,
      cancelled: r.status === 'CANCELLED',
    });
  }
  const active = faxes.filter((f) => !f.cancelled);
  const byProduct = {};
  for (const f of active) {
    const k = f.product_name;
    byProduct[k] = byProduct[k] || { product_name: k, count: 0, bags: 0 };
    byProduct[k].count += 1;
    byProduct[k].bags += f.bags || 0;
  }
  return {
    factory: { id: factory.id, name_ar: factory.name_ar },
    count: active.length,
    total_bags: active.reduce((s, f) => s + (f.bags || 0), 0),
    cancelled_count: faxes.length - active.length,
    by_product: Object.values(byProduct),
    rows: faxes,
  };
};

const factoryReport = async (client, factoryId, from, to) => {
  validateRange(from, to);
  const f = await client.query(`SELECT id, name_ar FROM product_sources WHERE id = $1`, [factoryId]);
  if (!f.rows.length) { const e = new Error('المصنع غير موجود'); e.status = 404; throw e; }
  const r = await client.query(
    `SELECT f.id, f.fax_number, f.status, f.requested_at,
            COALESCE(f.loaded_quantity, f.approved_quantity, f.requested_quantity) AS bags,
            d.full_name AS driver_name, v.plate_number, p.name_ar AS product_name
     FROM loading_faxes f
     LEFT JOIN drivers d ON d.id = f.driver_id
     LEFT JOIN vehicles v ON v.id = f.vehicle_id
     LEFT JOIN products p ON p.id = f.product_id
     WHERE f.factory_id = $1
       AND f.requested_at >= $2::date AND f.requested_at < ($3::date + 1)
     ORDER BY f.requested_at, f.fax_number`,
    [factoryId, from, to]
  );
  return buildFactoryReport(f.rows[0], r.rows);
};

module.exports = { buildFactoryReport, factoryReport, validateRange };
