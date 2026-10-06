'use strict';
/**
 * توليد الأرقام المتسلسلة (فاكس / طلب / رحلة) بأمان تحت التزامن.
 *
 * الآلية: pg_advisory_xact_lock(hashtext(مفتاح)) ثم MAX(التسلسل)+1.
 *  - القفل على مستوى المعاملة: يُحرَّر تلقائيًا عند COMMIT/ROLLBACK، فتتسلسل المعاملات المتزامنة
 *    التي تولّد من الفئة نفسها، وكل معاملة ترى آخر رقم مُثبَّت قبلها.
 *  - يجب استدعاؤها بـ client داخل BEGIN. خارج معاملة يُحرَّر القفل فور انتهاء الاستعلام فلا حماية.
 *    لذلك نرفض Pool صراحةً (pool.query لا يضمن اتصالًا واحدًا ولا معاملة).
 *  - ترتيب الأقفال (لتجنّب deadlock عند أخذ أكثر من قفل في معاملة واحدة): trip → fax → order.
 *  - القفل يبقى حتى نهاية المعاملة، فولّد الرقم متأخرًا قدر الإمكان (بعد التحققات، قبل INSERT).
 */

const KINDS = {
  fax:   { lockKey: 'fax-number-lock',   table: 'loading_faxes', column: 'fax_number',   prefix: 'FX',  pad: 5 },
  order: { lockKey: 'order-number-lock', table: 'orders',        column: 'order_number', prefix: 'GHO', pad: 6 },
  trip:  { lockKey: 'trip-number-lock',  table: 'deliveries',    column: 'trip_number',  prefix: 'TRP', pad: 6 },
};

const IDENT = /^[a-z_][a-z0-9_]*$/;

const assertClient = (client) => {
  if (!client || typeof client.query !== 'function') {
    throw new Error('number-generator: يلزم client داخل معاملة (BEGIN)');
  }
  // pg.Pool يملك totalCount؛ PoolClient لا يملكه
  if (typeof client.totalCount === 'number') {
    throw new Error('number-generator: مرّر client المعاملة وليس pool');
  }
};

/**
 * يولّد الرقم التالي لفئة معرّفة. مُصدَّرة للاختبارات (جدول تجريبي) — الإنتاج يستخدم الدوال الثلاث أدناه.
 */
const nextNumber = async (client, cfg, year = new Date().getFullYear()) => {
  assertClient(client);
  if (!IDENT.test(cfg.table) || !IDENT.test(cfg.column)) throw new Error('number-generator: اسم جدول/عمود غير صالح');

  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [cfg.lockKey]);

  const r = await client.query(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(${cfg.column} FROM '[0-9]+$') AS INTEGER)), 0) AS max_num
     FROM ${cfg.table}
     WHERE ${cfg.column} IS NOT NULL
       AND ${cfg.column} LIKE $1`,
    [`${cfg.prefix}-${year}-%`]
  );
  const next = (parseInt(r.rows[0].max_num, 10) || 0) + 1;
  return `${cfg.prefix}-${year}-${String(next).padStart(cfg.pad, '0')}`;
};

const generateFaxNumber   = (client) => nextNumber(client, KINDS.fax);
const generateOrderNumber = (client) => nextNumber(client, KINDS.order);
const generateTripNumber  = (client) => nextNumber(client, KINDS.trip);

module.exports = { generateFaxNumber, generateOrderNumber, generateTripNumber, nextNumber, KINDS };
