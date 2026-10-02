const express = require('express');
const controller = require('./admin.controller');
const { authenticate, requireRoles, requirePermission } = require('../../middlewares/auth');

const router = express.Router();

router.use(authenticate);

router.get('/dashboard', requireRoles('admin', 'sales', 'accountant'), controller.dashboard);
router.get('/orders', requireRoles('admin', 'sales'), controller.listOrders);
router.get('/customers', requireRoles('admin', 'sales'), controller.listCustomers);
router.patch('/orders/:id/status', requirePermission('orders.update'), controller.updateOrderStatus);

module.exports = router;
