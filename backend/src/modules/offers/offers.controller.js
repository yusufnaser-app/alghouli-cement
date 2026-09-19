const { z } = require('zod');
const asyncHandler = require('../../utils/asyncHandler');
const response = require('../../utils/response');
const service = require('./offers.service');

const campaignSchema = z.object({
  titleAr: z.string().min(3).max(200),
  bodyAr: z.string().optional(),
  imageUrl: z.string().url().optional(),
  productId: z.string().uuid().optional(),
  targetCustomerType: z.enum(['individual','trader','distributor','contractor']).optional(),
  targetGovernorate: z.string().optional(),
  targetArea: z.string().optional(),
  startDate: z.string(),
  endDate: z.string(),
  status: z.enum(['draft','active','ended']).optional(),
});

const offerSchema = z.object({
  campaignId: z.string().uuid().optional(),
  productId: z.string().uuid(),
  offerType: z.enum(['percentage','fixed_amount','special_price','quantity_based']),
  discountValue: z.number().optional(),
  minQty: z.number().int().optional(),
  maxQty: z.number().int().optional(),
  specialPrice: z.number().optional(),
  startDate: z.string(),
  endDate: z.string(),
});

const listCampaigns = asyncHandler(async (req, res) => {
  return response.success(res, await service.listCampaigns(), 'الحملات');
});

const createCampaign = asyncHandler(async (req, res) => {
  const data = campaignSchema.parse(req.body);
  return response.created(res, await service.createCampaign(data, req.user.id), 'تم إنشاء الحملة');
});

const updateCampaign = asyncHandler(async (req, res) => {
  const c = await service.updateCampaign(req.params.id, req.body);
  if (!c) return response.error(res, 'الحملة غير موجودة', 404);
  return response.success(res, c, 'تم التحديث');
});

const deleteCampaign = asyncHandler(async (req, res) => {
  const ok = await service.deleteCampaign(req.params.id);
  if (!ok) return response.error(res, 'غير موجودة', 404);
  return response.success(res, null, 'تم الحذف');
});

const listActiveOffers = asyncHandler(async (req, res) => {
  const ct = req.user?.customer?.customer_type || null;
  return response.success(res, await service.listActiveOffers(ct), 'العروض النشطة');
});

const createOffer = asyncHandler(async (req, res) => {
  const data = offerSchema.parse(req.body);
  return response.created(res, await service.createOffer(data), 'تم إنشاء العرض');
});

const deleteOffer = asyncHandler(async (req, res) => {
  const ok = await service.deleteOffer(req.params.id);
  if (!ok) return response.error(res, 'غير موجود', 404);
  return response.success(res, null, 'تم الحذف');
});

module.exports = { listCampaigns, createCampaign, updateCampaign, deleteCampaign,
  listActiveOffers, createOffer, deleteOffer };
