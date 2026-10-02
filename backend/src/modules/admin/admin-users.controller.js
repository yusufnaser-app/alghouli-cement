'use strict';
const { z } = require('zod');
const asyncHandler = require('../../utils/asyncHandler');
const response = require('../../utils/response');
const service = require('./admin-users.service');

const createSchema = z.object({
  full_name: z.string().min(3).max(150),
  phone: z.string().regex(/^\d{9,15}$/),
  email: z.string().email().max(150).optional().nullable(),
  password: z.string().min(6).max(100).optional(),
  user_type: z.enum(['staff', 'driver', 'customer']),
  roles: z.array(z.string()).optional(),
});

const updateSchema = z.object({
  full_name: z.string().min(3).max(150).optional(),
  email: z.string().email().max(150).optional().nullable(),
  status: z.enum(['active', 'inactive', 'suspended', 'blocked']).optional(),
  account_status: z.string().max(30).optional(),
});

const rolesSchema = z.object({
  roles: z.array(z.string()).min(1).max(10),
});

const statusSchema = z.object({
  status: z.enum(['active', 'inactive', 'suspended', 'blocked']),
});

const passwordSchema = z.object({
  password: z.string().min(6).max(100),
});

const list = asyncHandler(async (req, res) => {
  const data = await service.listUsers({
    userType: req.query.user_type,
    status: req.query.status,
    search: req.query.search,
    role: req.query.role,
  });
  return response.success(res, data, 'المستخدمون');
});

const create = asyncHandler(async (req, res) => {
  const data = createSchema.parse(req.body);
  const result = await service.createUser(data, req.user.id);
  return response.created(res, result, 'تم إنشاء المستخدم');
});

const update = asyncHandler(async (req, res) => {
  const data = updateSchema.parse(req.body);
  const result = await service.updateUser(req.params.id, data, req.user.id);
  return response.success(res, result, 'تم التعديل');
});

const setRoles = asyncHandler(async (req, res) => {
  const { roles } = rolesSchema.parse(req.body);
  const result = await service.setRoles(req.params.id, roles, req.user.id);
  return response.success(res, result, 'تم تحديث الأدوار');
});

const setStatus = asyncHandler(async (req, res) => {
  const { status } = statusSchema.parse(req.body);
  const result = await service.setStatus(req.params.id, status, req.user.id);
  return response.success(res, result, 'تم تحديث الحالة');
});

const resetPassword = asyncHandler(async (req, res) => {
  const { password } = passwordSchema.parse(req.body);
  const result = await service.resetPassword(req.params.id, password, req.user.id);
  return response.success(res, result, 'تم إعادة تعيين كلمة المرور');
});

const listRoles = asyncHandler(async (req, res) => {
  const data = await service.listRoles();
  return response.success(res, data, 'الأدوار');
});

module.exports = { list, create, update, setRoles, setStatus, resetPassword, listRoles };
