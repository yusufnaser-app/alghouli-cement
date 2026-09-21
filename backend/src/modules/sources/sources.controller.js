const asyncHandler = require('../../utils/asyncHandler');
const response = require('../../utils/response');
const service = require('./sources.service');

const list = asyncHandler(async (req, res) => {
  const sources = await service.listSources(req.query);
  return response.success(res, sources, 'قائمة المصانع');
});

const getById = asyncHandler(async (req, res) => {
  const source = await service.getSourceById(req.params.id);
  if (!source) return response.error(res, 'المصنع غير موجود', 404, 'NOT_FOUND');
  return response.success(res, source);
});

const create = asyncHandler(async (req, res) => {
  const source = await service.create(req.body);
  return response.created(res, source, 'تم إنشاء المصنع');
});

const update = asyncHandler(async (req, res) => {
  const source = await service.update(req.params.id, req.body);
  if (!source) return response.error(res, 'المصنع غير موجود', 404);
  return response.success(res, source, 'تم التحديث');
});

const remove = asyncHandler(async (req, res) => {
  const ok = await service.remove(req.params.id);
  if (!ok) return response.error(res, 'المصنع غير موجود', 404);
  return response.success(res, null, 'تم الحذف');
});

module.exports = { list, getById, create, update, remove };
