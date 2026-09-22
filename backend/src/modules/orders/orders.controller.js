const { z } = require('zod');
const asyncHandler = require('../../utils/asyncHandler');
const response = require('../../utils/response');
const service = require('./orders.service');

const createSchema = z.object({
  deliveryType: z.enum(['alghouli_delivery', 'trader_pickup']),
  addressId: z.string().uuid().optional(),
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().positive(),
  })).min(1),
  notes: z.string().max(500).optional(),
  traderTruckPlate: z.string().max(30).optional(),
  traderDriverName: z.string().max(150).optional(),
  traderDriverPhone: z.string().max(20).optional(),
  paymentTerms: z.enum(['cash', 'credit']).optional(),
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
  const isAdmin = req.roles.includes('admin') || req.roles.includes('sales');
  const order = await service.getOrderById(req.params.id, req.user.id, isAdmin);
  if (!order) return response.error(res, 'الطلب غير موجود', 404);
  return response.success(res, order);
});

const cancel = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const result = await service.cancelOrder(req.params.id, req.user.id, reason);
  return response.success(res, result, 'تم إلغاء الطلب');
});

// === Admin endpoints ===

const listPendingCredit = asyncHandler(async (req, res) => {
  const orders = await service.listPendingCreditOrders();
  return response.success(res, orders, 'طلبات بانتظار الموافقة');
});

const approveCredit = asyncHandler(async (req, res) => {
  const result = await service.approveCreditOrder(req.params.id, req.user.id);
  return response.success(res, result, 'تمت الموافقة على الطلب');
});

const rejectCredit = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  if (!reason) return response.error(res, 'سبب الرفض مطلوب', 400);
  const result = await service.rejectCreditOrder(req.params.id, req.user.id, reason);
  return response.success(res, result, 'تم رفض الطلب');
});

const checkCredit = asyncHandler(async (req, res) => {
  const { query } = require('../../config/db');
  const { amount } = req.query;
  const c = await query(`SELECT id FROM customers WHERE user_id = $1`, [req.user.id]);
  if (c.rows.length === 0) return response.error(res, 'العميل غير موجود', 404);

  const result = await service.checkCreditAvailability(
    { query },
    c.rows[0].id,
    parseFloat(amount || '0')
  );
  return response.success(res, result, 'حالة الائتمان');
});

module.exports = {
  create, list, getById, cancel,
  listPendingCredit, approveCredit, rejectCredit, checkCredit,
};
