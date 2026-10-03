'use strict';
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

const brandingSchema = z.object({
  primary_color: z.string().max(20).optional(),
  secondary_color: z.string().max(20).optional(),
  logo_url: z.string().max(2000).optional(),
  favicon_url: z.string().max(2000).optional(),
  login_image_url: z.string().max(2000).optional(),
  home_banner_url: z.string().max(2000).optional(),
  company_name: z.string().max(150).optional(),
});

const providerSchema = z.object({
  enabled: z.boolean().optional(),
}).passthrough();

// ═══ الأساسيات ═══
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

// ═══ الهوية ═══
const getBranding = asyncHandler(async (req, res) => {
  const data = await service.getBranding();
  return response.success(res, data, 'الهوية');
});

const updateBranding = asyncHandler(async (req, res) => {
  const data = brandingSchema.parse(req.body);
  const result = await service.updateBranding(data, req.user.id);
  return response.success(res, result, 'تم تحديث الهوية');
});

// ═══ المزودون ═══
const listProviders = asyncHandler(async (req, res) => {
  const data = await service.listProviders();
  return response.success(res, data, 'مزودو الخدمة');
});

const updateProvider = asyncHandler(async (req, res) => {
  const config = providerSchema.parse(req.body);
  const data = await service.updateProvider(req.params.name, config, req.user.id);
  return response.success(res, data, 'تم تحديث المزود');
});

module.exports = {
  listAll, publicSettings, update, create, remove,
  getBranding, updateBranding,
  listProviders, updateProvider,
};
