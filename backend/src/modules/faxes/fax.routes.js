const express = require('express');
const controller = require('./fax.controller');
const destinations = require('./destination.controller');
const { authenticate, requireRoles, requirePermission } = require('../../middlewares/auth');

const router = express.Router();
router.use(authenticate);

// السائق
router.post('/request', requireRoles('driver'), controller.request);
router.get('/me', requireRoles('driver'), controller.myFaxes);
router.get('/me/current', requireRoles('driver'), controller.currentTrip);
router.patch('/:id/enter-factory', requireRoles('driver'), controller.enterFactory);
router.patch('/:id/confirm-loading', requireRoles('driver'), controller.confirmLoading);
router.patch('/:id/mark-delivered', requireRoles('driver'), controller.driverMarkDelivered);
router.patch('/:id/set-transport-rate', requirePermission('transport.update', 'pricing.update'), controller.setTransportRate);

// التاجر
router.post('/request-for-driver', requireRoles('customer'), controller.request);

// الموظف
router.post('/staff/create', requirePermission('loading.create', 'transport.assign'), controller.staffRequest);
router.get('/pending', requirePermission('loading.view', 'transport.view'), controller.pending);
router.get('/admin/awaiting-route', requirePermission('transport.view'), controller.awaitingRoute);
router.patch('/:id/route-transport', requirePermission('transport.update', 'pricing.update'), controller.setRouteTransport);
router.get('/pending-route-price', requirePermission('transport.view'), controller.pendingRoutePrice);
router.get('/export', requirePermission('reports.export', 'loading.view'), controller.exportCsv);
router.get('/operations-center', requirePermission('loading.view', 'transport.view'), controller.operationsCenter);
router.patch('/:id/approve', requirePermission('loading.create'), controller.approve);
router.patch('/:id/issue', requirePermission('loading.create'), controller.issue);
router.patch('/:id/issue-and-notify', requirePermission('loading.create'), controller.issueAndNotify);
router.patch('/:id/loading', requirePermission('loading.confirm'), controller.recordLoading);
router.patch('/:id/cancel', requirePermission('loading.update'), controller.cancel);

// عام
// ═══ Multi-Drop Destinations ═══
router.get('/warehouses/list', requireRoles('admin','transport','sales'), destinations.warehouses);
router.get('/traders/list', requireRoles('admin','transport','sales'), destinations.traders);
router.get('/:id/destinations', destinations.list);
router.put('/:id/destinations', requireRoles('admin','transport','sales'), destinations.replace);
router.patch('/:id/destinations/:destId/deliver', requireRoles('driver'), destinations.deliver);

// ═══ عام ═══
router.get('/:id', controller.getById);

module.exports = router;
