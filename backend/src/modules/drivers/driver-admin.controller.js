const asyncHandler = require('../../utils/asyncHandler');
const response = require('../../utils/response');
const service = require('./driver-admin.service');

const listPending = asyncHandler(async (req, res) => {
  const list = await service.listPending();
  return response.success(res, list, 'السائقون المعلقون');
});

const listAll = asyncHandler(async (req, res) => {
  const list = await service.listAll(req.query);
  return response.success(res, list, 'كل السائقين');
});

const approve = asyncHandler(async (req, res) => {
  const r = await service.approve(req.params.id, req.user.id);
  return response.success(res, r, 'تم اعتماد السائق');
});

const reject = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const r = await service.reject(req.params.id, req.user.id, reason || 'غير محدد');
  return response.success(res, r, 'تم رفض السائق');
});

const suspend = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const r = await service.suspend(req.params.id, req.user.id, reason || 'غير محدد');
  return response.success(res, r, 'تم تعليق السائق');
});

module.exports = { listPending, listAll, approve, reject, suspend };
