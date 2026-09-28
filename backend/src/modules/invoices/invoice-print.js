// يبني صفحة HTML للفاتورة (RTL) جاهزة للطباعة أو الحفظ كـ PDF من المتصفح (Ctrl+P / مشاركة)
const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => (parseFloat(n) || 0).toLocaleString('en-US');

const renderInvoiceHtml = (inv) => {
  const rows = (inv.items || [])
    .map(
      (it, i) => `<tr><td>${i + 1}</td><td>${esc(it.product_name)}</td><td>${money(it.quantity)}</td>
      <td>${money(it.unit_price)}</td><td>${money(it.discount)}</td><td>${money(it.line_total)}</td></tr>`
    )
    .join('');
  const address = [inv.governorate, inv.area, inv.address_text].filter(Boolean).map(esc).join(' — ') || 'استلام ذاتي / غير محدد';
  const date = inv.issued_at ? new Date(inv.issued_at).toLocaleDateString('en-GB') : '';
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>فاتورة ${esc(inv.invoice_number)}</title>
<style>
 body{font-family:Tahoma,Arial,sans-serif;margin:0;padding:24px;color:#222;background:#fff}
 .head{display:flex;justify-content:space-between;border-bottom:3px solid #1A3A5C;padding-bottom:12px;margin-bottom:16px}
 h1{margin:0;color:#1A3A5C;font-size:22px} .sub{color:#666;font-size:12px}
 .meta{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;font-size:14px;margin-bottom:16px}
 table{width:100%;border-collapse:collapse;font-size:13px}
 th{background:#1A3A5C;color:#fff;padding:8px} td{border:1px solid #ddd;padding:8px;text-align:center}
 .tot{margin-top:16px;margin-right:auto;width:280px;font-size:14px}
 .tot div{display:flex;justify-content:space-between;padding:4px 0}
 .grand{font-weight:bold;font-size:16px;border-top:2px solid #1A3A5C;margin-top:4px;padding-top:8px!important}
 .note{margin-top:24px;font-size:11px;color:#777;text-align:center}
 .btn{position:fixed;top:12px;left:12px;padding:8px 16px;background:#1A3A5C;color:#fff;border:0;border-radius:6px;cursor:pointer}
 @media print{.btn{display:none}body{padding:0}}
</style></head><body>
<button class="btn" onclick="window.print()">🖨 طباعة / حفظ PDF</button>
<div class="head"><div><h1>مؤسسة الغولي</h1><div class="sub">للتجارة العامة وتسويق الأسمنت</div>
<div class="sub">للتواصل: 777757166 - 01385534</div></div>
<div style="text-align:left"><h1>فاتورة</h1><div class="sub">${esc(inv.invoice_number)}</div><div class="sub">${esc(date)}</div></div></div>
<div class="meta"><div><b>العميل:</b> ${esc(inv.customer_name)}</div><div><b>الهاتف:</b> ${esc(inv.customer_phone)}</div>
<div><b>رقم الطلب:</b> ${esc(inv.order_number)}</div><div><b>العنوان:</b> ${address}</div></div>
<table><thead><tr><th>#</th><th>المنتج</th><th>الكمية</th><th>السعر</th><th>الخصم</th><th>الإجمالي</th></tr></thead>
<tbody>${rows}</tbody></table>
<div class="tot">
 <div><span>المجموع الفرعي</span><span>${money(inv.subtotal)}</span></div>
 <div><span>الخصم</span><span>${money(inv.discount_amount)}</span></div>
 <div><span>النقل</span><span>${money(inv.shipping_amount)}</span></div>
 <div class="grand"><span>الإجمالي (ريال)</span><span>${money(inv.total_amount)}</span></div>
 <div><span>المدفوع</span><span>${money(inv.paid_amount)}</span></div>
 <div><span>المتبقي</span><span>${money(inv.remaining_amount)}</span></div></div>
<div class="note">هذه فاتورة تشغيلية صادرة من نظام مؤسسة الغولي. الرصيد المحاسبي الرسمي مرجعه النظام المحاسبي المعتمد.</div>
</body></html>`;
};

module.exports = { renderInvoiceHtml };
