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

module.exports = { list, getById };
