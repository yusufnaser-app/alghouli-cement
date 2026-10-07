const { z } = require('zod');
const asyncHandler = require('../../utils/asyncHandler');
const response = require('../../utils/response');
const service = require('./ceilings.service');

const { requestContext } = require('../audit/audit.service');

// الأساس بلا refine (ZodEffects لا يملك partial()) ثم refine للإنشاء فقط
const posInt = z.number().int().positive().nullable().optional();
const ruleBase = z.object({
  nameAr: z.string().min(2).max(150),
  period: z.enum(['daily', 'monthly']),
  customerId: z.string().uuid().nullable().optional(),
  sourceId: z.string().uuid().nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  maxBags: z.number().positive().nullable().optional(),
  maxAmount: z.number().positive().nullable().optional(),
  maxOrders: posInt,
  maxVehicles: posInt,
  isActive: z.boolean().optional(),
  reason: z.string().trim().max(500).optional(), // يُسجَّل في سجل التدقيق
});
const hasLimit = (v) => v.maxBags != null || v.maxAmount != null || v.maxOrders != null || v.maxVehicles != null;
const ruleSchema = ruleBase.refine(hasLimit, { message: 'يجب تحديد حد واحد على الأقل (كيس / قيمة / عدد طلبات / عدد قاطرات)' });
const ruleUpdateSchema = ruleBase.partial();

const listRules = asyncHandler(async (req, res) => response.success(res, await service.listRules()));
const createRule = asyncHandler(async (req, res) =>
  response.created(res, await service.createRule(ruleSchema.parse(req.body), req.user.id, requestContext(req)), 'تمت إضافة السقف'));
const updateRule = asyncHandler(async (req, res) =>
  response.success(res, await service.updateRule(req.params.id, ruleUpdateSchema.parse(req.body), req.user.id, requestContext(req)), 'تم التحديث'));

const setCustomerAction = asyncHandler(async (req, res) => {
  const b = z.object({ action: z.enum(['reject', 'request_approval']), reason: z.string().trim().max(500).optional() }).parse(req.body);
  return response.success(res,
    await service.setCustomerCeilingAction(req.params.customerId, b.action, req.user.id, { reason: b.reason, ...requestContext(req) }),
    'تم تحديث إجراء تجاوز السقف');
});

const listOverrides = asyncHandler(async (req, res) => response.success(res, await service.listOverrides(req.query.status)));
const decideOverride = asyncHandler(async (req, res) => {
  const approve = req.body.approve === true;
  const reason = typeof req.body.reason === 'string' ? req.body.reason.trim().slice(0, 500) : undefined;
  return response.success(res, await service.decideOverride(req.params.id, approve, req.user.id, { reason, ...requestContext(req) }),
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

module.exports = { listRules, createRule, updateRule, setCustomerAction, listOverrides, decideOverride, requestOverride };
