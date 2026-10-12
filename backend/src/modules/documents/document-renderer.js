'use strict';
/**
 * مصيّر المستندات الموحّد (F3): نموذج بيانات → HTML عربي RTL بحجم A4 جاهز للطباعة/PDF.
 * لا يلمس DB. كل نص يُهرَّب. الأرقام المالية نصوص عشرية (بلا float).
 *
 * قاعدة مالية: لا يُسمّى مستند «فاتورة» إلا إن وُجد accountingReference (مرجع رسمي من YemenSoft).
 * وإلا يُرمى INVOICE_TITLE_REQUIRES_ACCOUNTING_REFERENCE (حماية من فاتورة وهمية).
 *
 * نموذج المستند:
 *  { type, title, docNumber, issuedAt, issuedBy, subtitle?, accountingReference?,
 *    meta?: [[label, value]], blocks?: [kv | table | note], signatures?: [label], company?: {name, phone} }
 *  kv:    { kind:'kv', title?, rows:[[label, value]] }
 *  table: { kind:'table', title?, columns:[{key,label,fmt?,align?}], rows:[{...}], totals?:[[label,value]], emptyText? }
 *         fmt: money | qty | date | datetime | text (الافتراضي)
 *  note:  { kind:'note', text, tone?: 'warn' }
 */
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const CURRENCY_AR = { YER: 'ريال يمني', USD: 'دولار أمريكي', SAR: 'ريال سعودي' };

const isNum = (s) => /^-?\d+(\.\d+)?$/.test(s);
const fmtMoney = (v) => {
  if (v === null || v === undefined || v === '') return '';
  const s = String(v).trim();
  if (!isNum(s)) return esc(s);
  const neg = s.startsWith('-');
  const [i, f = ''] = s.replace('-', '').split('.');
  return `${neg ? '-' : ''}${i.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${(f + '00').slice(0, 2)}`;
};
const fmtQty = (v) => {
  if (v === null || v === undefined || v === '') return '';
  const s = String(v).trim();
  if (!isNum(s)) return esc(s);
  return s.includes('.') ? s.replace(/\.?0+$/, '') || '0' : s;
};
// التوقيت المحلي لليمن (UTC+3) ثابتًا، بلا اعتماد على منطقة الخادم
const toLocal = (d) => {
  if (!d) return null;
  const t = new Date(d);
  if (Number.isNaN(t.getTime())) return null;
  return new Date(t.getTime() + 3 * 3600 * 1000).toISOString();
};
const fmtDate = (d) => { const l = toLocal(d); return l ? l.slice(0, 10) : ''; };
const fmtDateTime = (d) => { const l = toLocal(d); return l ? `${l.slice(0, 10)} ${l.slice(11, 16)}` : ''; };

const FORMATTERS = { money: fmtMoney, qty: fmtQty, date: fmtDate, datetime: fmtDateTime };
const cell = (col, row) => {
  const raw = row[col.key];
  const f = FORMATTERS[col.fmt];
  return f ? f(raw) : esc(raw);
};

// الشعار مضمَّن في الوحدة (logo-data.js) — لا قراءة ملفات ولا روابط خارجية.
const logoDataUri = () => require('./logo-data');

