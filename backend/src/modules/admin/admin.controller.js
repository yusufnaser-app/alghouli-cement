const asyncHandler = require('../../utils/asyncHandler');
const response = require('../../utils/response');
const service = require('./admin.service');

const dashboard = asyncHandler(async (req, res) => {
  return response.success(res, await service.dashboard(), 'لوحة المعلومات');
});

const listOrders = asyncHandler(async (req, res) => {
  return response.success(res, await service.listOrders(req.query), 'الطلبات');
});

const listCustomers = asyncHandler(async (req, res) => {
  return response.success(res, await service.listCustomers(), 'العملاء');
});

const updateOrderStatus = asyncHandler(async (req, res) => {
  const { status, reason } = req.body;
  const result = await service.updateOrderStatus(req.params.id, status, req.user.id, reason);
  if (!result) return response.error(res, 'الطلب غير موجود', 404);
  return response.success(res, result, 'تم التحديث');
});

module.exports = { dashboard, listOrders, listCustomers, updateOrderStatus };
