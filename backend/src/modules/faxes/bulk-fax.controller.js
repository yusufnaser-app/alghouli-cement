'use strict';
const { z } = require('zod');
const asyncHandler = require('../../utils/asyncHandler');
const response = require('../../utils/response');
const service = require('./bulk-fax.service');

const bulkSchema = z.object({
  items: z.array(z.object({
    driverId: z.string().uuid(),
    driverName: z.string().optional(),
    vehicleId: z.string().uuid(),
    factoryId: z.string().uuid(),
    quantity: z.number().positive(),
    notes: z.string().max(500).optional(),
  })).min(1),
});

/** GET /bulk-faxes/suggestions — اقتراحات الفاكسات الجماعية */
const getSuggestions = asyncHandler(async (req, res) => {
  const suggestions = await service.getSuggestions(req.query);
  return response.success(res, suggestions, 'قائمة السائقين');
});

/** GET /bulk-faxes — قائمة الفاكسات الجماعية */
const list = asyncHandler(async (req, res) => {
  const rows = await service.listBulkGroups(req.query);
  return response.success(res, rows, 'الفاكسات الجماعية');
});

/** POST /bulk-faxes/create — إنشاء فاكسات جماعية */
const createBulk = asyncHandler(async (req, res) => {
  const data = bulkSchema.parse(req.body);
  const result = await service.createBulkFaxes(data.items, req.user.id);
  return response.created(res, result, 'تم إنشاء الفاكسات');
});

module.exports = { getSuggestions, list, createBulk };
