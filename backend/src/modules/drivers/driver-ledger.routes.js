const express = require('express');
const controller = require('./driver-ledger.controller');
const driversController = require('./drivers.controller');
const adminController = require('./driver-admin.controller');
const { authenticate, requireRoles, requirePermission } = require('../../middlewares/auth');

const router = express.Router();
router.use(authenticate);

// ============ السائق ============
router.get('/me/profile', requireRoles('driver'), controller.myProfile);
router.put('/me/profile', requireRoles('driver'), controller.updateMyProfile);
router.get('/me/summary', requireRoles('driver'), controller.mySummary);
router.get('/me/ledger', requireRoles('driver'), controller.myLedger);
router.get('/me/vehicles', requireRoles('driver'), driversController.myVehicles);

// ============ Admin — اعتماد السائقين ============
router.get('/admin/pending', requireRoles('admin'), adminController.listPending);
router.get('/admin/all', requireRoles('admin', 'transport'), adminController.listAll);
router.patch('/admin/:id/approve', requireRoles('admin'), adminController.approve);
router.patch('/admin/:id/reject', requireRoles('admin'), adminController.reject);
router.patch('/admin/:id/suspend', requireRoles('admin'), adminController.suspend);

// ============ الموظف ============
router.get('/', requirePermission('transport.view', 'ledger.view'), controller.list);
router.get('/:driverId/ledger', requirePermission('ledger.view'), controller.getLedger);
router.get('/:driverId/summary', requirePermission('ledger.view'), controller.getSummary);
router.post('/:driverId/payments', requirePermission('ledger.create'), controller.recordPayment);
router.post('/:driverId/advances', requirePermission('ledger.create'), controller.recordAdvance);
router.post('/:driverId/deductions', requirePermission('ledger.create'), controller.recordDeduction);

module.exports = router;
