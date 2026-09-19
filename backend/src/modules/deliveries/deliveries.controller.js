const { z } = require('zod');
const asyncHandler = require('../../utils/asyncHandler');
const response = require('../../utils/response');
const service = require('./deliveries.service');

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

const listByOrder = asyncHandler(async (req, res) => {
  const deliveries = await service.listByOrder(req.params.orderId);
  return response.success(res, deliveries, 'رحلات الطلب');
});

module.exports = { assign, updateStatus, listByOrder };
