const { z } = require('zod');
const asyncHandler = require('../../utils/asyncHandler');
const response = require('../../utils/response');
const service = require('./vehicles.service');

const schema = z.object({
  plateNumber: z.string().min(3).max(30),
  vehicleType: z.string().min(2).max(50),
  supportsBagged: z.boolean().optional(),
  supportsBulk: z.boolean().optional(),
  capacityTons: z.number().positive(),
  capacityBags: z.number().int().positive().optional(),
  ownerName: z.string().max(150).optional(),
  ownerType: z.enum(['company', 'contractor']).optional(),
  notes: z.string().optional(),
});

const list = asyncHandler(async (req, res) => {
  const vehicles = await service.list(req.query);
  return response.success(res, vehicles, 'قائمة الشاحنات');
});

const create = asyncHandler(async (req, res) => {
  const data = schema.parse(req.body);
  const vehicle = await service.create(data);
  return response.created(res, vehicle, 'تم إضافة الشاحنة');
});

const getById = asyncHandler(async (req, res) => {
  const v = await service.getById(req.params.id);
  if (!v) return response.error(res, 'الشاحنة غير موجودة', 404);
  return response.success(res, v);
});

const update = asyncHandler(async (req, res) => {
  const v = await service.update(req.params.id, req.body);
  if (!v) return response.error(res, 'الشاحنة غير موجودة', 404);
  return response.success(res, v, 'تم التحديث');
});

module.exports = { list, create, getById, update };
