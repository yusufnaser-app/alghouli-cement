const asyncHandler = require('../../utils/asyncHandler');
const response = require('../../utils/response');
const service = require('./reports.service');

const getRange = (req) => {
  const to = req.query.to ? new Date(req.query.to) : new Date();
  const from = req.query.from
    ? new Date(req.query.from)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return [from, to];
};

const summary = asyncHandler(async (req, res) => {
  const [from, to] = getRange(req);
  const data = await service.salesSummary(from, to);
  return response.success(res, data, 'ملخص المبيعات');
});

const bySource = asyncHandler(async (req, res) => {
  const [from, to] = getRange(req);
  const data = await service.salesBySource(from, to);
  return response.success(res, data, 'المبيعات حسب المصنع');
});

const byCategory = asyncHandler(async (req, res) => {
  const [from, to] = getRange(req);
  const data = await service.salesByCategory(from, to);
  return response.success(res, data, 'المبيعات حسب النوع');
});

const byPackaging = asyncHandler(async (req, res) => {
  const [from, to] = getRange(req);
  const data = await service.salesByPackaging(from, to);
  return response.success(res, data, 'المبيعات حسب التعبئة');
});

const top = asyncHandler(async (req, res) => {
  const [from, to] = getRange(req);
  const limit = parseInt(req.query.limit || '10', 10);
  const data = await service.topProducts(from, to, limit);
  return response.success(res, data, 'الأكثر مبيعًا');
});

const daily = asyncHandler(async (req, res) => {
  const [from, to] = getRange(req);
  const data = await service.dailySales(from, to);
  return response.success(res, data, 'المبيعات اليومية');
});

const pending = asyncHandler(async (req, res) => {
  const data = await service.pendingPayments();
  return response.success(res, data, 'المدفوعات المعلقة');
});

const lowStock = asyncHandler(async (req, res) => {
  const threshold = parseInt(req.query.threshold || '100', 10);
  const data = await service.lowStock(threshold);
  return response.success(res, data, 'المخزون المنخفض');
});

module.exports = { summary, bySource, byCategory, byPackaging, top, daily, pending, lowStock };
