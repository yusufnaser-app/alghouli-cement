const asyncHandler = require('../../utils/asyncHandler');
const response = require('../../utils/response');
const service = require('./accounting-statements.service');

const page = (req) => ({
  limit: Math.min(Math.max(Number(req.query.limit) || 100, 1), 500),
  offset: Math.max(Number(req.query.offset) || 0, 0),
});

const myStatement = asyncHandler(async (req, res) => {
  const data = await service.getCustomerStatementByUserId(req.user.id, page(req));
  if (!data) return response.error(res, 'لا يوجد حساب عميل مرتبط بهذا المستخدم', 404);
  return response.success(res, data, 'كشف حسابك');
});

const customerStatement = asyncHandler(async (req,res) => {
  const data = await service.getCustomerStatement(req.params.customerId, page(req));
  if (!data) return response.error(res,'العميل غير موجود',404);
  return response.success(res,data,'كشف حساب التاجر');
});

const driverStatement = asyncHandler(async (req,res) => {
  const data = await service.getDriverStatement(req.params.driverId, page(req));
  if (!data) return response.error(res,'السائق غير موجود',404);
  return response.success(res,data,'كشف حساب السائق');
});

const factoryStatement = asyncHandler(async (req,res) => {
  const data = await service.getFactoryStatement(req.params.factoryId, page(req));
  if (!data) return response.error(res,'المصنع غير موجود',404);
  return response.success(res,data,'كشف حركة المصنع');
});

module.exports = { myStatement, customerStatement, driverStatement, factoryStatement };
