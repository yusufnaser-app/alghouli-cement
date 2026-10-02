const express = require('express');
const controller = require('./payments.controller');
const { authenticate, requirePermission } = require('../../middlewares/auth');

const router = express.Router();

// طرق الدفع - عامة
router.get('/methods', controller.listMethods);

// باقي المسارات - تحتاج توثيق
router.use(authenticate);

router.post('/', requirePermission('payments.create'), controller.submit);
router.get('/me', controller.myPayments);
router.get('/pending', requirePermission('payments.view'), controller.pending);
router.get('/:id', controller.getById);
router.patch('/:id/approve', requirePermission('payments.approve'), controller.approve);
router.patch('/:id/reject', requirePermission('payments.reject'), controller.reject);
router.patch('/:id/reverse', requirePermission('payments.reverse'), controller.reverse);

module.exports = router;
