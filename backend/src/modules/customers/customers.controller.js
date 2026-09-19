const { z } = require('zod');
const asyncHandler = require('../../utils/asyncHandler');
const response = require('../../utils/response');
const service = require('./customers.service');

const updateSchema = z.object({
  customerType: z.enum(['individual', 'trader', 'distributor', 'contractor']).optional(),
  governorate: z.string().min(2).max(100).optional(),
  area: z.string().max(100).optional(),
  defaultAddress: z.string().optional(),
});

const addressSchema = z.object({
  label: z.string().min(1).max(50),
  governorate: z.string().min(2).max(100),
  area: z.string().min(1).max(100),
  addressText: z.string().min(3),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  altPhone: z.string().regex(/^967[0-9]{9}$/).optional(),
  isDefault: z.boolean().optional(),
});

const me = asyncHandler(async (req, res) => {
  const profile = await service.getMyProfile(req.user.id);
  if (!profile) return response.error(res, 'الملف غير موجود', 404);
  return response.success(res, profile);
});

const updateMe = asyncHandler(async (req, res) => {
  const data = updateSchema.parse(req.body);
  const updated = await service.updateMyProfile(req.user.id, data);
  return response.success(res, updated, 'تم تحديث الملف');
});

const listAddresses = asyncHandler(async (req, res) => {
  const list = await service.listAddresses(req.user.id);
  return response.success(res, list, 'قائمة العناوين');
});

const addAddress = asyncHandler(async (req, res) => {
  const data = addressSchema.parse(req.body);
  const address = await service.addAddress(req.user.id, data);
  return response.created(res, address, 'تم إضافة العنوان');
});

const deleteAddress = asyncHandler(async (req, res) => {
  const ok = await service.deleteAddress(req.user.id, req.params.id);
  if (!ok) return response.error(res, 'العنوان غير موجود', 404);
  return response.success(res, null, 'تم حذف العنوان');
});

module.exports = { me, updateMe, listAddresses, addAddress, deleteAddress };
