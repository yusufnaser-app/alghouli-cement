const express = require('express');
const controller = require('./accounting.controller');
const fulfillment = require('./order-fulfillment.controller');
const { authenticate, requireRoles } = require('../../middlewares/auth');

const router = express.Router();
router.use(authenticate);
router.use(requireRoles('admin', 'accountant'));

router.get('/status', controller.status);
router.get('/fulfillment/awaiting-posting', fulfillment.awaitingPosting);
router.get('/fulfillment/orders/:orderId', fulfillment.getOrder);
router.post('/fulfillment/orders/:orderId/post', fulfillment.postOrder);
router.get('/sync-queue', controller.listQueue);
router.post('/sync-queue/:id/retry', controller.retry);

module.exports = router;
