const { z } = require('zod');
const asyncHandler = require('../../utils/asyncHandler');
const response = require('../../utils/response');
const service = require('./orders.service');

const createSchema = z.object({
  addressId: z.string().uuid(),
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().positive(),
  })).min(1),
  notes: z.string().max(500).optional(),
});

const create = asyncHandler(async (req, res) => {
  const data = createSchema.parse(req.body);
  const order = await service.createOrder(req.user.id, data);
  return response.created(res, order, 'تم إنشاء الطلب بنجاح');
});

const list = asyncHandler(async (req, res) => {
  const orders = await service.getMyOrders(req.user.id);
  return response.success(res, orders, 'قائمة طلباتي');
});

const getById = asyncHandler(async (req, res) => {
  const isAdmin = req.roles.includes('admin');
  const order = await service.getOrderById(req.params.id, req.user.id, isAdmin);
  if (!order) return response.error(res, 'الطلب غير موجود', 404, 'NOT_FOUND');
  return response.success(res, order);
});

const cancel = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const result = await service.cancelOrder(req.params.id, req.user.id, reason);
  return response.success(res, result, 'تم إلغاء الطلب');
});

module.exports = { create, list, getById, cancel };
