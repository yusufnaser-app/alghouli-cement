const { z } = require('zod');
const asyncHandler = require('../../utils/asyncHandler');
const response = require('../../utils/response');
const service = require('./drivers.service');

const schema = z.object({
  fullName: z.string().min(3).max(150),
  phone: z.string().regex(/^967[0-9]{9}$/),
  licenseNumber: z.string().max(50).optional(),
  idNumber: z.string().max(50).optional(),
  notes: z.string().optional(),
});

const list = asyncHandler(async (req, res) => {
  const drivers = await service.list();
  return response.success(res, drivers, 'قائمة السائقين');
});

const create = asyncHandler(async (req, res) => {
  const data = schema.parse(req.body);
  const driver = await service.create(data);
  return response.created(res, driver, 'تم إضافة السائق');
});

const update = asyncHandler(async (req, res) => {
  const driver = await service.update(req.params.id, req.body);
  if (!driver) return response.error(res, 'السائق غير موجود', 404);
  return response.success(res, driver, 'تم التحديث');
});

const getById = asyncHandler(async (req, res) => {
  const driver = await service.getById(req.params.id);
  if (!driver) return response.error(res, 'السائق غير موجود', 404);
  return response.success(res, driver);
});

module.exports = { list, create, update, getById };

// قاطراتي
const myVehicles = async (req, res) => {
  try {
    const service = require('./drivers.service');
    const list = await service.getMyVehicles(req.user.id);
    const response = require('../../utils/response');
    return response.success(res, list, 'قاطراتي');
  } catch (e) {
    const response = require('../../utils/response');
    return response.error(res, e.message, 500);
  }
};

module.exports.myVehicles = myVehicles;
