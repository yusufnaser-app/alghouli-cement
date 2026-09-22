const asyncHandler = require('../../utils/asyncHandler');
const response = require('../../utils/response');
const service = require('./transport.service');

const calculate = asyncHandler(async (req, res) => {
  const result = await service.calculateTransport({
    sourceId: req.query.source_id,
    governorate: req.query.governorate,
    area: req.query.area,
    packagingType: req.query.packaging_type,
    quantity: parseFloat(req.query.quantity || '0'),
    unit: req.query.unit || 'bag',
  });
  return response.success(res, result, 'حساب النقل');
});

const listRates = asyncHandler(async (req, res) => {
  return response.success(res, await service.listRates());
});

const createRate = asyncHandler(async (req, res) => {
  return response.created(res, await service.createRate(req.body));
});

const updateRate = asyncHandler(async (req, res) => {
  const r = await service.updateRate(req.params.id, req.body);
  if (!r) return response.error(res, 'غير موجود', 404);
  return response.success(res, r);
});

const removeRate = asyncHandler(async (req, res) => {
  const ok = await service.removeRate(req.params.id);
  if (!ok) return response.error(res, 'غير موجود', 404);
  return response.success(res, null, 'تم الحذف');
});

module.exports = { calculate, listRates, createRate, updateRate, removeRate };
