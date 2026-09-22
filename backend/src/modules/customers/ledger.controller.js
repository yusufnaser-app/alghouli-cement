const asyncHandler = require('../../utils/asyncHandler');
const response = require('../../utils/response');
const service = require('./ledger.service');
const { query } = require('../../config/db');

const getMyLedger = asyncHandler(async (req, res) => {
  const c = await query(`SELECT id FROM customers WHERE user_id = $1`, [req.user.id]);
  if (c.rows.length === 0) return response.error(res, 'العميل غير موجود', 404);
  const ledger = await service.getLedger(c.rows[0].id, req.query);
  return response.success(res, ledger, 'كشف حسابي');
});

const getMySummary = asyncHandler(async (req, res) => {
  const c = await query(`SELECT id FROM customers WHERE user_id = $1`, [req.user.id]);
  if (c.rows.length === 0) return response.error(res, 'العميل غير موجود', 404);
  const summary = await service.getSummary(c.rows[0].id);
  return response.success(res, summary, 'ملخص حسابي');
});

const getCustomerLedger = asyncHandler(async (req, res) => {
  const ledger = await service.getLedger(req.params.id, req.query);
  return response.success(res, ledger, 'كشف حساب العميل');
});

const getCustomerSummary = asyncHandler(async (req, res) => {
  const summary = await service.getSummary(req.params.id);
  return response.success(res, summary);
});

const recordPayment = asyncHandler(async (req, res) => {
  const { amount, method, reference, notes } = req.body;
  const result = await service.recordPayment(req.params.id, {
    amount: parseFloat(amount),
    method,
    reference,
    notes,
    createdBy: req.user.id,
  });
  return response.created(res, result, 'تم تسجيل الدفعة');
});

const listCustomers = asyncHandler(async (req, res) => {
  const list = await service.listCustomersWithBalance(req.query);
  return response.success(res, list, 'قائمة العملاء');
});

module.exports = {
  getMyLedger,
  getMySummary,
  getCustomerLedger,
  getCustomerSummary,
  recordPayment,
  listCustomers,
};
