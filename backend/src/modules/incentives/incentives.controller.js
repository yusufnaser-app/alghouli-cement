const { z } = require('zod');
const asyncHandler = require('../../utils/asyncHandler');
const response = require('../../utils/response');
const service = require('./incentives.service');
const { sendCsv } = require('../../utils/csv');

const ruleSchema = z.object({
  nameAr: z.string().min(2).max(150),
  period: z.enum(['monthly', 'yearly']),
  unit: z.enum(['bag', 'ton']),
  ratePerUnit: z.number().min(0),
  sourceId: z.string().uuid().nullable().optional(),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  validTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  isActive: z.boolean().optional(),
});

const reportSchema = z.object({
  period: z.enum(['monthly', 'yearly']).default('monthly'),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12).optional(),
}).refine((v) => v.period === 'yearly' || v.month !== undefined, { message: 'الشهر مطلوب للتقرير الشهري' });

const listRules = asyncHandler(async (req, res) => response.success(res, await service.listRules()));
const createRule = asyncHandler(async (req, res) =>
  response.created(res, await service.createRule(ruleSchema.parse(req.body), req.user.id), 'تمت إضافة القاعدة'));
const updateRule = asyncHandler(async (req, res) =>
  response.success(res, await service.updateRule(req.params.id, ruleSchema.partial().parse(req.body)), 'تم التحديث'));

const report = asyncHandler(async (req, res) =>
  response.success(res, await service.report(reportSchema.parse(req.query)), 'تقرير الحوافز'));

const reportCsv = asyncHandler(async (req, res) => {
  const q = reportSchema.parse(req.query);
  const data = await service.report(q);
  const rows = data.factories.map((f) => ({ name: f.factory_name, trips: f.trips, bags: f.total_bags, tons: f.total_tons, amount: f.total_incentive }));
  return sendCsv(res, `incentives-${q.year}${q.month ? '-' + q.month : ''}.csv`, rows, [
    { key: 'name', label: 'المصنع' }, { key: 'trips', label: 'عدد الرحلات' },
    { key: 'bags', label: 'إجمالي الأكياس' }, { key: 'tons', label: 'إجمالي الأطنان' }, { key: 'amount', label: 'الحافز' },
  ]);
});

module.exports = { listRules, createRule, updateRule, report, reportCsv };
