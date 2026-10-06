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
  deliveryGovernorate: z.string().max(200).optional(),
  deliveryArea: z.string().max(200).optional(),
});

const routeTransportSchema = z.object({
  route: z.string().min(3).max(500),
  deliveryGovernorate: z.string().max(200).optional(),
  deliveryArea: z.string().max(200).optional(),
  deliveryAddress: z.string().max(500).optional(),
  rate: z.number().positive(),
  unit: z.enum(['bag', 'ton']).optional(),
  baseOn: z.enum(['loaded_quantity','requested_quantity','delivered_quantity']).optional(),
  transportPayer: z.enum(['institution', 'trader']).optional(),
  transportPayerTraderId: z.string().uuid().optional(),
  transportPayerNote: z.string().max(500).optional(),
  destinationTraderId: z.string().uuid().optional(),
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

const { sendCsv } = require('../../utils/csv');

const STATUS_AR = { REQUESTED: 'بانتظار الاعتماد', APPROVED: 'معتمد', ISSUED: 'صادر', USED: 'استُخدم',
  READY_FOR_TRANSIT: 'في الطريق', CANCELLED: 'ملغي' };

const exportCsv = asyncHandler(async (req, res) => {
  const rows = await service.listFaxesForExport({
    status: req.query.status, from: req.query.from, to: req.query.to,
  });
  const columns = [
    { key: 'fax_number', label: 'رقم الفاكس' },
    { key: 'status', label: 'الحالة', format: (v) => STATUS_AR[v] || v },
    { key: 'driver_name', label: 'السائق' },
    { key: 'plate_number', label: 'القاطرة' },
    { key: 'factory_name', label: 'المصنع' },
    { key: 'requested_quantity', label: 'الكمية المطلوبة' },
    { key: 'loaded_quantity', label: 'الكمية المحملة' },
    { key: 'quantity_discrepancy', label: 'الفرق' },
    { key: 'route', label: 'خط السير' },
    { key: 'transport_rate', label: 'سعر النقل' },
    { key: 'transport_total', label: 'إجمالي النقل' },
    { key: 'transport_payer', label: 'من يتحمل', format: (v) => (v === 'trader' ? 'التاجر' : 'المؤسسة') },
    { key: 'requested_at', label: 'وقت الطلب' },
    { key: 'issued_at', label: 'وقت الإصدار' },
    { key: 'used_at', label: 'وقت التحميل' },
  ];
  return sendCsv(res, `faxes-${new Date().toISOString().slice(0, 10)}.csv`, rows, columns);
});

const operationsCenter = asyncHandler(async (req, res) => {
  let threshold = parseInt(req.query.delayMinutes, 10);
  if (!Number.isFinite(threshold) || threshold < 1 || threshold > 10080) threshold = 60;
  const data = await service.getOperationsCenter(threshold);
  return response.success(res, data, 'مركز العمليات');
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

const STAFF_ROLES = ['admin', 'transport', 'sales', 'accountant'];

// الموظفون يرون كل الفاكسات؛ السائق فاكساته فقط؛ التاجر فاكسات سائقيه أو التي تحمّل أجرتها.
// أي شخص آخر يتلقى 404 (لا نكشف وجود الفاكس أصلًا).
const getById = asyncHandler(async (req, res) => {
  const fax = await service.getFaxById(req.params.id);
  if (!fax) return response.error(res, 'غير موجود', 404);
  const isStaff = (req.roles || []).some((r) => STAFF_ROLES.includes(r));
  const uid = req.user.id;
  const allowed =
    isStaff ||
    fax.driver_user_id === uid ||
    fax.trader_user_id === uid ||
    fax.payer_trader_user_id === uid;
  if (!allowed) return response.error(res, 'غير موجود', 404);
  return response.success(res, fax);
});

// ============ Exports ============
const currentTrip = asyncHandler(async (req, res) => {
  const t = await service.getCurrentTrip(req.user.id);
  return response.success(res, t, 'الرحلة الحالية');
});

const confirmLoading = asyncHandler(async (req, res) => {
  const { loadedQuantity, notes } = req.body;
  if (typeof loadedQuantity !== 'number' || loadedQuantity <= 0) {
    return response.error(res, 'الكمية غير صحيحة', 400);
  }
  const r = await service.driverConfirmLoading(
    req.params.id,
    req.user.id,
    loadedQuantity,
    notes
  );
  return response.success(res, r, 'تم تسجيل التحميل بنجاح');
});

const awaitingRoute = asyncHandler(async (req, res) => {
  const list = await service.listAwaitingRoute();
  return response.success(res, list, 'فاكسات بانتظار خط السير');
});

const setRouteTransport = asyncHandler(async (req, res) => {
  const data = routeTransportSchema.parse(req.body);
  const r = await service.setRouteAndTransport(req.params.id, data, req.user.id);
  return response.success(res, r, 'تم تحديد خط السير والأجرة');
});


const driverMarkDelivered = asyncHandler(async (req, res) => {
  const r = await service.driverMarkDelivered(req.params.id, req.user.id);
  return response.success(res, r, 'تم تسجيل التسليم');
});


const setTransportRate = asyncHandler(async (req, res) => {
  const rate = parseFloat(req.body.rate);
  if (isNaN(rate) || rate <= 0) {
    return response.error(res, 'السعر يجب أن يكون رقمًا أكبر من صفر', 400);
  }
  const r = await service.setTransportRate(req.params.id, rate, req.user.id);
  return response.success(res, r, 'تم حفظ سعر النقل');
});

module.exports = {
  setTransportRate,
  driverMarkDelivered,
  request, staffRequest, myFaxes, enterFactory, currentTrip, confirmLoading, awaitingRoute, setRouteTransport,
  pending, pendingRoutePrice, operationsCenter, exportCsv, approve, issue, issueAndNotify,
  recordLoading, cancel, getById,
};
