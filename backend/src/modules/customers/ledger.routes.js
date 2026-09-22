const express = require('express');
const controller = require('./ledger.controller');
const { authenticate, requireRoles } = require('../../middlewares/auth');

const router = express.Router();
router.use(authenticate);

router.get('/me/ledger', controller.getMyLedger);
router.get('/me/summary', controller.getMySummary);

router.get('/', requireRoles('sales', 'accountant'), controller.listCustomers);
router.get('/:id/ledger', requireRoles('sales', 'accountant'), controller.getCustomerLedger);
router.get('/:id/summary', requireRoles('sales', 'accountant'), controller.getCustomerSummary);
router.post('/:id/payments', requireRoles('accountant'), controller.recordPayment);

module.exports = router;
