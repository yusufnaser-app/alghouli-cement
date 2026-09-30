const express = require('express');
const controller = require('./order-fulfillment.controller');
const { authenticate, requireRoles } = require('../../middlewares/auth');
const router = express.Router();
router.use(authenticate, requireRoles('admin','accountant'));
router.get('/awaiting-posting', controller.awaitingPosting);
router.get('/orders/:orderId', controller.getOrder);
router.post('/orders/:orderId/post', controller.postOrder);
module.exports=router;
