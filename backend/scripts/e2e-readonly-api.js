'use strict';
/**
 * D2 — فحص كامل عبر API (GET فقط بعد تسجيل الدخول؛ لا يكتب شيئًا).
 * يتحقق من اتساق مركز العمليات، رحلات التكليف، وجهات الفواكس، وسلامة المحاسبة.
 *
 * الاستخدام (لا كلمات مرور داخل الملف):
 *   API_URL=https://<render-host>/api/v1 E2E_PHONE=967... E2E_PASSWORD='...' node scripts/e2e-readonly-api.js
 */
const API = (process.env.API_URL || '').replace(/\/$/, '');
const PHONE = process.env.E2E_PHONE;
const PASS = process.env.E2E_PASSWORD;
if (!API || !PHONE || !PASS) {
  console.error('عيّن API_URL و E2E_PHONE و E2E_PASSWORD');
  process.exit(2);
}

let token = null;
let fails = 0; let warns = 0;
const ok = (m) => console.log(`✅ ${m}`);
const bad = (m) => { fails++; console.log(`❌ ${m}`); };
const warn = (m) => { warns++; console.log(`⚠️  ${m}`); };
const check = (cond, pass, fail) => (cond ? ok(pass) : bad(fail));

const call = async (method, path, body) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch (_) { /* غير JSON */ }
  return { status: res.status, json };
};
const get = (path) => call('GET', path);
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

