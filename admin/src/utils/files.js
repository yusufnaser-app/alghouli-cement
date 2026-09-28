import client from '../api/client';

// تنزيل ملف (CSV/Excel) من الـ API مع رأس التوثيق
export async function downloadFile(url, filename, params = {}) {
  const res = await client.get(url, { params, responseType: 'blob' });
  const href = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 5000);
}

// فتح فاتورة/مستند HTML للطباعة أو الحفظ PDF (نافذة تُفتح فورًا لتفادي حظر النوافذ المنبثقة)
export async function openPrintable(url) {
  const w = window.open('', '_blank');
  if (!w) throw new Error('المتصفح منع فتح النافذة، اسمح بالنوافذ المنبثقة');
  try {
    const res = await client.get(url, { responseType: 'text', transformResponse: (d) => d });
    w.document.open();
    w.document.write(res.data);
    w.document.close();
  } catch (e) {
    w.close();
    throw e;
  }
}
