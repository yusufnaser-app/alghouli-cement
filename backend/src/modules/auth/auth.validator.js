const { z } = require('zod');

const registerSchema = z.object({
  userType: z.enum(['customer', 'driver']).default('customer'),
  fullName: z.string()
    .min(8, 'الاسم الرباعي مطلوب')
    .max(200)
    .refine((v) => v.trim().split(/\s+/).length >= 4, {
      message: 'يجب إدخال الاسم الرباعي كاملًا',
    }),
  phone: z.string().regex(/^967[0-9]{9}$/, 'رقم الهاتف بصيغة 967XXXXXXXXX'),

  // عميل
  customerType: z.enum(['individual', 'trader', 'distributor', 'contractor']).optional(),
  governorate: z.string().min(2).max(100).optional(),
  area: z.string().max(100).optional(),
  address: z.string().optional(),

  // سائق
  password: z.string().min(6, 'كلمة المرور 6 أحرف على الأقل').optional(),
  nationalId: z.string().min(4).max(50).optional(),
  vehicleType: z.enum(['truck_10t', 'truck_20t', 'tanker', 'pickup']).optional(),
  plateNumber: z.string().min(3).max(30).optional(),
});

const verifyOtpSchema = z.object({
  phone: z.string().regex(/^967[0-9]{9}$/),
  otp: z.string().length(6, 'رمز التحقق 6 أرقام'),
});

const loginSchema = z.object({
  phone: z.string().regex(/^967[0-9]{9}$/),
  password: z.string().min(6),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

module.exports = { registerSchema, verifyOtpSchema, loginSchema, refreshSchema };
