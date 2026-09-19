const asyncHandler = require('../../utils/asyncHandler');
const response = require('../../utils/response');
const service = require('./invoices.service');

const list = asyncHandler(async (req, res) => {
  const invoices = await service.getMyInvoices(req.user.id);
  return response.success(res, invoices, 'قائمة الفواتير');
});

const getById = asyncHandler(async (req, res) => {
  const isAdmin = req.roles.includes('admin') || req.roles.includes('accountant');
  const invoice = await service.getInvoiceById(req.params.id, req.user.id, isAdmin);
  if (!invoice) return response.error(res, 'الفاتورة غير موجودة', 404, 'NOT_FOUND');
  return response.success(res, invoice);
});

const generateForOrder = asyncHandler(async (req, res) => {
  const invoice = await service.generateInvoiceForOrder(req.params.orderId);
  return response.created(res, invoice, 'تم إنشاء الفاتورة');
});

module.exports = { list, getById, generateForOrder };
