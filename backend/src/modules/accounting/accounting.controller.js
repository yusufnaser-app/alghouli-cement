const asyncHandler = require('../../utils/asyncHandler');
const response = require('../../utils/response');
const service = require('./accounting-integration.service');

const listQueue = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const rows = await service.listQueue(status || null);
  return response.success(res, rows, 'طابور المزامنة المحاسبية');
});

const retry = asyncHandler(async (req, res) => {
  const result = await service.retryItem(req.params.id);
  if (!result.success) {
    return response.error(res, `فشلت إعادة المحاولة: ${result.error}`, 400);
  }
  return response.success(res, result, 'تمت إعادة المزامنة بنجاح');
});

const status = asyncHandler(async (req, res) => {
  const adapter = service.getAdapter();
  const configured = await adapter.isConfigured();
  return response.success(res, {
    configured,
    note: configured
      ? 'الربط مع YemenSoft مُهيَّأ.'
      : 'لا يوجد ربط فعلي مُهيَّأ حاليًا مع YemenSoft — العمليات المالية تبقى في الطابور (PENDING) إلى حين تحديد طريقة الربط الفعلية.',
  }, 'حالة التكامل المحاسبي');
});

module.exports = { listQueue, retry, status };
