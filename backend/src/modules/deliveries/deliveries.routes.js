const express = require('express');
const controller = require('./deliveries.controller');
const { authenticate, requireRoles, requirePermission } = require('../../middlewares/auth');

const router = express.Router();

router.use(authenticate);

router.get('/pending-assignment', requirePermission('transport.view'), controller.pendingAssignment);

router.get('/available-trips', requirePermission('transport.view'), controller.availableTrips);
router.post('/auto-assign-all', requirePermission('transport.assign'), controller.autoAssignAll);
router.post('/auto-assign/:orderId', requirePermission('transport.assign'), controller.autoAssign);

router.post('/order/:orderId/assign', requirePermission('transport.assign'), controller.assign);
router.get('/order/:orderId', controller.listByOrder);
router.patch('/:id/status', requireRoles('transport', 'driver'), controller.updateStatus);

module.exports = router;
