const { z } = require('zod');
const asyncHandler = require('../../utils/asyncHandler');
const response = require('../../utils/response');
const service = require('./settings.service');

const updateSchema = z.object({
  settings: z.array(z.object({
    key: z.string().min(1).max(100),
    value: z.string(),
    groupName: z.string().optional(),
  })).min(1),
});

const listAll = asyncHandler(async (req, res) => {
  const data = await service.listAll();
  return response.success(res, data, 'جميع الإعدادات');
});

const publicSettings = asyncHandler(async (req, res) => {
  const data = await service.getPublic();
  return response.success(res, data, 'الإعدادات العامة');
});

const update = asyncHandler(async (req, res) => {
  const { settings } = updateSchema.parse(req.body);
  const data = await service.update(settings, req.user.id);
  return response.success(res, data, 'تم تحديث الإعدادات');
});

const create = asyncHandler(async (req, res) => {
  const data = await service.create(req.body);
  return response.created(res, data, 'تم إضافة الإعداد');
});

const remove = asyncHandler(async (req, res) => {
  const ok = await service.remove(req.params.key);
  if (!ok) return response.error(res, 'الإعداد غير موجود', 404);
  return response.success(res, null, 'تم الحذف');
});

module.exports = { listAll, publicSettings, update, create, remove };
