const asyncHandler = require('../../utils/asyncHandler');
const response = require('../../utils/response');
const service = require('./admin.service');
const { z } = require('zod');
const { requestContext } = require('../audit/audit.service');

const creditSchema = z.object({
  creditLimit: z.number().min(0).max(1e12),
  reason: z.string().trim().min(3, 'اكتب سببًا من 3 أحرف على الأقل').max(500),
});

const setCreditLimit = asyncHandler(async (req, res) => {
  const b = creditSchema.parse(req.body);
  const r = await service.setCustomerCreditLimit(req.params.customerId, b.creditLimit, req.user.id, { reason: b.reason, ...requestContext(req) });
  return response.success(res, r, 'تم تحديث حد الائتمان');
});

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
  const result = await service.updateOrderStatus(req.params.id, status, req.user.id, reason, require('../audit/audit.service').requestContext(req));
  if (!result) return response.error(res, 'الطلب غير موجود', 404);
  return response.success(res, result, 'تم التحديث');
});

module.exports = { dashboard, listOrders, listCustomers, updateOrderStatus, setCreditLimit };
