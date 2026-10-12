'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { install, clearModules } = require('./helpers');
const OID = '11111111-1111-1111-1111-111111111111';
const mk = ({ viaOrderFax = null, viaDest = null, drv = null }) => async (sql) => {
  const s = sql.replace(/\s+/g, ' ');
  if (/FROM customer_ledger cl/.test(s)) return { rows: [{ id: 'e1', order_id: OID, transaction_type: 'actual_sale', debit: '1000', credit: '0', balance_after: '1000', currency: 'YER', description: 'بيع', reference_code: null, created_at: new Date(), entry_date: new Date(), seq: 1, source_type: null, source_id: null, reversal_of_id: null, reason: null, order_number: 'GHO-1' }] };
  if (/FROM customer_balances/.test(s)) return { rows: [] };
  if (/string_agg/.test(s)) return { rows: [{ id: OID, order_number: 'GHO-1', cement: 'عمران 42.5', ordered_bags: '50' }] };
  if (/FROM orders o\s+JOIN loading_faxes f ON f\.id = o\.fax_id/.test(s)) return { rows: viaOrderFax ? [viaOrderFax] : [] };
  if (/FROM delivery_destinations x/.test(s)) return { rows: viaDest ? [viaDest] : [] };
  if (/FROM driver_ledger dl/.test(s)) return { rows: drv ? [{ order_id: OID, driver_name: drv }] : [] };
  return { rows: [] };
};
const run = async (opts) => {
  install({ pool: {}, query: mk(opts) });
  clearModules('src/modules/accounting/accounting-statements.service.js', 'src/modules/accounting/accounting.engine.js');
  const svc = require('../src/modules/accounting/accounting-statements.service');
  const st = await svc.buildCustomerStatement({ id: 'c1', full_name: 'x', phone: '1' }, {});
  return st.sections[0].rows[0].details_text;
};
const FAX = { order_id: OID, fax_number: 'FX-9', loaded_quantity: '50', requested_quantity: '50', driver_name: 'هاشم', plate_number: 'ص1', factory_name: 'النهضة' };

test('G5-1) الفاكس عبر orders.fax_id يُعرض السائق والقاطرة', async () => {
  assert.match(await run({ viaOrderFax: FAX }), /السائق: هاشم · القاطرة: ص1/);
});
test('G5-2) الفاكس عبر وجهات الطلب (فاكس جماعي) يُعرض', async () => {
  assert.match(await run({ viaDest: FAX }), /الفاكس: FX-9/);
});
test('G5-3) بلا فاكس لكن بدفتر النقل: يظهر اسم السائق والأسمنت', async () => {
  const t = await run({ drv: 'علي' });
  assert.match(t, /السائق: علي/);
  assert.match(t, /الأسمنت: عمران 42\.5/);
});
test('G5-4) الفاكس يغلب دفتر النقل على اسم السائق', async () => {
  assert.match(await run({ viaOrderFax: FAX, drv: 'علي' }), /السائق: هاشم/);
});
