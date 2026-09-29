const { z } = require('zod');
const asyncHandler = require('../../utils/asyncHandler');
const response = require('../../utils/response');
const service = require('./sms-admin.service');
const { getProvider } = require('../../services/sms-provider');

const list = asyncHandler(async (req, res) =>
  response.success(res, await service.listMessages({ status: req.query.status, limit: req.query.limit })));

const retry = asyncHandler(async (req, res) => {
  const r = await service.retryMessage(req.params.id);
  if (!r.success) return response.error(res, `فشلت المحاولة: ${r.error}`, 400);
  return response.success(res, r, 'تم الإرسال');
});

const processQueue = asyncHandler(async (req, res) =>
  response.success(res, await service.processPending(), 'تمت معالجة الطابور'));

const status = asyncHandler(async (req, res) => {
  const configured = await getProvider().isConfigured();
  return response.success(res, {
    configured,
    note: configured ? 'مزود SMS مُهيَّأ.' : 'لا يوجد مزود SMS مُهيَّأ بعد — الرسائل تبقى في الطابور (pending) ولا تُرسل فعليًا.',
  });
});

const templates = asyncHandler(async (req, res) => response.success(res, await service.listTemplates()));

const templateSchema = z.object({
  bodyTemplate: z.string().min(5).max(500).optional(),
  titleAr: z.string().min(2).max(150).optional(),
  isActive: z.boolean().optional(),
});
const updateTemplate = asyncHandler(async (req, res) =>
  response.success(res, await service.updateTemplate(req.params.id, templateSchema.parse(req.body)), 'تم تحديث القالب'));

module.exports = { list, retry, processQueue, status, templates, updateTemplate };
