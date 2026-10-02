const express = require('express');
const controller = require('./admin.controller');
const usersController = require('./admin-users.controller');
const { authenticate, requireRoles, requirePermission } = require('../../middlewares/auth');

const router = express.Router();

router.use(authenticate);

router.get('/dashboard', requireRoles('admin', 'sales', 'accountant'), controller.dashboard);
router.get('/orders', requireRoles('admin', 'sales'), controller.listOrders);
router.get('/customers', requireRoles('admin', 'sales'), controller.listCustomers);
router.patch('/orders/:id/status', requirePermission('orders.update'), controller.updateOrderStatus);

// ═══ إدارة المستخدمين ═══
router.get('/users', requirePermission('users.view'), usersController.list);
router.post('/users', requirePermission('users.create'), usersController.create);
router.patch('/users/:id', requirePermission('users.update'), usersController.update);
router.patch('/users/:id/roles', requirePermission('roles.manage'), usersController.setRoles);
router.patch('/users/:id/status', requirePermission('users.disable'), usersController.setStatus);
router.post('/users/:id/reset-password', requirePermission('users.update'), usersController.resetPassword);
router.get('/roles', requirePermission('roles.view'), usersController.listRoles);

module.exports = router;