(async () => {
  // 0) الدخول (POST وحيد — لا يغيّر بيانات العمل)
  const login = await call('POST', '/auth/login', { phone: PHONE, password: PASS });
  const d = login.json && login.json.data;
  token = d && (d.token || d.accessToken || d.access_token);
  if (!token) { console.error('❌ فشل الدخول:', login.status, login.json && login.json.message); process.exit(1); }
  ok('تسجيل الدخول');

  // 1) مركز العمليات
  const oc = await get('/faxes/operations-center');
  const o = oc.json && oc.json.data;
  if (oc.status !== 200 || !o) { bad(`operations-center ${oc.status}`); }
  else {
    const all = o.all || [];
    const allIds = new Set(all.map((f) => f.id));
    check(o.summary && o.summary.all_count === all.length, `summary.all_count = ${all.length}`, `summary.all_count (${o.summary && o.summary.all_count}) ≠ طول all (${all.length})`);
    const seen = new Map();
    for (const seg of ['institution', 'trader']) {
      for (const [k, list] of Object.entries(o[seg] || {})) {
        const sc = o.summary[`${seg}_${k}`];
        if (sc !== list.length) bad(`summary.${seg}_${k} (${sc}) ≠ ${list.length}`);
        for (const f of list) {
          const isTrader = f.fleet_type === 'trader_driver';
          if ((seg === 'trader') !== isTrader) bad(`فاكس ${f.fax_number || f.id} في تبويب ${seg} ونوع أسطوله ${f.fleet_type}`);
          if (!allIds.has(f.id)) bad(`فاكس ${f.fax_number || f.id} في ${seg}.${k} وغائب عن all`);
          if (seen.has(f.id)) bad(`فاكس ${f.fax_number || f.id} في أكثر من قسم (${seen.get(f.id)} و ${seg}.${k})`);
          seen.set(f.id, `${seg}.${k}`);
        }
      }
    }
    ok(`مركز العمليات: ${all.length} فاكس، ${seen.size} مصنَّف`);

    // 2) وجهات كل فاكس نشط (حتى 25)
    const active = all.filter((f) => !['CANCELLED', 'DELIVERED'].includes(f.status)).slice(0, 25);
    for (const f of active) {
      const r = await get(`/faxes/${f.id}/destinations`);
      const dests = (r.json && r.json.data) || [];
      if (r.status !== 200) { bad(`وجهات ${f.fax_number || f.id}: HTTP ${r.status}`); continue; }
      const cap = num(f.loaded_quantity) ?? num(f.approved_quantity) ?? num(f.requested_quantity) ?? 0;
      const bags = dests.filter((x) => x.status !== 'CANCELLED')
        .reduce((s, x) => s + Number(x.quantity || 0) * (x.unit === 'ton' ? 20 : 1), 0);
      if (bags > cap + 0.01) bad(`فاكس ${f.fax_number}: مجموع الوجهات ${bags} كيس > السعة ${cap}`);
      const own = dests.filter((x) => x.fulfills_order_id && x.fulfills_order_id === f.order_id && x.status !== 'CANCELLED');
      if (own.length > 1) bad(`فاكس ${f.fax_number}: ${own.length} وجهات لنفس الطلب`);
      if (f.fleet_type === 'trader_driver' && f.order_id && ['ISSUED', 'USED'].includes(f.status) && own.length === 0) {
        warn(`فاكس تاجر ${f.fax_number} بلا وجهة تلقائية (قديم قبل B؟)`);
      }
    }
    ok(`فُحصت وجهات ${active.length} فاكس نشط`);
  }

  // 3) رحلات التكليف
  const tr = await get('/deliveries/available-trips');
  const trips = (tr.json && tr.json.data) || [];
  check(tr.status === 200, `available-trips: ${trips.length} رحلة`, `available-trips HTTP ${tr.status}`);
  for (const t of trips) {
    const rem = num(t.remaining); const cap = num(t.capacity);
    if (rem === null || cap === null || rem < 0 || rem > cap + 0.01) bad(`رحلة ${t.fax_number}: remaining=${t.remaining} capacity=${t.capacity}`);
  }
  const gov = (trips.find((t) => t.delivery_governorate) || {}).delivery_governorate;
  if (gov) {
    const rr = await get(`/deliveries/available-trips?governorate=${encodeURIComponent(gov)}`);
    const ranked = (rr.json && rr.json.data) || [];
    const scores = ranked.map((t) => t.match_score);
    check(scores.every((s) => s !== null && s !== undefined), `match_score موجود لكل الرحلات (محافظة ${gov})`, 'match_score مفقود مع تحديد المحافظة');
    check(scores.every((s, i) => i === 0 || s <= scores[i - 1]), 'الترتيب تنازلي بالدرجة', `الترتيب غير تنازلي: ${scores.join(',')}`);
    check(ranked.length === trips.length, 'نفس عدد الرحلات مع/بدون محافظة', `العدد يختلف: ${trips.length} مقابل ${ranked.length}`);
  } else warn('لا رحلة بمحافظة — تخطّي فحص match_score');

  // 4) بانتظار التكليف + قوائم الوجهات
  const pa = await get('/deliveries/pending-assignment');
  check(pa.status === 200 && Array.isArray(pa.json && pa.json.data), `pending-assignment: ${((pa.json && pa.json.data) || []).length}`, `pending-assignment HTTP ${pa.status}`);
  for (const [name, path] of [['traders/list', '/faxes/traders/list'], ['warehouses/list', '/faxes/warehouses/list']]) {
    const r = await get(path);
    check(r.status === 200 && Array.isArray(r.json && r.json.data), `${name}: ${((r.json && r.json.data) || []).length}`, `${name} HTTP ${r.status}`);
  }

  // 5) سلامة المحاسبة
  const ic = await get('/accounting/integrity-check');
  const idata = ic.json && ic.json.data;
  const issues = idata && (Array.isArray(idata.issues) ? idata.issues.length : idata.issues);
  check(ic.status === 200 && idata && idata.ok === true && (issues === 0 || issues === undefined),
    'integrity-check: ok، 0 مشكلة', `integrity-check: HTTP ${ic.status} ok=${idata && idata.ok} issues=${issues}`);

  console.log(`\nالخلاصة: ${fails} فشل، ${warns} تحذير`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('❌ استثناء:', e.message); process.exit(1); });
