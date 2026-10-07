'use strict';
/**
 * تنظيف البيانات التاريخية التي كشفها e2e-audit-db.js (I2 / I4+I6 / I7).
 *
 * الوضع الافتراضي = dry-run: معاملة BEGIN READ ONLY لا تكتب شيئًا، تعرض الصفوف والإجراء المخطَّط لكل صف.
 * التنفيذ:  I_HAVE_BACKUP=yes node scripts/cleanup-historical-data.js --apply
 *   (يرفض --apply بلا I_HAVE_BACKUP=yes — خذ نسخة احتياطية من Supabase أولًا)
 * اختياري: --number-active  يولّد رقمًا (عبر generateFaxNumber الآمن) للفاكسات النشطة بلا رقم.
 *
 * الإجراءات (لا حذف أبدًا):
 *   I2: orders.fax_id = الفاكس، فقط حين orders.fax_id IS NULL (إن كان يشير لفاكس آخر → مراجعة يدوية).
 *   I4/I6: وجهات PENDING على فاكس DELIVERED تُلغى (status='CANCELLED')، فقط حين لا تعلّق طلبًا مفتوحًا
 *          (fulfills_order_id فارغ أو الطلب DELIVERED/CANCELLED). غير ذلك → مراجعة يدوية.
 *   I7: افتراضيًا لا شيء. مع --number-active: فاكسات ISSUED/USED/READY_FOR_TRANSIT فقط (لا DELIVERED القديمة).
 * كل تغيير يُسجَّل في automation_events (data.cleanup) بقيمه قبل/بعد. أي خطأ أو تراجع في التحقق → ROLLBACK.
 */
const { generateFaxNumber } = require('../src/utils/number-generator');

const ACTIVE_NEEDING_NUMBER = `('ISSUED','USED','READY_FOR_TRANSIT')`;
const BAGS = (a) => `(${a}.quantity * CASE WHEN ${a}.unit = 'ton' THEN 20 ELSE 1 END)`;

// نفس تعريفات e2e-audit-db.js (I2, I4, I6, I7-النشط) لإحصاء قبل/بعد
const COUNT_SQL = {
  i2: `SELECT COUNT(*)::int AS n FROM loading_faxes f JOIN orders o ON o.id = f.order_id
       WHERE f.status <> 'CANCELLED' AND o.fax_id IS DISTINCT FROM f.id`,
  i4: `SELECT COUNT(DISTINCT f.id)::int AS n FROM loading_faxes f
       JOIN delivery_destinations d ON d.fax_id = f.id AND d.status = 'PENDING' WHERE f.status = 'DELIVERED'`,
  i6: `SELECT COUNT(*)::int AS n FROM (
         SELECT f.id FROM loading_faxes f JOIN delivery_destinations x ON x.fax_id = f.id
         WHERE x.status <> 'CANCELLED' AND f.status <> 'CANCELLED'
         GROUP BY f.id, f.loaded_quantity, f.approved_quantity, f.requested_quantity
         HAVING SUM(${BAGS('x')}) > COALESCE(f.loaded_quantity, f.approved_quantity, f.requested_quantity) + 0.01) q`,
  i7: `SELECT COUNT(*)::int AS n FROM loading_faxes WHERE status IN ${ACTIVE_NEEDING_NUMBER} AND fax_number IS NULL`,
};

const counts = async (client) => {
  const out = {};
  for (const [k, sql] of Object.entries(COUNT_SQL)) out[k] = (await client.query(sql)).rows[0].n;
  return out;
};

const toBags = (qty, unit) => Number(qty || 0) * (unit === 'ton' ? 20 : 1);

