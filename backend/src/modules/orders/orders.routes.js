const express = require('express');
const controller = require('./orders.controller');
const { authenticate, requireRoles } = require('../../middlewares/auth');

const router = express.Router();

router.use(authenticate);

// للعميل
router.post('/', controller.create);
router.get('/', controller.list);
router.get('/credit-check', controller.checkCredit);
router.get('/:id', controller.getById);
router.patch('/:id/cancel', controller.cancel);

// للمدير فقط
router.get('/admin/pending-credit', requireRoles('admin'), controller.listPendingCredit);
router.patch('/admin/:id/approve-credit', requireRoles('admin'), controller.approveCredit);
router.patch('/admin/:id/reject-credit', requireRoles('admin'), controller.rejectCredit);

module.exports = router;
