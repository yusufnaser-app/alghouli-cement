const express = require('express');
const controller = require('./driver-ledger.controller');
const driversController = require('./drivers.controller');
const adminController = require('./driver-admin.controller');
const { authenticate, requireRoles } = require('../../middlewares/auth');

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
router.get('/', requireRoles('admin', 'transport', 'accountant'), controller.list);
router.get('/:driverId/ledger', requireRoles('admin', 'transport', 'accountant'), controller.getLedger);
router.get('/:driverId/summary', requireRoles('admin', 'transport', 'accountant'), controller.getSummary);
router.post('/:driverId/payments', requireRoles('admin', 'accountant'), controller.recordPayment);
router.post('/:driverId/advances', requireRoles('admin', 'accountant'), controller.recordAdvance);
router.post('/:driverId/deductions', requireRoles('admin', 'accountant'), controller.recordDeduction);

module.exports = router;
