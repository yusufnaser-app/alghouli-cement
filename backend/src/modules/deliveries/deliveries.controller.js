const { z } = require('zod');
const asyncHandler = require('../../utils/asyncHandler');
const response = require('../../utils/response');
const service = require('./deliveries.service');
const { listAvailableTrips } = require('./available-trips.service');
const autoAssignSvc = require('./auto-assign.service');

const assignSchema = z.object({
  driverId: z.string().uuid(),
  vehicleId: z.string().uuid(),
});

const statusSchema = z.object({
  status: z.enum(['DRIVER_ACCEPTED', 'AT_PICKUP', 'LOADED', 'STARTED', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED']),
  notes: z.string().optional(),
});

const assign = asyncHandler(async (req, res) => {
  const data = assignSchema.parse(req.body);
  const trips = await service.assignDriver(req.params.orderId, data, req.user.id);
  return response.created(res, trips, 'تم تعيين السائق والشاحنة');
});

const updateStatus = asyncHandler(async (req, res) => {
  const { status, notes } = statusSchema.parse(req.body);
  const result = await service.updateDeliveryStatus(req.params.id, status, req.user.id, notes);
  return response.success(res, result, 'تم تحديث حالة الرحلة');
});

const { query } = require('../../config/db');
const listByOrder = asyncHandler(async (req, res) => {
  const isStaff = ['admin', 'transport', 'sales', 'accountant', 'loading', 'auditor'].some((r) => (req.roles || []).includes(r));
  if (!isStaff) {
    const own = await query(
      `SELECT 1 FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = $1 AND c.user_id = $2
       UNION SELECT 1 FROM deliveries d JOIN drivers dr ON dr.id = d.driver_id WHERE d.order_id = $1 AND dr.user_id = $2 LIMIT 1`,
      [req.params.orderId, req.user.id]);
    if (!own.rows.length) return response.error(res, 'غير مصرح', 403, 'FORBIDDEN');
  }
  const deliveries = await service.listByOrder(req.params.orderId);
  return response.success(res, deliveries, 'رحلات الطلب');
});

const pendingAssignment = asyncHandler(async (req, res) => {
  return response.success(res, await service.listPendingAssignment(), 'طلبات التوصيل بانتظار تعيين سائق');
});

// الرحلات النشطة مع الكمية المتبقية
const availableTrips = asyncHandler(async (req, res) => {
  return response.success(res, await listAvailableTrips(req.query), 'الرحلات المتاحة');
});

// تكليف طلب واحد على رحلة قائمة
const autoAssign = asyncHandler(async (req, res) => {
  const r = await autoAssignSvc.autoAssignToTrip(req.params.orderId, req.user.id);
  return response.success(res, r, r.assigned ? 'تم التكليف' : 'لم يُكلَّف الطلب: ' + (r.reason || ''));
});

// تكليف كل الطلبات المعلقة
const autoAssignAll = asyncHandler(async (req, res) => {
  return response.success(res, await autoAssignSvc.autoAssignPendingOrders(req.user.id), 'نتيجة التكليف التلقائي');
});

module.exports = { assign, updateStatus, listByOrder, pendingAssignment, availableTrips, autoAssign, autoAssignAll };
