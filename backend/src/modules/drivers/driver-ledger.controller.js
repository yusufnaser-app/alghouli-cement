const { z } = require('zod');
const asyncHandler = require('../../utils/asyncHandler');
const response = require('../../utils/response');
const service = require('./driver-ledger.service');

const paymentSchema = z.object({
  amount: z.number().positive(),
  method: z.string().optional(),
  reference: z.string().optional(),
  description: z.string().optional(),
});

const mySummary = asyncHandler(async (req, res) => {
  const driverId = await service.getDriverIdFromUser(req.user.id);
  if (!driverId) return response.error(res, 'السائق غير موجود', 404);
  const s = await service.getSummary(driverId);
  return response.success(res, s, 'ملخص حسابي');
});

const myLedger = asyncHandler(async (req, res) => {
  const driverId = await service.getDriverIdFromUser(req.user.id);
  if (!driverId) return response.error(res, 'السائق غير موجود', 404);
  const l = await service.getLedger(driverId, req.query);
  return response.success(res, l, 'كشف حسابي');
});

const list = asyncHandler(async (req, res) => {
  const list = await service.listDriversWithBalance(req.query);
  return response.success(res, list, 'السائقون');
});

const getLedger = asyncHandler(async (req, res) => {
  const l = await service.getLedger(req.params.driverId, req.query);
  return response.success(res, l);
});

const getSummary = asyncHandler(async (req, res) => {
  const s = await service.getSummary(req.params.driverId);
  if (!s) return response.error(res, 'السائق غير موجود', 404);
  return response.success(res, s);
});

const recordPayment = asyncHandler(async (req, res) => {
  const data = paymentSchema.parse(req.body);
  const r = await service.recordPayment(req.params.driverId, data, req.user.id);
  return response.created(res, r, 'تم تسجيل الدفعة');
});

const recordAdvance = asyncHandler(async (req, res) => {
  const data = paymentSchema.parse(req.body);
  const r = await service.recordAdvance(req.params.driverId, data, req.user.id);
  return response.created(res, r, 'تم تسجيل السلفة');
});

const recordDeduction = asyncHandler(async (req, res) => {
  const data = paymentSchema.parse(req.body);
  const r = await service.recordDeduction(req.params.driverId, data, req.user.id);
  return response.created(res, r, 'تم تسجيل الخصم');
});

module.exports = {
  mySummary, myLedger,
  list, getLedger, getSummary,
  recordPayment, recordAdvance, recordDeduction,
};
