'use strict';
const { z } = require('zod');
const asyncHandler = require('../../utils/asyncHandler');
const response = require('../../utils/response');
const ledgerService = require('../customers/ledger.service');
const fulfillment = require('./order-fulfillment.service');
const integrity = require('./integrity.service');
const audit = require('../audit/audit.service');
const stmt = require('./accounting-statements.service');

const amt = z.union([z.string(), z.number()]).refine((v) => /^\d+(\.\d{1,2})?$/.test(String(v)) && Number(v) > 0, 'مبلغ غير صالح');
const cur = z.enum(['YER', 'USD', 'SAR']);
const reason = z.string().trim().min(3).max(500);
const ctx = (req) => audit.requestContext(req);

const openingBalance = asyncHandler(async (req, res) => {
  const b = z.object({ amount: amt, side: z.enum(['debit', 'credit']), currency: cur, asOf: z.string().optional(), notes: z.string().max(300).optional() }).parse(req.body);
  return response.created(res, await ledgerService.setOpeningBalance(req.params.customerId, b, req.user.id, ctx(req)), 'تم تسجيل الرصيد الافتتاحي');
});
const adjustment = asyncHandler(async (req, res) => {
  const b = z.object({ amount: amt, side: z.enum(['debit', 'credit']), currency: cur, reason, reference: z.string().max(100).optional(), orderId: z.string().uuid().optional() }).parse(req.body);
  return response.created(res, await ledgerService.manualAdjustment(req.params.customerId, b, req.user.id, ctx(req)), 'تم تسجيل التسوية');
});
const manualPayment = asyncHandler(async (req, res) => {
  const b = z.object({ amount: amt, currency: cur, method: z.string().max(50).optional(), reference: z.string().trim().min(1).max(100),
    notes: z.string().max(300).optional(), orderId: z.string().uuid().optional(), idempotencyKey: z.string().max(80).optional() }).parse(req.body);
  return response.created(res, await ledgerService.recordPayment(req.params.customerId, { ...b, createdBy: req.user.id }, ctx(req)), 'تم تسجيل الدفعة');
});
const reverseEntry = asyncHandler(async (req, res) => {
  const b = z.object({ reason }).parse(req.body);
  return response.success(res, await ledgerService.reverseEntry(req.params.entryId, b, req.user.id, ctx(req)), 'تم عكس القيد');
});
const adjustOrder = asyncHandler(async (req, res) => {
  const b = z.object({
    reason,
    loadedQuantity: z.union([z.string(), z.number()]).optional(),
    transportAmount: z.union([z.string(), z.number()]).optional(),
    items: z.array(z.object({ orderItemId: z.string().uuid(), unitPrice: z.union([z.string(), z.number()]).optional(), discount: z.union([z.string(), z.number()]).optional() })).optional(),
  }).parse(req.body);
  return response.success(res, await fulfillment.adjustPostedOrder(req.params.orderId, b, req.user.id, ctx(req)), 'تمت التسوية');
});
const reverseOrder = asyncHandler(async (req, res) => {
  const b = z.object({ reason }).parse(req.body);
  return response.success(res, await fulfillment.reverseOrderPosting(req.params.orderId, b, req.user.id, ctx(req)), 'تم عكس ترحيل الطلب');
});
const integrityCheck = asyncHandler(async (req, res) =>
  response.success(res, await integrity.runIntegrityCheck({ customerId: req.query.customerId || null }), 'نتيجة فحص سلامة الحسابات'));
const rebuild = asyncHandler(async (req, res) =>
  response.success(res, await integrity.rebuildCustomerBalance(req.params.customerId), 'إعادة بناء الرصيد'));
const auditLog = asyncHandler(async (req, res) =>
  response.success(res, await audit.listAudit(req.query), 'سجل التدقيق'));
const customerBalances = asyncHandler(async (req, res) =>
  response.success(res, await ledgerService.getSummary(req.params.customerId), 'ملخص الحساب'));
const printCustomer = asyncHandler(async (req, res) => {
  const data = await stmt.getCustomerStatement(req.params.customerId, { from: req.query.from, to: req.query.to, currency: req.query.currency });
  if (!data) return response.error(res, 'العميل غير موجود', 404);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.send(stmt.renderStatementHtml(data));
});

module.exports = { openingBalance, adjustment, manualPayment, reverseEntry, adjustOrder, reverseOrder, integrityCheck, rebuild, auditLog, customerBalances, printCustomer };
