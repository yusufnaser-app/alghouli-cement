const asyncHandler = require('../../utils/asyncHandler');
const response = require('../../utils/response');
const service = require('./files.service');

const upload = asyncHandler(async (req, res) => {
  if (!req.file) return response.error(res, 'لم يتم إرسال ملف', 400);
  const type = req.body.type || 'product';
  const result = await service.uploadFile(req.file.buffer, req.file.originalname, type);
  return response.created(res, result, 'تم رفع الملف');
});

module.exports = { upload };
