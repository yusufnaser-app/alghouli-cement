'use strict';
const asyncHandler = require('../../utils/asyncHandler');
const response = require('../../utils/response');
const service = require('./accounting-statements.service');
const engine = require('./accounting.engine');

const page = (req) => ({
  limit: Math.min(Math.max(Number(req.query.limit) || 100, 1), 500),
  offset: Math.max(Number(req.query.offset) || 0, 0),
});
const period = (req) => {
  const { from, to, currency } = req.query;
  [from, to].forEach((d) => { if (d && Number.isNaN(new Date(d).getTime())) { const e = new Error('تاريخ غير صالح'); e.status = 400; throw e; } });
  if (currency) engine.assertCurrency(currency);
  return { from: from || null, to: to || null, currency: currency || null };
};

// المستخدم يرى حسابه فقط (العميل يُحدَّد من التوكن، لا من معامل في الطلب)
const myStatement = asyncHandler(async (req, res) => {
  const data = await service.getCustomerStatementByUserId(req.user.id, period(req));
  if (!data) return response.error(res, 'لا يوجد حساب عميل مرتبط بهذا المستخدم', 404);
  return response.success(res, data, 'كشف حسابك');
});
const myStatementPrint = asyncHandler(async (req, res) => {
  const data = await service.getCustomerStatementByUserId(req.user.id, period(req));
  if (!data) return response.error(res, 'لا يوجد حساب عميل مرتبط بهذا المستخدم', 404);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.send(service.renderStatementHtml(data));
});
const customerStatement = asyncHandler(async (req, res) => {
  const data = await service.getCustomerStatement(req.params.customerId, period(req));
  if (!data) return response.error(res, 'العميل غير موجود', 404);
  return response.success(res, data, 'كشف حساب التاجر');
});
const driverStatement = asyncHandler(async (req, res) => {
  const data = await service.getDriverStatement(req.params.driverId, page(req));
  if (!data) return response.error(res, 'السائق غير موجود', 404);
  return response.success(res, data, 'كشف حساب السائق');
});
const factoryStatement = asyncHandler(async (req, res) => {
  const data = await service.getFactoryStatement(req.params.factoryId, page(req));
  if (!data) return response.error(res, 'المصنع غير موجود', 404);
  return response.success(res, data, 'كشف حركة المصنع');
});

module.exports = { myStatement, myStatementPrint, customerStatement, driverStatement, factoryStatement };
