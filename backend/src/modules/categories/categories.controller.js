const asyncHandler = require('../../utils/asyncHandler');
const response = require('../../utils/response');
const service = require('./categories.service');

const list = asyncHandler(async (req, res) => {
  const categories = await service.listCategories();
  return response.success(res, categories, 'أنواع الأسمنت');
});

const create = asyncHandler(async (req, res) => {
  const c = await service.create(req.body);
  return response.created(res, c, 'تم إنشاء النوع');
});

const update = asyncHandler(async (req, res) => {
  const c = await service.update(req.params.id, req.body);
  if (!c) return response.error(res, 'النوع غير موجود', 404);
  return response.success(res, c, 'تم التحديث');
});

const remove = asyncHandler(async (req, res) => {
  const ok = await service.remove(req.params.id);
  if (!ok) return response.error(res, 'النوع غير موجود', 404);
  return response.success(res, null, 'تم الحذف');
});

module.exports = { list, create, update, remove };
