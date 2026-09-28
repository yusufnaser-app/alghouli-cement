const test = require('node:test');
const assert = require('node:assert');
const { toCsv } = require('../src/utils/csv');
const { renderInvoiceHtml } = require('../src/modules/invoices/invoice-print');

test('CSV: يبدأ بـ BOM ويهرّب علامات الاقتباس والفواصل', () => {
  const out = toCsv([{ a: 'x,"y"', b: 5 }], [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }]);
  assert.ok(out.startsWith('\uFEFF'));
  assert.ok(out.includes('"x,""y"""'));
});

test('CSV: يمنع حقن الصيغ (= + - @)', () => {
  for (const evil of ['=1+1', '+SUM(A1)', '-2+3', '@cmd']) {
    const out = toCsv([{ a: evil }], [{ key: 'a', label: 'A' }]);
    assert.ok(out.includes(`'${evil}`), evil);
  }
});

test('CSV: الأرقام السالبة الحقيقية لا تُغيَّر', () => {
  const out = toCsv([{ a: -20 }], [{ key: 'a', label: 'A' }]);
  assert.ok(out.includes('\r\n-20'));
});

test('الفاتورة: تهرّب HTML ولا تسمح بحقن سكربت', () => {
  const html = renderInvoiceHtml({
    invoice_number: 'INV-1', customer_name: '<script>alert(1)</script>',
    items: [{ product_name: '<img src=x onerror=1>', quantity: 1, unit_price: 1, discount: 0, line_total: 1 }],
  });
  assert.ok(!html.includes('<script>alert'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;script&gt;'));
});
