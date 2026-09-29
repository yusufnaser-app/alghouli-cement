const { z } = require('zod');
const asyncHandler = require('../../utils/asyncHandler');
const response = require('../../utils/response');
const service = require('./ceilings.service');

const ruleSchema = z.object({
  nameAr: z.string().min(2).max(150),
  period: z.enum(['daily', 'monthly']),
  customerId: z.string().uuid().nullable().optional(),
  sourceId: z.string().uuid().nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  maxBags: z.number().positive().nullable().optional(),
  maxAmount: z.number().positive().nullable().optional(),
  isActive: z.boolean().optional(),
}).refine((v) => v.maxBags != null || v.maxAmount != null, { message: 'يجب تحديد سقف بالكيس أو بالقيمة على الأقل' });

const listRules = asyncHandler(async (req, res) => response.success(res, await service.listRules()));
const createRule = asyncHandler(async (req, res) =>
  response.created(res, await service.createRule(ruleSchema.parse(req.body), req.user.id), 'تمت إضافة السقف'));
const updateRule = asyncHandler(async (req, res) =>
  response.success(res, await service.updateRule(req.params.id, ruleSchema.partial().parse(req.body)), 'تم التحديث'));

const listOverrides = asyncHandler(async (req, res) => response.success(res, await service.listOverrides(req.query.status)));
const decideOverride = asyncHandler(async (req, res) => {
  const approve = req.body.approve === true;
  return response.success(res, await service.decideOverride(req.params.id, approve, req.user.id),
    approve ? 'تمت الموافقة الاستثنائية' : 'تم الرفض');
});

const overrideSchema = z.object({
  ceilingId: z.string().uuid().nullable().optional(),
  requestedBags: z.number().positive().nullable().optional(),
  requestedAmount: z.number().positive().nullable().optional(),
  reason: z.string().max(500).optional(),
});

const requestOverride = asyncHandler(async (req, res) => {
  const { query } = require('../../config/db');
  const cust = await query(`SELECT id FROM customers WHERE user_id = $1`, [req.user.id]);
  if (!cust.rows.length) return response.error(res, 'العميل غير موجود', 404);
  const data = overrideSchema.parse(req.body);
  const r = await service.requestOverride({ query }, { customerId: cust.rows[0].id, ...data });
  return response.created(res, r, 'تم إرسال طلب الموافقة الاستثنائية للإدارة');
});

module.exports = { listRules, createRule, updateRule, listOverrides, decideOverride, requestOverride };
