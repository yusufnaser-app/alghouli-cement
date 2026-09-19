const express = require('express');
const controller = require('./payments.controller');
const { authenticate, requireRoles } = require('../../middlewares/auth');

const router = express.Router();

// طرق الدفع - عامة
router.get('/methods', controller.listMethods);

// باقي المسارات - تحتاج توثيق
router.use(authenticate);

router.post('/', controller.submit);
router.get('/me', controller.myPayments);
router.get('/pending', requireRoles('accountant'), controller.pending);
router.get('/:id', controller.getById);
router.patch('/:id/approve', requireRoles('accountant'), controller.approve);
router.patch('/:id/reject', requireRoles('accountant'), controller.reject);

module.exports = router;
