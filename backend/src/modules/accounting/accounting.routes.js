const express = require('express');
const controller = require('./accounting.controller');
const statements = require('./accounting-statements.controller');
const fulfillment = require('./order-fulfillment.controller');
const { authenticate, requireRoles } = require('../../middlewares/auth');

const router = express.Router();
router.use(authenticate);

// كشف حساب المستخدم نفسه: يسمح للتاجر/العميل فقط بالوصول إلى حسابه.
router.get('/my-statement', requireRoles('customer','trader','contractor'), statements.myStatement);

// بقية وظائف المحاسبة إدارية.
router.use(requireRoles('admin', 'accountant'));
router.get('/status', controller.status);
router.get('/fulfillment/awaiting-posting', fulfillment.awaitingPosting);
router.get('/fulfillment/orders/:orderId', fulfillment.getOrder);
router.post('/fulfillment/orders/:orderId/post', fulfillment.postOrder);
router.get('/customer/:customerId/statement', statements.customerStatement);
router.get('/driver/:driverId/statement', statements.driverStatement);
router.get('/factory/:factoryId/statement', statements.factoryStatement);
router.get('/sync-queue', controller.listQueue);
router.post('/sync-queue/:id/retry', controller.retry);

module.exports = router;
