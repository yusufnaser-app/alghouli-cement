const { z } = require('zod');
const asyncHandler = require('../../utils/asyncHandler');
const response = require('../../utils/response');
const authService = require('./auth.service');

const registerSchema = z.object({
  fullName: z.string().min(3).max(150),
  phone: z.string().regex(/^967[0-9]{9}$/, 'رقم الهاتف بصيغة 967XXXXXXXXX'),
  customerType: z.enum(['individual', 'trader', 'distributor', 'contractor']),
  governorate: z.string().min(2).max(100),
  area: z.string().max(100).optional(),
  address: z.string().optional(),
});

const verifyOtpSchema = z.object({
  phone: z.string().regex(/^967[0-9]{9}$/),
  otp: z.string().length(6),
});

const loginSchema = z.object({
  phone: z.string().regex(/^967[0-9]{9}$/),
  password: z.string().min(6),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

const register = asyncHandler(async (req, res) => {
  const data = registerSchema.parse(req.body);
  const result = await authService.register(data);
  return response.created(res, result, 'تم إنشاء الحساب، يرجى التحقق من الرمز');
});

const verifyOtp = asyncHandler(async (req, res) => {
  const { phone, otp } = verifyOtpSchema.parse(req.body);
  const result = await authService.verify(phone, otp);
  return response.success(res, result, 'تم التحقق بنجاح');
});

const login = asyncHandler(async (req, res) => {
  const { phone, password } = loginSchema.parse(req.body);
  const result = await authService.login(phone, password);
  return response.success(res, result, 'تم تسجيل الدخول');
});

const refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = refreshSchema.parse(req.body);
  const result = await authService.refresh(refreshToken);
  return response.success(res, result, 'تم تحديث التوكن');
});

const me = asyncHandler(async (req, res) => {
  return response.success(res, { ...req.user, roles: req.roles });
});

module.exports = { register, verifyOtp, login, refresh, me };
