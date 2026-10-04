'use strict';
const { z } = require('zod');
const asyncHandler = require('../../utils/asyncHandler');
const response = require('../../utils/response');
const service = require('./destination.service');
const { pool } = require('../../config/db');

const destinationSchema = z.object({
  destinationType: z.enum(['trader', 'warehouse']),
  traderId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
  quantity: z.number().positive(),
  unit: z.enum(['bag', 'ton']).optional(),
  label: z.string().max(150).optional(),
  governorate: z.string().max(100).optional(),
  area: z.string().max(100).optional(),
  addressText: z.string().max(500).optional(),
  contactPhone: z.string().max(20).optional(),
  contactName: z.string().max(150).optional(),
  notes: z.string().max(500).optional(),
});

const replaceSchema = z.object({
  destinations: z.array(destinationSchema).min(1).max(20),
});

const list = asyncHandler(async (req, res) => {
  const data = await service.listDestinations(req.params.id);
  return response.success(res, data, 'وجهات التسليم');
});

const replace = asyncHandler(async (req, res) => {
  const { destinations } = replaceSchema.parse(req.body);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await service.replaceDestinations(client, req.params.id, destinations, req.user.id);
    await client.query('COMMIT');
    return response.success(res, result, 'تم حفظ الوجهات');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

const deliver = asyncHandler(async (req, res) => {
  const result = await service.deliverDestination(req.params.destId, req.user.id);
  return response.success(res, result, 'تم تسجيل التسليم');
});

const warehouses = asyncHandler(async (req, res) => {
  const data = await service.listWarehouses();
  return response.success(res, data, 'المستودعات');
});

const traders = asyncHandler(async (req, res) => {
  const data = await service.listTraders();
  return response.success(res, data, 'التجار');
});

module.exports = { list, replace, deliver, warehouses, traders };
