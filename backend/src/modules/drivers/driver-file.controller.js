const asyncHandler = require('../../utils/asyncHandler');
const response = require('../../utils/response');
const service = require('./driver-file.service');

const getProfile = asyncHandler(async (req, res) => {
  const p = await service.getFullProfile(req.params.id);
  if (!p) return response.error(res, 'السائق غير موجود', 404);
  return response.success(res, p, 'ملف السائق');
});

const getTrips = asyncHandler(async (req, res) => {
  const list = await service.getTrips(req.params.id, req.query);
  return response.success(res, list, 'رحلات السائق');
});

const getActivity = asyncHandler(async (req, res) => {
  const list = await service.getActivity(req.params.id, req.query);
  return response.success(res, list, 'سجل النشاط');
});

const getTransfers = asyncHandler(async (req, res) => {
  const list = await service.getTransfers(req.params.id);
  return response.success(res, list, 'التحويلات');
});

const createTransfer = asyncHandler(async (req, res) => {
  const r = await service.createTransfer(req.params.id, req.body, req.user.id);
  return response.created(res, r, 'تم تسجيل التحويل');
});

const getStats = asyncHandler(async (req, res) => {
  const s = await service.getStats();
  return response.success(res, s, 'إحصائيات السائقين');
});


const updateProfile = asyncHandler(async (req, res) => {
  const p = await service.updateDriverProfile(req.params.id, req.body, req.user.id);
  if (!p) return response.error(res, 'السائق غير موجود', 404);
  return response.success(res, p, 'تم تحديث ملف السائق');
});

module.exports = { getProfile, getTrips, getActivity, getTransfers, createTransfer, getStats, updateProfile };
