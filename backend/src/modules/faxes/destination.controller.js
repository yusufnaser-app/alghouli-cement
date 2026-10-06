'use strict';
const { z } = require('zod');
const asyncHandler = require('../../utils/asyncHandler');
const response = require('../../utils/response');
const service = require('./destination.service');
const { loadPermissions } = require('../../middlewares/auth');

const destinationSchema = z.object({
  destinationType: z.enum(['trader', 'warehouse']),
  traderId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
  quantity: z.number().positive(),
  unit: z.enum(['bag', 'ton']).optional(),
  label: z.string().max(150).optional(),
  governorate: z.string().max(100).optional(),
  area: z.string().max(100).optional(),
  addressText: z.string().max(500).optional(),
  contactPhone: z.string().max(20).optional(),
  contactName: z.string().max(150).optional(),
  notes: z.string().max(500).optional(),
}).refine(
  (d) => (d.destinationType === 'trader' ? !!d.traderId : !!d.warehouseId),
  { message: 'الوجهة تتطلب traderId (تاجر) أو warehouseId (مستودع)', path: ['destinationType'] }
);

// كل الحقول الجديدة اختيارية — التطبيق الحالي يرسل { destinations } فقط
const replaceSchema = z.object({
  destinations: z.array(destinationSchema).min(1).max(20),
  transportRate: z.number().positive().max(100000000).optional(),
  transportRateUnit: z.enum(['bag', 'ton']).optional(),
  transportBaseOn: z.enum(['loaded_quantity', 'approved_quantity', 'requested_quantity']).optional(),
  transportPayer: z.enum(['institution', 'trader']).optional(),
  transportPayerTraderId: z.string().uuid().optional(),
  transportPayerNote: z.string().max(500).optional(),
  route: z.string().trim().min(3).max(500).optional(),
});

const list = asyncHandler(async (req, res) => {
  const data = await service.listDestinations(req.params.id);
  return response.success(res, data, 'وجهات التسليم');
});

const replace = asyncHandler(async (req, res) => {
  const body = replaceSchema.parse(req.body);

  // الوجهات متاحة لـ admin/transport/sales، أما تحديد السعر فيتطلب نفس صلاحية route-transport
  if (body.transportRate !== undefined) {
    const perms = await loadPermissions(req);
    if (!(perms.has('*') || perms.has('transport.update') || perms.has('pricing.update'))) {
      return response.error(res, 'ممنوع: لا تملك صلاحية تحديد سعر النقل', 403, 'FORBIDDEN');
    }
  }

  const result = await service.replaceDestinationsAndTransport(req.params.id, body, req.user.id);
  return response.success(res, result, 'تم حفظ الوجهات');
});

const deliver = asyncHandler(async (req, res) => {
  const result = await service.deliverDestination(req.params.destId, req.user.id);
  return response.success(res, result, 'تم تسجيل التسليم');
});

const warehouses = asyncHandler(async (req, res) => {
  const data = await service.listWarehouses();
  return response.success(res, data, 'المستودعات');
});

const traders = asyncHandler(async (req, res) => {
  const data = await service.listTraders();
  return response.success(res, data, 'التجار');
});

module.exports = { list, replace, deliver, warehouses, traders };
