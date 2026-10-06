'use strict';
/**
 * يعرض وجهات يُتوقَّع أن يرفضها endpoint التسليم (بوابة A2) — لاختبار curl آمن بلا كتابة.
 * قراءة فقط (BEGIN READ ONLY). يستبعد أي وجهة قد يقبلها التسليم فعلًا (لأنها ستكتب).
 * الاستخدام: node scripts/check-deliver-gate-candidates.js
 */
require('dotenv').config();
const { pool } = require('../src/config/db');

const expected = (r) => {
  if (r.dest_status === 'DELIVERED') return 'DESTINATION_ALREADY_DELIVERED';
  if (r.dest_status === 'CANCELLED') return 'DESTINATION_CANCELLED';
  if (r.dest_status !== 'PENDING') return 'INVALID_DESTINATION_STATUS';
  if (r.fax_status === 'DELIVERED') return 'FAX_ALREADY_DELIVERED';
  if (r.fax_status === 'CANCELLED') return 'FAX_CANCELLED';
  const need = r.is_managed === false ? 'USED' : 'READY_FOR_TRANSIT';
  return r.fax_status === need ? null : 'FAX_NOT_READY_FOR_DELIVERY';
};

(async () => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN READ ONLY');
    const r = await c.query(
      `SELECT dd.id AS dest_id, dd.status AS dest_status, f.id AS fax_id, f.fax_number,
              f.status AS fax_status, f.is_managed_by_institution AS is_managed,
              d.full_name AS driver_name, COALESCE(d.phone, u.phone) AS driver_phone
       FROM delivery_destinations dd
       JOIN loading_faxes f ON f.id = dd.fax_id
       LEFT JOIN drivers d ON d.id = f.driver_id
       LEFT JOIN users u ON u.id = d.user_id
       ORDER BY f.requested_at DESC, dd.sort_order`
    );
    await c.query('ROLLBACK');

    const safe = []; const wouldWrite = [];
    for (const row of r.rows) {
      const code = expected(row);
      if (code) safe.push({ ...row, expected_code: code }); else wouldWrite.push(row);
    }
    console.log(`وجهات: ${r.rows.length} | آمنة للاختبار (ستُرفض): ${safe.length} | ⚠️ ستُقبل وتكتب (لا تختبرها): ${wouldWrite.length}`);
    console.log('\n== آمنة للاختبار ==');
    console.table(safe.map((x) => ({ dest_id: x.dest_id, fax: x.fax_number, fax_status: x.fax_status, dest_status: x.dest_status,
      managed: x.is_managed, driver: x.driver_name, phone: x.driver_phone, expected: x.expected_code })));
    if (wouldWrite.length) {
      console.log('\n== ⚠️ لا تستدعِ deliver عليها ==');
      console.table(wouldWrite.map((x) => ({ dest_id: x.dest_id, fax: x.fax_number, fax_status: x.fax_status })));
    }
  } catch (e) {
    try { await c.query('ROLLBACK'); } catch (_) { /* ignore */ }
    console.error('❌ فشل:', e.message); process.exitCode = 2;
  } finally { c.release(); await pool.end(); }
})();
