'use strict';
const asyncHandler = require('../../utils/asyncHandler');
const response = require('../../utils/response');
const { query } = require('../../config/db');
const { factoryReport } = require('./factory-report.service');

const report = asyncHandler(async (req, res) => {
  const { factoryId, from, to } = req.query;
  if (!factoryId) return response.error(res, 'اختر المصنع', 422, 'VALIDATION_ERROR');
  const data = await factoryReport({ query }, factoryId, from, to);
  return response.success(res, data, 'تقرير فاكسات المصنع');
});

module.exports = { report };
