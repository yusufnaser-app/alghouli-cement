const { z } = require('zod');
const asyncHandler = require('../../utils/asyncHandler');
const response = require('../../utils/response');
const service = require('./orders.service');
const transportService = require('./transport.service');

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
  paymentTerms: z.enum(['cash', 'credit', 'partial']).optional(),
  paidAmountNow: z.number().min(0).optional(),
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

const listPendingCredit = asyncHandler(async (req, res) => {
  const orders = await service.listPendingCreditOrders();
  return response.success(res, orders, 'طلبات بانتظار الموافقة');
});

const approveCredit = asyncHandler(async (req, res) => {
  const result = await service.approveCreditOrder(req.params.id, req.user.id);
  return response.success(res, result, 'تمت الموافقة');
});

const rejectCredit = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  if (!reason) return response.error(res, 'سبب الرفض مطلوب', 400);
  const result = await service.rejectCreditOrder(req.params.id, req.user.id, reason);
  return response.success(res, result, 'تم الرفض');
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

// === أسعار النقل العامة ===

const listTransportRates = asyncHandler(async (req, res) => {
  const rates = await transportService.listRates();
  return response.success(res, rates);
});

const createTransportRate = asyncHandler(async (req, res) => {
  const rate = await transportService.createRate(req.body);
  return response.created(res, rate, 'تم إضافة سعر النقل');
});

const updateTransportRate = asyncHandler(async (req, res) => {
  const rate = await transportService.updateRate(req.params.id, req.body);
  if (!rate) return response.error(res, 'غير موجود', 404);
  return response.success(res, rate, 'تم التحديث');
});

const removeTransportRate = asyncHandler(async (req, res) => {
  const ok = await transportService.removeRate(req.params.id);
  if (!ok) return response.error(res, 'غير موجود', 404);
  return response.success(res, null, 'تم الحذف');
});

// === أسعار خاصة للعميل ===

const listCustomerTransportRates = asyncHandler(async (req, res) => {
  const rates = await transportService.listCustomerTransportRates(req.params.customerId);
  return response.success(res, rates);
});

const createCustomerTransportRate = asyncHandler(async (req, res) => {
  const rate = await transportService.createCustomerTransportRate(req.params.customerId, req.body);
  return response.created(res, rate, 'تم إضافة سعر خاص');
});

const removeCustomerTransportRate = asyncHandler(async (req, res) => {
  const ok = await transportService.removeCustomerTransportRate(req.params.id, req.params.customerId);
  if (!ok) return response.error(res, 'غير موجود', 404);
  return response.success(res, null, 'تم الحذف');
});

const listCustomerProductPrices = asyncHandler(async (req, res) => {
  const prices = await transportService.listCustomerProductPrices(req.params.customerId);
  return response.success(res, prices);
});

const createCustomerProductPrice = asyncHandler(async (req, res) => {
  const price = await transportService.createCustomerProductPrice(req.params.customerId, req.body);
  return response.created(res, price, 'تم إضافة السعر الخاص');
});

const removeCustomerProductPrice = asyncHandler(async (req, res) => {
  const ok = await transportService.removeCustomerProductPrice(req.params.id, req.params.customerId);
  if (!ok) return response.error(res, 'غير موجود', 404);
  return response.success(res, null, 'تم الحذف');
});

module.exports = {
  create, list, getById, cancel,
  listPendingCredit, approveCredit, rejectCredit, checkCredit,
  listTransportRates, createTransportRate, updateTransportRate, removeTransportRate,
  listCustomerTransportRates, createCustomerTransportRate, removeCustomerTransportRate,
  listCustomerProductPrices, createCustomerProductPrice, removeCustomerProductPrice,
};
