const express = require('express');
const controller = require('./ledger.controller');
const { authenticate, requireRoles, requirePermission } = require('../../middlewares/auth');

const router = express.Router();
router.use(authenticate);

router.get('/me/ledger', controller.getMyLedger);
router.get('/me/summary', controller.getMySummary);

router.get('/', requirePermission('ledger.view', 'users.view'), controller.listCustomers);
router.get('/:id/ledger', requirePermission('ledger.view'), controller.getCustomerLedger);
router.get('/:id/summary', requirePermission('ledger.view'), controller.getCustomerSummary);
router.post('/:id/payments', requirePermission('ledger.create'), controller.recordPayment);

module.exports = router;
