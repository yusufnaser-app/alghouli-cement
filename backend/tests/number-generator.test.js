'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { nextNumber, generateFaxNumber, generateOrderNumber, generateTripNumber, KINDS } = require('../src/utils/number-generator');

const YEAR = new Date().getFullYear();

// قاعدة وهمية تحاكي: READ COMMITTED (الإدراج يظهر للآخرين عند COMMIT فقط) + pg_advisory_xact_lock (يُحرَّر عند COMMIT/ROLLBACK)
const makeDb = (seed = {}) => {
  const committed = { loading_faxes: [], orders: [], deliveries: [], ...seed };
  const locks = new Map(); // key -> { owner, queue: [] }

  const acquire = (key, owner) => new Promise((resolve) => {
    const l = locks.get(key) || { owner: null, queue: [] };
    locks.set(key, l);
    if (l.owner === owner) return resolve();
    if (l.owner === null) { l.owner = owner; return resolve(); }
    l.queue.push({ owner, resolve });
  });
  const releaseAll = (owner) => {
    for (const l of locks.values()) {
      if (l.owner !== owner) continue;
      const nxt = l.queue.shift();
      if (nxt) { l.owner = nxt.owner; nxt.resolve(); } else l.owner = null;
    }
  };

  const connect = () => {
    const owner = Symbol('tx');
    let pending = [];
    const log = [];
    const client = {
      log,
      insert(table, col, value) { pending.push({ table, col, value }); },
      query: async (sql, params = []) => {
        const s = sql.replace(/\s+/g, ' ').trim();
        log.push(s.split(' ').slice(0, 3).join(' '));
        if (/^BEGIN/.test(s)) return { rows: [] };
        if (/^(COMMIT|ROLLBACK)/.test(s)) {
          if (/^COMMIT/.test(s)) for (const p of pending) committed[p.table].push({ [p.col]: p.value });
          pending = []; releaseAll(owner); return { rows: [] };
        }
        if (/pg_advisory_xact_lock\(hashtext\(\$1\)\)/.test(s)) { await acquire(params[0], owner); return { rows: [] }; }
        const m = s.match(/MAX\(CAST\(SUBSTRING\((\w+) FROM .*?FROM (\w+) WHERE/);
        if (m) {
          const [, col, table] = m;
          const like = params[0].replace('%', '');
          const nums = committed[table].map((r) => r[col]).filter((v) => typeof v === 'string' && v.startsWith(like))
            .map((v) => { const t = v.match(/[0-9]+$/); return t ? parseInt(t[0], 10) : null; }).filter((n) => n !== null);
          return { rows: [{ max_num: nums.length ? Math.max(...nums) : 0 }] };
        }
        throw new Error('unexpected sql: ' + s);
      },
    };
    return client;
  };
  return { committed, connect };
};

const tick = () => new Promise((r) => setImmediate(r));

test('1) رقم الفاكس الأول بالصيغة FX-YYYY-00001', async () => {
  const c = makeDb().connect();
  assert.strictEqual(await generateFaxNumber(c), `FX-${YEAR}-00001`);
});

test('2) الطلب GHO-…-000001 والرحلة TRP-…-000001', async () => {
  const db = makeDb();
  assert.strictEqual(await generateOrderNumber(db.connect()), `GHO-${YEAR}-000001`);
  assert.strictEqual(await generateTripNumber(db.connect()), `TRP-${YEAR}-000001`);
});

test('3) MAX لا COUNT: مع فجوة (1،2،5) الناتج 6 وليس 4', async () => {
  const db = makeDb({ loading_faxes: [1, 2, 5].map((n) => ({ fax_number: `FX-${YEAR}-0000${n}` })) });
  assert.strictEqual(await generateFaxNumber(db.connect()), `FX-${YEAR}-00006`);
});

test('4) يتجاهل أرقام سنوات أخرى وبادئات أخرى', async () => {
  const db = makeDb({ loading_faxes: [{ fax_number: `FX-${YEAR - 1}-00099` }, { fax_number: `ZZ-${YEAR}-00050` }, { fax_number: `FX-${YEAR}-00003` }] });
  assert.strictEqual(await generateFaxNumber(db.connect()), `FX-${YEAR}-00004`);
});

test('5) يتجاهل NULL والقيم غير الرقمية الذيل', async () => {
  const db = makeDb({ loading_faxes: [{ fax_number: null }, { fax_number: `FX-${YEAR}-abc` }, { fax_number: `FX-${YEAR}-00002` }] });
  assert.strictEqual(await generateFaxNumber(db.connect()), `FX-${YEAR}-00003`);
});

test('6) يرفض Pool (totalCount) ويرفض client فارغًا', async () => {
  await assert.rejects(() => generateFaxNumber({ query: async () => ({ rows: [] }), totalCount: 0 }), /client المعاملة/);
  await assert.rejects(() => generateFaxNumber(null), /client/);
  await assert.rejects(() => generateFaxNumber({}), /client/);
});

test('7) يأخذ القفل الاستشاري قبل قراءة MAX', async () => {
  const c = makeDb().connect();
  await generateFaxNumber(c);
  assert.strictEqual(c.log.length, 2);
  assert.match(c.log[0], /pg_advisory_xact_lock/);
  assert.match(c.log[1], /COALESCE\(MAX/);
});

test('8) تغيّر السنة: 2027 يبدأ من 00001 حتى مع وجود أرقام 2026', async () => {
  const db = makeDb({ loading_faxes: [{ fax_number: `FX-2026-00040` }] });
  assert.strictEqual(await nextNumber(db.connect(), KINDS.fax, 2027), 'FX-2027-00001');
});

test('9) 100 معاملة متوازية → 100 رقم فريد متسلسل (فاكس)', async () => {
  const db = makeDb();
  const run = async () => {
    const c = db.connect();
    await c.query('BEGIN');
    const num = await generateFaxNumber(c);
    await tick(); await tick();            // نافذة السباق: قراءة MAX ثم تأخير قبل الإدراج
    c.insert('loading_faxes', 'fax_number', num);
    await c.query('COMMIT');
    return num;
  };
  const nums = await Promise.all(Array.from({ length: 100 }, run));
  assert.strictEqual(new Set(nums).size, 100);
  assert.strictEqual(db.committed.loading_faxes.length, 100);
  assert.strictEqual([...nums].sort().at(-1), `FX-${YEAR}-00100`);
});

test('10) الشاهد: بلا قفل نفس السيناريو يُنتج تكرارًا (يثبت أن الاختبار 9 له أسنان)', async () => {
  const db = makeDb();
  const run = async () => {
    const c = db.connect();
    await c.query('BEGIN');
    const r = await c.query(`SELECT COALESCE(MAX(CAST(SUBSTRING(fax_number FROM '[0-9]+$') AS INTEGER)), 0) AS max_num FROM loading_faxes WHERE fax_number IS NOT NULL AND fax_number LIKE $1`, [`FX-${YEAR}-%`]);
    const num = `FX-${YEAR}-${String(r.rows[0].max_num + 1).padStart(5, '0')}`;
    await tick(); await tick();
    c.insert('loading_faxes', 'fax_number', num);
    await c.query('COMMIT');
    return num;
  };
  const nums = await Promise.all(Array.from({ length: 20 }, run));
  assert.ok(new Set(nums).size < 20, 'كان يجب أن يظهر تكرار بلا قفل');
});

test('11) 100 طلب و100 رحلة متوازية → فريدة', async () => {
  for (const [gen, table, col] of [[generateOrderNumber, 'orders', 'order_number'], [generateTripNumber, 'deliveries', 'trip_number']]) {
    const db = makeDb();
    const nums = await Promise.all(Array.from({ length: 100 }, async () => {
      const c = db.connect(); await c.query('BEGIN');
      const n = await gen(c); await tick(); c.insert(table, col, n); await c.query('COMMIT'); return n;
    }));
    assert.strictEqual(new Set(nums).size, 100, col);
  }
});

test('12) ROLLBACK يحرّر القفل ويُعاد استخدام الرقم', async () => {
  const db = makeDb();
  const a = db.connect(); await a.query('BEGIN');
  const n1 = await generateFaxNumber(a);
  const b = db.connect(); await b.query('BEGIN');
  const pb = generateFaxNumber(b);           // ينتظر قفل a
  await tick(); await tick();
  await a.query('ROLLBACK');                  // a لم يُدرج شيئًا
  assert.strictEqual(await pb, n1);
  await b.query('ROLLBACK');
});

test('13) فئات مختلفة لا تحجب بعضها (قفل مستقل لكل فئة)', async () => {
  const db = makeDb();
  const a = db.connect(); await a.query('BEGIN'); await generateFaxNumber(a);
  const b = db.connect(); await b.query('BEGIN');
  const n = await Promise.race([generateOrderNumber(b), new Promise((r) => setTimeout(() => r('BLOCKED'), 200))]);
  assert.strictEqual(n, `GHO-${YEAR}-000001`);
  await a.query('ROLLBACK'); await b.query('ROLLBACK');
});

test('14) حارس انحدار: لا مولّدات محلية ولا COUNT لأرقام الفاكس/الطلب/الرحلة في src', () => {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const files = walk(path.join(__dirname, '../src')).filter((f) => f.endsWith('.js') && !f.endsWith('number-generator.js'));
  for (const f of files) {
    const s = fs.readFileSync(f, 'utf8');
    assert.ok(!/const generate(Fax|Order|Trip)Number\s*=\s*async/.test(s), `مولّد محلي في ${f}`);
    assert.ok(!/SELECT COUNT\(\*\) FROM orders WHERE order_number LIKE/.test(s), `COUNT للطلبات في ${f}`);
    assert.ok(!/SELECT COUNT\(\*\) FROM deliveries WHERE trip_number LIKE/.test(s), `COUNT للرحلات في ${f}`);
    assert.ok(!/SELECT COUNT\(\*\) FROM loading_faxes\s+WHERE fax_number/.test(s), `COUNT للفاكسات في ${f}`);
    assert.ok(!/generate(Fax|Order|Trip)Number\(\)/.test(s), `استدعاء بلا client في ${f}`);
  }
});

test('15) deliveries.assign (بعد B): الفاكس يُنشأ عبر order-fax.js — أعمدة INSERT = VALUES وfax_number مرتبط بقيمته', () => {
  const svc = fs.readFileSync(path.join(__dirname, '../src/modules/deliveries/deliveries.service.js'), 'utf8');
  assert.ok(/createOrderFax\(client,/.test(svc) && !/INSERT INTO loading_faxes/.test(svc));
  const s = fs.readFileSync(path.join(__dirname, '../src/modules/faxes/order-fax.js'), 'utf8');
  const m = s.match(/INSERT INTO loading_faxes\s*\(([\s\S]*?)\)\s*VALUES \(([\s\S]*?)\)\s*RETURNING id/);
  assert.ok(m, 'لم يوجد INSERT');
  const cols = m[1].split(',').map((x) => x.trim()).filter(Boolean);
  const vals = m[2].replace(/NOW\(\)/g, 'NOW').split(',').map((x) => x.trim()).filter(Boolean);
  assert.strictEqual(cols.length, vals.length);
  assert.strictEqual(vals[cols.indexOf('fax_number')], '$13');
});
