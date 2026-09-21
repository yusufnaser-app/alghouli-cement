const { z } = require('zod');
const asyncHandler = require('../../utils/asyncHandler');
const response = require('../../utils/response');
const service = require('./products.service');
const adminService = require('./products.admin.service');

const productSchema = z.object({
  nameAr: z.string().min(3).max(150),
  sourceId: z.string().uuid(),
  categoryId: z.string().uuid(),
  grade: z.string().max(30).optional(),
  packagingType: z.enum(['bagged', 'bulk']),
  bagWeightKg: z.number().optional(),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
  status: z.enum(['available', 'unavailable', 'suspended']).optional(),
  minOrderQty: z.number().int().optional(),
  initialQty: z.number().optional(),
  prices: z.array(z.object({
    priceListId: z.string().uuid(),
    price: z.number().positive(),
    minQty: z.number().int().optional(),
    maxQty: z.number().int().optional(),
  })).optional(),
});

const list = asyncHandler(async (req, res) => {
  const products = await service.listProducts(req.query);
  return response.success(res, products, 'قائمة المنتجات');
});

const getById = asyncHandler(async (req, res) => {
  const product = await service.getProductById(req.params.id);
  if (!product) return response.error(res, 'المنتج غير موجود', 404, 'NOT_FOUND');
  return response.success(res, product);
});

const calculate = asyncHandler(async (req, res) => {
  const { product_id, quantity } = req.query;
  const customerType = req.user?.customerType || 'individual';
  if (!product_id || !quantity) {
    return response.error(res, 'product_id و quantity مطلوبان', 400);
  }
  const price = await service.calculatePrice(product_id, customerType, parseInt(quantity, 10));
  if (!price) return response.error(res, 'لا يوجد سعر متاح', 404);
  const subtotal = parseFloat(price.price) * parseInt(quantity, 10);
  return response.success(res, {
    product_id, quantity: parseInt(quantity, 10),
    unit: price.pricing_unit, unit_price: parseFloat(price.price),
    subtotal, price_list: price.price_list_name,
  }, 'تم حساب السعر');
});

const create = asyncHandler(async (req, res) => {
  const data = productSchema.parse(req.body);
  const product = await adminService.create(data);
  return response.created(res, product, 'تم إنشاء المنتج');
});

const update = asyncHandler(async (req, res) => {
  const product = await adminService.update(req.params.id, req.body);
  if (!product) return response.error(res, 'المنتج غير موجود', 404);
  return response.success(res, product, 'تم التحديث');
});

const remove = asyncHandler(async (req, res) => {
  const ok = await adminService.remove(req.params.id);
  if (!ok) return response.error(res, 'المنتج غير موجود', 404);
  return response.success(res, null, 'تم الحذف');
});

const updatePrices = asyncHandler(async (req, res) => {
  const { prices } = req.body;
  if (!Array.isArray(prices)) return response.error(res, 'prices مطلوبة', 400);
  const ok = await adminService.updatePrices(req.params.id, prices);
  if (!ok) return response.error(res, 'المنتج غير موجود', 404);
  return response.success(res, null, 'تم تحديث الأسعار');
});

const updateInventory = asyncHandler(async (req, res) => {
  const { quantity, reason } = req.body;
  if (typeof quantity !== 'number') return response.error(res, 'quantity مطلوبة', 400);
  await adminService.updateInventory(req.params.id, quantity, reason, req.user.id);
  return response.success(res, null, 'تم تحديث المخزون');
});

module.exports = { list, getById, calculate, create, update, remove, updatePrices, updateInventory };
