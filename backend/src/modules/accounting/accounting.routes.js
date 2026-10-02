const express = require('express');
const controller = require('./accounting.controller');
const statements = require('./accounting-statements.controller');
const fulfillment = require('./order-fulfillment.controller');
const adminCtl = require('./accounting-admin.controller');
const { authenticate, requirePermission } = require('../../middlewares/auth');

const router = express.Router();
router.use(authenticate);

// كشف حساب المستخدم نفسه فقط (الهوية من التوكن).
router.get('/my-statement', requirePermission('statements.view_own'), statements.myStatement);
router.get('/my-statement/print', requirePermission('statements.view_own'), statements.myStatementPrint);

// كشوف الحسابات والتقارير
router.get('/customer/:customerId/statement', requirePermission('statements.view'), statements.customerStatement);
router.get('/customer/:customerId/statement/print', requirePermission('statements.export'), adminCtl.printCustomer);
router.get('/customer/:customerId/summary', requirePermission('ledger.view'), adminCtl.customerBalances);
router.get('/customer/:customerId/rebuild', requirePermission('accounting.integrity_check'), adminCtl.rebuild);
router.get('/driver/:driverId/statement', requirePermission('ledger.view'), statements.driverStatement);
router.get('/factory/:factoryId/statement', requirePermission('ledger.view'), statements.factoryStatement);

// القيود: افتتاحي / دفعة على الحساب / تسوية / عكس
router.post('/customer/:customerId/opening-balance', requirePermission('ledger.create'), adminCtl.openingBalance);
router.post('/customer/:customerId/payments', requirePermission('ledger.create'), adminCtl.manualPayment);
router.post('/customer/:customerId/adjustments', requirePermission('ledger.adjust'), adminCtl.adjustment);
router.post('/ledger/:entryId/reverse', requirePermission('ledger.reverse'), adminCtl.reverseEntry);

// الترحيل والتسوية بعد الترحيل
router.get('/fulfillment/awaiting-posting', requirePermission('accounting.post'), fulfillment.awaitingPosting);
router.get('/fulfillment/orders/:orderId', requirePermission('ledger.view'), fulfillment.getOrder);
router.post('/fulfillment/orders/:orderId/post', requirePermission('accounting.post'), fulfillment.postOrder);
router.post('/fulfillment/orders/:orderId/adjust', requirePermission('ledger.adjust'), adminCtl.adjustOrder);
router.post('/fulfillment/orders/:orderId/reverse', requirePermission('ledger.reverse'), adminCtl.reverseOrder);

// التدقيق
router.get('/integrity-check', requirePermission('accounting.integrity_check'), adminCtl.integrityCheck);
router.get('/audit-log', requirePermission('audit.view'), adminCtl.auditLog);

router.get('/status', requirePermission('ledger.view'), controller.status);
router.get('/sync-queue', requirePermission('ledger.view'), controller.listQueue);
router.post('/sync-queue/:id/retry', requirePermission('ledger.adjust'), controller.retry);

module.exports = router;
