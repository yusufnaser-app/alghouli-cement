const asyncHandler = require('../../utils/asyncHandler');
const response = require('../../utils/response');
const authService = require('./auth.service');
const {
  registerSchema,
  verifyOtpSchema,
  loginSchema,
  refreshSchema,
} = require('./auth.validator');

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