/** يبني الخطة؛ lock=true (وضع --apply) يضيف FOR UPDATE OF <alias> ليسلسل مع أي تعديل متزامن. */
const buildPlan = async (client, { lock, numberActive }) => {
  const i2 = (await client.query(
    `SELECT o.id AS order_id, o.order_number, o.status AS order_status, o.fax_id AS current_fax_id,
            f.id AS fax_id, f.fax_number, f.status AS fax_status
     FROM loading_faxes f JOIN orders o ON o.id = f.order_id
     WHERE f.status <> 'CANCELLED' AND o.fax_id IS DISTINCT FROM f.id
     ORDER BY o.order_number ${lock ? 'FOR UPDATE OF o' : ''}`
  )).rows.map((r) => ({ ...r, action: r.current_fax_id === null ? 'FIX' : 'MANUAL',
    why: r.current_fax_id === null ? 'orders.fax_id فارغ' : 'orders.fax_id يشير لفاكس آخر — قرار يدوي' }));

  const i4 = (await client.query(
    `SELECT d.id, d.fax_id, f.fax_number, d.destination_type, d.trader_id, d.warehouse_id, d.quantity, d.unit,
            d.fulfills_order_id, o.status AS linked_order_status,
            EXISTS (SELECT 1 FROM delivery_destinations t
                    WHERE t.fax_id = d.fax_id AND t.status = 'DELIVERED' AND t.destination_type = d.destination_type
                      AND t.trader_id IS NOT DISTINCT FROM d.trader_id
                      AND t.warehouse_id IS NOT DISTINCT FROM d.warehouse_id) AS has_delivered_twin
     FROM delivery_destinations d
     JOIN loading_faxes f ON f.id = d.fax_id
     LEFT JOIN orders o ON o.id = d.fulfills_order_id
     WHERE f.status = 'DELIVERED' AND d.status = 'PENDING'
     ORDER BY f.fax_number, d.sort_order ${lock ? 'FOR UPDATE OF d' : ''}`
  )).rows.map((r) => {
    const open = r.fulfills_order_id && !['DELIVERED', 'CANCELLED'].includes(r.linked_order_status);
    return { ...r, action: open ? 'MANUAL' : 'CANCEL',
      why: open ? `مرتبطة بطلب مفتوح (${r.linked_order_status}) — قرار يدوي` : 'وجهة PENDING على فاكس DELIVERED (ميتة)' };
  });

  // I6: المتوقع بعد الإلغاء المخطَّط لكل فاكس متأثر
  const faxIds = [...new Set(i4.map((r) => r.fax_id))];
  const i6 = [];
  for (const faxId of faxIds) {
    const r = (await client.query(
      `SELECT f.fax_number, COALESCE(f.loaded_quantity, f.approved_quantity, f.requested_quantity) AS capacity,
              COALESCE(SUM(${BAGS('x')}), 0) AS dest_bags
       FROM loading_faxes f LEFT JOIN delivery_destinations x ON x.fax_id = f.id AND x.status <> 'CANCELLED'
       WHERE f.id = $1 GROUP BY f.id, f.fax_number, f.loaded_quantity, f.approved_quantity, f.requested_quantity`,
      [faxId])).rows[0];
    const cancelBags = i4.filter((x) => x.fax_id === faxId && x.action === 'CANCEL').reduce((s, x) => s + toBags(x.quantity, x.unit), 0);
    const after = Number(r.dest_bags) - cancelBags;
    i6.push({ fax_number: r.fax_number, capacity: Number(r.capacity), before: Number(r.dest_bags), expected_after: after,
      resolves: after <= Number(r.capacity) + 0.01 });
  }

  const i7 = numberActive
    ? (await client.query(
        `SELECT id, fax_number, status FROM loading_faxes
         WHERE status IN ${ACTIVE_NEEDING_NUMBER} AND fax_number IS NULL
         ORDER BY requested_at, id ${lock ? 'FOR UPDATE' : ''}`)).rows.map((r) => ({ ...r, action: 'NUMBER', why: 'فاكس نشط بلا رقم' }))
    : [];

  return { i2, i4, i6, i7 };
};

const logEvent = (client, type, entityType, entityId, payload) => client.query(
  `INSERT INTO automation_events (event_type, entity_type, entity_id, payload) VALUES ($1, $2, $3, $4)`,
  [type, entityType, entityId, JSON.stringify(payload)]);

const mustChange = (res, what) => {
  if (res.rowCount !== 1) throw new Error(`تغيّر الصف أثناء التنفيذ (${what}) — أُلغيت المعاملة`);
};

/**
 * @returns {{plan, before, after|null, applied:boolean}}
 * apply=false: READ ONLY ثم ROLLBACK (لا كتابة). apply=true: كتابة ثم تحقق ثم COMMIT أو ROLLBACK.
 */
