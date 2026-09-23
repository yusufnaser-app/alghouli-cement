const { z } = require('zod');
const asyncHandler = require('../../utils/asyncHandler');
const response = require('../../utils/response');
const service = require('./fax.service');

// ============ Schemas ============
const requestSchema = z.object({
  factoryId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  quantity: z.number().positive(),
  orderId: z.string().uuid().optional(),
  driverId: z.string().uuid().optional(),
  notes: z.string().max(500).optional(),
});

const staffRequestSchema = z.object({
  driverId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  factoryId: z.string().uuid(),
  quantity: z.number().positive(),
  orderId: z.string().uuid().optional(),
  notes: z.string().max(500).optional(),
});

const routeSchema = z.object({ route: z.string().min(3).max(500) });
const transportSchema = z.object({
  rate: z.number().positive(),
  unit: z.enum(['bag', 'ton']).optional(),
  baseOn: z.enum(['approved_quantity','loaded_quantity','delivered_quantity','requested_quantity']).optional(),
  editReason: z.string().max(500).optional(),
});
const issueSchema = z.object({ faxNumber: z.string().min(1).max(50) });
const cancelSchema = z.object({ reason: z.string().max(500).optional() });
const loadingSchema = z.object({ loadedQuantity: z.number().min(0) });

// ============ Handlers ============
const request = asyncHandler(async (req, res) => {
  const data = requestSchema.parse(req.body);
  const fax = await service.requestFax(req.user.id, data);
  return response.created(res, fax, 'تم إرسال طلب الفاكس');
});

const staffRequest = asyncHandler(async (req, res) => {
  const data = staffRequestSchema.parse(req.body);
  const fax = await service.requestFaxByStaff(data, req.user.id);
  return response.created(res, fax, 'تم إنشاء الفاكس بنجاح');
});

const myFaxes = asyncHandler(async (req, res) => {
  return response.success(res, await service.listDriverFaxes(req.user.id));
});

const enterFactory = asyncHandler(async (req, res) => {
  const r = await service.enterFactory(req.params.id, req.user.id);
  return response.success(res, r, 'تم تسجيل دخولك للمصنع');
});

const pending = asyncHandler(async (req, res) => {
  return response.success(res, await service.listPendingFaxes());
});

const pendingRoutePrice = asyncHandler(async (req, res) => {
  return response.success(res, await service.listPendingRouteAndPrice());
});

const approve = asyncHandler(async (req, res) => {
  const r = await service.approveFax(req.params.id, req.user.id);
  return response.success(res, r, 'تم اعتماد الفاكس');
});

const issue = asyncHandler(async (req, res) => {
  const { faxNumber } = issueSchema.parse(req.body);
  const r = await service.issueFax(req.params.id, faxNumber, req.user.id);
  return response.success(res, r, 'تم إصدار الفاكس');
});

const issueAndNotify = asyncHandler(async (req, res) => {
  const { faxNumber } = issueSchema.parse(req.body);
  const r = await service.issueAndNotify(req.params.id, faxNumber, req.user.id);
  return response.success(res, r, 'تم إصدار الفاكس وإشعار السائق');
});

const setRoute = asyncHandler(async (req, res) => {
  const { route } = routeSchema.parse(req.body);
  const r = await service.setRoute(req.params.id, route, req.user.id);
  return response.success(res, r, 'تم تحديد خط السير');
});

const setTransport = asyncHandler(async (req, res) => {
  const data = transportSchema.parse(req.body);
  const r = await service.setTransport(req.params.id, data, req.user.id);
  return response.success(res, r, 'تم تحديد سعر النقل');
});

const recordLoading = asyncHandler(async (req, res) => {
  const { loadedQuantity } = loadingSchema.parse(req.body);
  const r = await service.recordLoading(req.params.id, loadedQuantity, req.user.id);
  return response.success(res, r, 'تم تسجيل التحميل');
});

const cancel = asyncHandler(async (req, res) => {
  const { reason } = cancelSchema.parse(req.body);
  const r = await service.cancelFax(req.params.id, req.user.id, reason);
  return response.success(res, r, 'تم إلغاء الفاكس');
});

const getById = asyncHandler(async (req, res) => {
  const fax = await service.getFaxById(req.params.id);
  if (!fax) return response.error(res, 'غير موجود', 404);
  return response.success(res, fax);
});

// ============ Exports ============
module.exports = {
  request, staffRequest, myFaxes, enterFactory,
  pending, pendingRoutePrice, approve, issue, issueAndNotify,
  setRoute, setTransport, recordLoading, cancel, getById,
};
