const { z } = require('zod');
const asyncHandler = require('../../utils/asyncHandler');
const response = require('../../utils/response');
const service = require('./pos.service');

const createPointSchema = z.object({
  nameAr: z.string().min(2).max(150),
  location: z.string().optional(),
  managerId: z.string().uuid().optional(),
});

const openSchema = z.object({
  salesPointId: z.string().uuid(),
  openingCash: z.number().optional(),
});

const closeSchema = z.object({
  closingCash: z.number(),
});

const saleSchema = z.object({
  customerId: z.string().uuid(),
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().positive(),
    unitPrice: z.number().positive(),
  })).min(1),
  shippingAmount: z.number().optional(),
});

const listPoints = asyncHandler(async (req, res) => {
  return response.success(res, await service.listPoints());
});

const createPoint = asyncHandler(async (req, res) => {
  const data = createPointSchema.parse(req.body);
  return response.created(res, await service.createPoint(data));
});

const openSession = asyncHandler(async (req, res) => {
  const data = openSchema.parse(req.body);
  const session = await service.openSession(req.user.id, data.salesPointId, data.openingCash);
  return response.created(res, session, 'تم فتح الجلسة');
});

const closeSession = asyncHandler(async (req, res) => {
  const data = closeSchema.parse(req.body);
  const session = await service.closeSession(req.params.id, req.user.id, data.closingCash);
  if (!session) return response.error(res, 'الجلسة غير موجودة أو مغلقة', 404);
  return response.success(res, session, 'تم إغلاق الجلسة');
});

const createSale = asyncHandler(async (req, res) => {
  const data = saleSchema.parse(req.body);
  const order = await service.createPosSale(req.user.id, data);
  return response.created(res, order, 'تم إنشاء البيع');
});

module.exports = { listPoints, createPoint, openSession, closeSession, createSale };