const run = async (client, { apply = false, numberActive = false, log = () => {} } = {}) => {
  await client.query(apply ? 'BEGIN' : 'BEGIN READ ONLY');
  try {
    const before = await counts(client);
    const plan = await buildPlan(client, { lock: apply, numberActive });
    if (!apply) {
      await client.query('ROLLBACK');
      return { plan, before, after: null, applied: false };
    }

    for (const r of plan.i2.filter((x) => x.action === 'FIX')) {
      mustChange(await client.query(`UPDATE orders SET fax_id = $1, updated_at = NOW() WHERE id = $2 AND fax_id IS NULL`, [r.fax_id, r.order_id]), `I2 ${r.order_number}`);
      await logEvent(client, 'data.cleanup', 'orders', r.order_id, { step: 'I2', fax_id: { from: null, to: r.fax_id }, fax_number: r.fax_number });
      log(`  I2 ✔ ${r.order_number} ← ${r.fax_number || r.fax_id}`);
    }
    for (const r of plan.i4.filter((x) => x.action === 'CANCEL')) {
      mustChange(await client.query(`UPDATE delivery_destinations SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1 AND status = 'PENDING'`, [r.id]), `I4 ${r.fax_number}`);
      await logEvent(client, 'data.cleanup', 'delivery_destinations', r.id, { step: 'I4', status: { from: 'PENDING', to: 'CANCELLED' }, fax_number: r.fax_number, quantity: r.quantity, unit: r.unit });
      log(`  I4 ✔ ${r.fax_number}: وجهة ${r.id} → CANCELLED`);
    }
    for (const r of plan.i7) {
      const num = await generateFaxNumber(client);
      mustChange(await client.query(`UPDATE loading_faxes SET fax_number = $1, updated_at = NOW() WHERE id = $2 AND fax_number IS NULL`, [num, r.id]), `I7 ${r.id}`);
      await logEvent(client, 'data.cleanup', 'loading_faxes', r.id, { step: 'I7', fax_number: { from: null, to: num }, status: r.status });
      log(`  I7 ✔ ${r.id} → ${num}`);
    }

    const after = await counts(client);
    // لا نُثبّت إن ساء أي مؤشر (يحمي من تأثير جانبي غير متوقع)
    for (const k of Object.keys(before)) {
      if (after[k] > before[k]) throw new Error(`المؤشر ${k} ساء (${before[k]} → ${after[k]}) — أُلغيت المعاملة`);
    }
    await client.query('COMMIT');
    return { plan, before, after, applied: true };
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) { /* تجاهل */ }
    throw e;
  }
};

const printReport = ({ plan, before, after, applied }) => {
  const sec = (t) => console.log(`\n── ${t}`);
  sec(`I2 orders.fax_id (${plan.i2.length})`);
  for (const r of plan.i2) console.log(`  [${r.action}] ${r.order_number} (طلب ${r.order_status}) ← ${r.fax_number || r.fax_id} (${r.fax_status}) | الحالي: ${r.current_fax_id || 'NULL'} | ${r.why}`);
  sec(`I4 وجهات PENDING على فاكس DELIVERED (${plan.i4.length})`);
  for (const r of plan.i4) console.log(`  [${r.action}] ${r.fax_number}: ${r.destination_type} ${r.trader_id || r.warehouse_id} كمية ${r.quantity} ${r.unit} | توأم مُسلَّم: ${r.has_delivered_twin ? 'نعم' : 'لا'} | ${r.why}`);
  sec('I6 السعة بعد الإلغاء المخطَّط');
  for (const r of plan.i6) console.log(`  ${r.fax_number}: ${r.before} → ${r.expected_after} كيس (السعة ${r.capacity}) ${r.resolves ? '✅ يُحل' : '❌ لا يُحل — الوجهات المُسلَّمة نفسها تتجاوز السعة، مراجعة يدوية'}`);
  sec(`I7 ترقيم الفاكسات النشطة (${plan.i7.length})`);
  if (!plan.i7.length) console.log('  لا شيء (لم يُطلب --number-active أو لا يوجد)');
  for (const r of plan.i7) console.log(`  [${r.action}] ${r.id} (${r.status})`);
  sec(applied ? 'قبل / بعد (من DB)' : 'الحالي (dry-run — لم يُكتب شيء)');
  for (const k of Object.keys(before)) console.log(`  ${k}: ${before[k]}${after ? ` → ${after[k]}` : ''}`);
};

module.exports = { run, buildPlan, counts, printReport };

if (require.main === module) {
  require('dotenv').config();
  const { pool } = require('../src/config/db');
  const apply = process.argv.includes('--apply');
  const numberActive = process.argv.includes('--number-active');
  (async () => {
    if (apply && process.env.I_HAVE_BACKUP !== 'yes') {
      console.error('❌ --apply يتطلب I_HAVE_BACKUP=yes (خذ نسخة احتياطية أولًا)');
      process.exit(2);
    }
    const client = await pool.connect();
    let code = 0;
    try {
      console.log(apply ? '⚙️  وضع التنفيذ (--apply)' : '🔍 dry-run (قراءة فقط)');
      const res = await run(client, { apply, numberActive, log: console.log });
      printReport(res);
      console.log(apply ? '\n✅ تم التثبيت — أعد تشغيل: node scripts/e2e-audit-db.js'
                        : '\nℹ️  للتنفيذ: I_HAVE_BACKUP=yes node scripts/cleanup-historical-data.js --apply [--number-active]');
    } catch (e) {
      console.error('❌ فشل (تم التراجع):', e.message); code = 1;
    } finally {
      client.release(); await pool.end(); process.exit(code);
    }
  })();
}
