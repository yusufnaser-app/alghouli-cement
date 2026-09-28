/**
 * تحويل مصفوفة صفوف إلى CSV يفتحه Excel مباشرة بالعربية (UTF-8 مع BOM).
 * columns: [{ key, label, format? }]
 * حماية من حقن الصيغ (CSV/Formula Injection): أي خلية نصية تبدأ بـ = + - @ يُسبق بها '
 */
const escapeCell = (value) => {
  if (value === null || value === undefined) return '';
  let s = value instanceof Date ? value.toISOString().replace('T', ' ').slice(0, 19) : String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
};

const toCsv = (rows, columns) => {
  const header = columns.map((c) => escapeCell(c.label)).join(',');
  const lines = rows.map((row) =>
    columns
      .map((c) => escapeCell(c.format ? c.format(row[c.key], row) : row[c.key]))
      .join(',')
  );
  return '\uFEFF' + [header, ...lines].join('\r\n');
};

const sendCsv = (res, filename, rows, columns) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(toCsv(rows, columns));
};

module.exports = { toCsv, sendCsv, escapeCell };