const renderTable = (b) => {
  const cols = b.columns;
  const head = cols.map((c) => `<th>${esc(c.label)}</th>`).join('');
  const body = b.rows.length
    ? b.rows.map((r) => `<tr${r._class ? ` class="${esc(r._class)}"` : ''}>${cols.map((c) => `<td class="${c.align || (c.fmt === 'money' || c.fmt === 'qty' ? 'num' : '')}">${cell(c, r)}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${cols.length}" class="empty">${esc(b.emptyText || 'لا توجد بيانات')}</td></tr>`;
  const totals = (b.totals || []).length
    ? `<div class="tot">${b.totals.map(([l, v], i, a) => `<div class="${i === a.length - 1 ? 'grand' : ''}"><span>${esc(l)}</span><span>${v === null || v === undefined ? '' : (typeof v === 'object' ? esc(v.text) : fmtMoney(v))}</span></div>`).join('')}</div>`
    : '';
  return `${b.title ? `<h3>${esc(b.title)}</h3>` : ''}<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>${totals}`;
};

const renderBlock = (b) => {
  if (b.kind === 'table') return renderTable(b);
  if (b.kind === 'kv') {
    return `${b.title ? `<h3>${esc(b.title)}</h3>` : ''}<div class="kv">${b.rows.map(([l, v]) => `<div><b>${esc(l)}:</b> ${esc(v)}</div>`).join('')}</div>`;
  }
  if (b.kind === 'note') return `<div class="note ${b.tone === 'warn' ? 'warn' : ''}">${esc(b.text)}</div>`;
  return '';
};

const REQUIRED = ['type', 'title', 'docNumber', 'issuedAt', 'issuedBy'];

const renderDocument = (doc, { embed = false } = {}) => {
  for (const k of REQUIRED) {
    if (doc[k] === undefined || doc[k] === null || doc[k] === '') throw new Error(`مستند ناقص: ${k}`);
  }
  if (/فاتورة/.test(doc.title) && !doc.accountingReference) {
    const e = new Error('لا يُسمّى المستند «فاتورة» بلا مرجع رسمي من النظام المحاسبي (YemenSoft)');
    e.code = 'INVOICE_TITLE_REQUIRES_ACCOUNTING_REFERENCE';
    e.status = 409;
    throw e;
  }
  const company = doc.company || {};
  const name = company.name || 'مؤسسة الغولي';
  const phone = company.phone || '';
  const logo = logoDataUri();
  const meta = (doc.meta || []).filter(([, v]) => v !== null && v !== undefined && v !== '');
  const issued = fmtDateTime(doc.issuedAt);

  const refBox = doc.accountingReference
    ? `<div class="ref"><b>المرجع المحاسبي (YemenSoft):</b> ${esc(doc.accountingReference)}</div>` : '';
  const sigs = (doc.signatures || []).length
    ? `<div class="sigs">${doc.signatures.map((s) => `<div><div class="line"></div>${esc(s)}</div>`).join('')}</div>` : '';

  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(doc.title)} ${esc(doc.docNumber)}</title>
<style>
 @page{size:A4;margin:14mm 12mm 16mm;@bottom-center{content:"صفحة " counter(page) " من " counter(pages);font:10px Tahoma,Arial,sans-serif;color:#555}}
 *{box-sizing:border-box}
 body{font-family:Tahoma,Arial,"Noto Naskh Arabic",sans-serif;margin:0;padding:18px;color:#1b1b1b;background:#fff;font-size:13px;line-height:1.5}
 .head{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #1A3A5C;padding-bottom:10px;margin-bottom:12px;gap:12px}
 .brand{display:flex;align-items:center;gap:10px}
 .logo{width:62px;height:62px;border-radius:50%;object-fit:cover}
 .mono{width:62px;height:62px;border-radius:50%;background:#1A3A5C;color:#fff;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:bold}
 .brand h1{margin:0;font-size:19px;color:#1A3A5C}.brand .s{font-size:11px;color:#666}
 .titlebox{text-align:left}.titlebox h2{margin:0;font-size:20px;color:#1A3A5C}.titlebox .n{font-size:13px;font-weight:bold}.titlebox .d{font-size:11px;color:#666}
 .meta{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;margin-bottom:10px}
 .ref{border:2px solid #1b5e20;background:#f1f8f1;padding:6px 10px;margin:8px 0;font-size:13px}
 h3{margin:14px 0 6px;font-size:14px;color:#1A3A5C;border-right:4px solid #1A3A5C;padding-right:8px}
 .kv{display:grid;grid-template-columns:1fr 1fr;gap:3px 24px;margin-bottom:8px}
 table{width:100%;border-collapse:collapse;font-size:12px;margin:4px 0 8px}
 thead{display:table-header-group}tr{page-break-inside:avoid}
 th{background:#1A3A5C;color:#fff;padding:6px 5px;text-align:center}
 td{border:1px solid #ccc;padding:5px;text-align:right;vertical-align:top}td.num{text-align:left;direction:ltr;white-space:nowrap}td.center{text-align:center}
 td.empty{text-align:center;color:#777}
 tr.open td,tr.close td{font-weight:bold;background:#f3f3f3}tr.sum td{font-weight:bold;background:#eef3f8}tr.rev td{color:#a00}
 .tot{margin:8px 0 8px auto;width:300px}.tot div{display:flex;justify-content:space-between;padding:3px 0}
 .tot .grand{font-weight:bold;font-size:14px;border-top:2px solid #1A3A5C;margin-top:3px;padding-top:6px}
 .note{margin:10px 0;font-size:11px;color:#555;border:1px dashed #bbb;padding:6px 8px}.note.warn{color:#8a4b00;border-color:#d9a441;background:#fff8e6}
 .sigs{display:flex;justify-content:space-around;margin-top:46px;gap:16px}.sigs>div{text-align:center;width:30%;font-size:12px}.sigs .line{border-top:1px solid #333;margin-bottom:4px}
 .foot{margin-top:18px;border-top:1px solid #ccc;padding-top:6px;font-size:10px;color:#666;display:flex;justify-content:space-between;gap:8px}
 .btn{position:fixed;top:10px;left:10px;padding:8px 14px;background:#1A3A5C;color:#fff;border:0;border-radius:6px;cursor:pointer;font-family:inherit}
 @media print{.btn{display:none}body{padding:0}}
</style></head><body>
${embed ? '' : '<button class="btn" onclick="window.print()">🖨 طباعة / حفظ PDF</button>'}
<div class="head">
 <div class="brand">${logo ? `<img class="logo" src="${logo}" alt="">` : '<div class="mono">غ</div>'}
  <div><h1>${esc(name)}</h1><div class="s">لتجارة وتسويق الأسمنت</div>${phone ? `<div class="s">للتواصل: ${esc(phone)}</div>` : ''}</div></div>
 <div class="titlebox"><h2>${esc(doc.title)}</h2><div class="n">${esc(doc.docNumber)}</div><div class="d">${esc(issued)}</div></div>
</div>
${doc.subtitle ? `<div class="note">${esc(doc.subtitle)}</div>` : ''}
${meta.length ? `<div class="meta">${meta.map(([l, v]) => `<div><b>${esc(l)}:</b> ${esc(v)}</div>`).join('')}</div>` : ''}
${refBox}
${(doc.blocks || []).map(renderBlock).join('\n')}
${sigs}
<div class="foot"><span>أصدره: ${esc(doc.issuedBy)}</span><span>${esc(doc.docNumber)}</span><span>${esc(issued)}</span></div>
${embed ? '' : `<script>window.addEventListener('load',function(){if(location.search.indexOf('autoprint=1')>-1)window.print()})</script>`}
</body></html>`;
};

module.exports = { renderDocument, esc, fmtMoney, fmtQty, fmtDate, fmtDateTime, CURRENCY_AR };
