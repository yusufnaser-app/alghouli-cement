const { z } = require('zod');
const asyncHandler = require('../../utils/asyncHandler');
const response = require('../../utils/response');
const service = require('./payments.service');

const submitSchema = z.object({
  orderId: z.string().uuid(),
  methodId: z.string().uuid(),
  amountTransferred: z.number().positive(),
  transferDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  transactionRef: z.string().max(100).optional(),
});

const rejectSchema = z.object({
  reason: z.string().min(3).max(500),
});

const listMethods = asyncHandler(async (req, res) => {
  const methods = await service.listMethods();
  return response.success(res, methods, 'طرق الدفع');
});

const submit = asyncHandler(async (req, res) => {
  const data = submitSchema.parse(req.body);
  const payment = await service.submitPayment(req.user.id, data);
  return response.created(res, payment, 'تم إرسال الإيصال للمراجعة');
});

const myPayments = asyncHandler(async (req, res) => {
  const payments = await service.getMyPayments(req.user.id);
  return response.success(res, payments, 'مدفوعاتي');
});

const getById = asyncHandler(async (req, res) => {
  const isAdmin = req.roles.includes('admin') || req.roles.includes('accountant');
  const payment = await service.getPaymentById(req.params.id, req.user.id, isAdmin);
  if (!payment) return response.error(res, 'الدفعة غير موجودة', 404, 'NOT_FOUND');
  return response.success(res, payment);
});

const pending = asyncHandler(async (req, res) => {
  const payments = await service.listPendingPayments();
  return response.success(res, payments, 'دفعات بانتظار المراجعة');
});

const approve = asyncHandler(async (req, res) => {
  const result = await service.approvePayment(req.params.id, req.user.id);
  return response.success(res, result, 'تم اعتماد الدفع');
});

const reject = asyncHandler(async (req, res) => {
  const { reason } = rejectSchema.parse(req.body);
  const result = await service.rejectPayment(req.params.id, req.user.id, reason);
  return response.success(res, result, 'تم رفض الدفع');
});

module.exports = { listMethods, submit, myPayments, getById, pending, approve, reject };
