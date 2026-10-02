const express = require('express');
const controller = require('./invoices.controller');
const { authenticate, requireRoles, requirePermission } = require('../../middlewares/auth');

const router = express.Router();

router.use(authenticate);

router.get('/', controller.list);
router.get('/:id/print', controller.printHtml);
router.get('/:id', controller.getById);
router.post('/order/:orderId/generate', requirePermission('accounting.post'), controller.generateForOrder);

module.exports = router;
