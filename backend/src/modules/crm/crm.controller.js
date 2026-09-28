const asyncHandler = require('../../utils/asyncHandler');
const response = require('../../utils/response');
const service = require('./crm.service');
const { sendCsv } = require('../../utils/csv');
const { SEGMENT_LABELS } = require('./crm.calc');

const list = asyncHandler(async (req, res) => {
  const data = await service.listCustomers({ segment: req.query.segment, search: req.query.search });
  return response.success(res, data, 'عملاء CRM');
});

const exportCsv = asyncHandler(async (req, res) => {
  const data = await service.listCustomers({ segment: req.query.segment, search: req.query.search });
  const rows = data.customers.map((c) => ({ ...c, seg: c.segments.map((s) => SEGMENT_LABELS[s] || s).join(' / ') }));
  return sendCsv(res, `crm-${new Date().toISOString().slice(0, 10)}.csv`, rows, [
    { key: 'full_name', label: 'العميل' }, { key: 'phone', label: 'الهاتف' },
    { key: 'governorate', label: 'المحافظة' }, { key: 'seg', label: 'التصنيف' },
    { key: 'orders_count', label: 'عدد الطلبات' }, { key: 'total_amount', label: 'إجمالي المشتريات' },
    { key: 'avg_order', label: 'متوسط الطلب' }, { key: 'last_order_at', label: 'آخر طلب' },
    { key: 'days_since_last_order', label: 'أيام منذ آخر طلب' },
  ]);
});

module.exports = { list, exportCsv };
