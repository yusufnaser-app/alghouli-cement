const express = require('express');
const controller = require('./fax.controller');
const { authenticate, requireRoles } = require('../../middlewares/auth');

const router = express.Router();
router.use(authenticate);

// السائق
router.post('/request', requireRoles('driver'), controller.request);
router.get('/me', requireRoles('driver'), controller.myFaxes);
router.get('/me/current', requireRoles('driver'), controller.currentTrip);
router.patch('/:id/enter-factory', requireRoles('driver'), controller.enterFactory);
router.patch('/:id/confirm-loading', requireRoles('driver'), controller.confirmLoading);

// التاجر
router.post('/request-for-driver', requireRoles('customer'), controller.request);

// الموظف
router.post('/staff/create', requireRoles('transport', 'admin', 'sales'), controller.staffRequest);
router.get('/pending', requireRoles('transport', 'admin'), controller.pending);
router.get('/admin/awaiting-route', requireRoles('admin', 'transport'), controller.awaitingRoute);
router.patch('/:id/route-transport', requireRoles('admin', 'transport'), controller.setRouteTransport);
router.get('/pending-route-price', requireRoles('transport', 'admin'), controller.pendingRoutePrice);
router.patch('/:id/approve', requireRoles('transport', 'admin'), controller.approve);
router.patch('/:id/issue', requireRoles('transport', 'admin'), controller.issue);
router.patch('/:id/issue-and-notify', requireRoles('transport', 'admin'), controller.issueAndNotify);
router.patch('/:id/route', requireRoles('transport', 'admin'), controller.setRoute);
router.patch('/:id/transport', requireRoles('transport', 'admin'), controller.setTransport);
router.patch('/:id/loading', requireRoles('transport', 'admin'), controller.recordLoading);
router.patch('/:id/cancel', requireRoles('transport', 'admin'), controller.cancel);

// عام
router.get('/:id', controller.getById);

module.exports = router;
