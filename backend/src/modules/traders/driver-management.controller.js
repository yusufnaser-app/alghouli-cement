const { z } = require('zod');
const asyncHandler = require('../../utils/asyncHandler');
const response = require('../../utils/response');
const service = require('./driver-management.service');

const addDriverSchema = z.object({
  fullName: z.string().min(3).max(150),
  phone: z.string().regex(/^967[0-9]{9}$/, 'رقم الهاتف بصيغة 967XXXXXXXXX'),
  password: z.string().min(6).optional(),
  vehiclePlate: z.string().max(30).optional(),
  vehicleType: z.string().max(50).optional(),
  capacityTons: z.number().positive().optional(),
});

const updateDriverSchema = z.object({
  fullName: z.string().min(3).max(150).optional(),
  phone: z.string().regex(/^967[0-9]{9}$/).optional(),
  status: z.enum(['available','busy','inactive']).optional(),
});

const addVehicleSchema = z.object({
  plateNumber: z.string().min(3).max(30),
  vehicleType: z.string().max(50).optional(),
  capacityTons: z.number().positive().optional(),
  capacityBags: z.number().int().positive().optional(),
  currentDriverId: z.string().uuid().optional(),
  notes: z.string().optional(),
});

const listDrivers = asyncHandler(async (req, res) => {
  const list = await service.listMyDrivers(req.user.id);
  return response.success(res, list, 'سائقوني');
});

const listVehicles = asyncHandler(async (req, res) => {
  const list = await service.listMyVehicles(req.user.id);
  return response.success(res, list, 'قاطراتي');
});

const addDriver = asyncHandler(async (req, res) => {
  const data = addDriverSchema.parse(req.body);
  const r = await service.addDriver(req.user.id, data);
  return response.created(res, r, 'تم إضافة السائق بنجاح');
});

const updateDriver = asyncHandler(async (req, res) => {
  const data = updateDriverSchema.parse(req.body);
  const r = await service.updateDriver(req.user.id, req.params.id, data);
  return response.success(res, r, 'تم التحديث');
});

const removeDriver = asyncHandler(async (req, res) => {
  await service.removeDriver(req.user.id, req.params.id);
  return response.success(res, null, 'تم حذف السائق');
});

const addVehicle = asyncHandler(async (req, res) => {
  const data = addVehicleSchema.parse(req.body);
  const r = await service.addVehicle(req.user.id, data);
  return response.created(res, r, 'تم إضافة القاطرة');
});

const removeVehicle = asyncHandler(async (req, res) => {
  await service.removeVehicle(req.user.id, req.params.id);
  return response.success(res, null, 'تم حذف القاطرة');
});

module.exports = {
  listDrivers, listVehicles,
  addDriver, updateDriver, removeDriver,
  addVehicle, removeVehicle,
};
