const express = require('express');
const controller = require('./order-fulfillment.controller');
const { authenticate, requirePermission } = require('../../middlewares/auth');
const router = express.Router();
router.use(authenticate);
router.get('/awaiting-posting', requirePermission('accounting.post'), controller.awaitingPosting);
router.get('/orders/:orderId', requirePermission('ledger.view'), controller.getOrder);
router.post('/orders/:orderId/post', requirePermission('accounting.post'), controller.postOrder);
module.exports=router;
