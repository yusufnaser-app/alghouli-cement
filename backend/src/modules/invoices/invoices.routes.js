const express = require('express');
const controller = require('./invoices.controller');
const { authenticate, requireRoles } = require('../../middlewares/auth');

const router = express.Router();

router.use(authenticate);

router.get('/', controller.list);
router.get('/:id', controller.getById);
router.post('/order/:orderId/generate', requireRoles('accountant'), controller.generateForOrder);

module.exports = router;
