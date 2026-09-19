const asyncHandler = require('../../utils/asyncHandler');
const response = require('../../utils/response');
const service = require('./products.service');

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
    product_id,
    quantity: parseInt(quantity, 10),
    unit: price.pricing_unit,
    unit_price: parseFloat(price.price),
    subtotal,
    price_list: price.price_list_name,
  }, 'تم حساب السعر');
});

module.exports = { list, getById, calculate };
