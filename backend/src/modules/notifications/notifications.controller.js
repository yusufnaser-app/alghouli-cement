const asyncHandler = require('../../utils/asyncHandler');
const response = require('../../utils/response');
const service = require('./notifications.service');

const list = asyncHandler(async (req, res) => {
  const data = await service.listByUser(req.user.id, req.query);
  return response.success(res, data, 'الإشعارات');
});

const unreadCount = asyncHandler(async (req, res) => {
  const count = await service.unreadCount(req.user.id);
  return response.success(res, { count }, 'عدد الإشعارات غير المقروءة');
});

const markRead = asyncHandler(async (req, res) => {
  const ok = await service.markRead(req.params.id, req.user.id);
  if (!ok) return response.error(res, 'الإشعار غير موجود', 404);
  return response.success(res, null, 'تم تعليمه كمقروء');
});

const markAllRead = asyncHandler(async (req, res) => {
  await service.markAllRead(req.user.id);
  return response.success(res, null, 'تم تعليم الكل كمقروء');
});

const remove = asyncHandler(async (req, res) => {
  const ok = await service.remove(req.params.id, req.user.id);
  if (!ok) return response.error(res, 'الإشعار غير موجود', 404);
  return response.success(res, null, 'تم الحذف');
});

module.exports = { list, unreadCount, markRead, markAllRead, remove };
