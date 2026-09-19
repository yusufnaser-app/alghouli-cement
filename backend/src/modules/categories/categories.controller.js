const asyncHandler = require('../../utils/asyncHandler');
const response = require('../../utils/response');
const service = require('./categories.service');

const list = asyncHandler(async (req, res) => {
  const categories = await service.listCategories();
  return response.success(res, categories, 'أنواع الأسمنت');
});

module.exports = { list };
