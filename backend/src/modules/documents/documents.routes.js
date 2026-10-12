'use strict';
const express = require('express');
const { authenticate } = require('../../middlewares/auth');
const c = require('./documents.controller');

// كل مسار يفحص صلاحيته/ملكيته داخل documents.service (لا صلاحية عامة هنا: العميل يرى مستنداته).
const router = express.Router();
router.use(authenticate);

router.get('/order/:id/purchase-request', c.orderPurchaseRequest);
router.get('/order/:id/value-notice', c.orderValueNotice);
router.get('/fax/:id', c.fax);
router.get('/fax/:id/loading', c.loading);
router.get('/fax/:id/delivery', c.delivery);
router.get('/my/statement', c.myStatement);
router.get('/customer/:customerId/statement', c.customerStatement);
router.get('/driver/:driverId/statement', c.driverStatement);
router.get('/payment/:id/receipt', c.paymentReceipt);
router.get('/reports/:kind', c.report);

module.exports = router;
