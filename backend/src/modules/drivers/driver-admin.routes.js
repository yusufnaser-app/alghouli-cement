const express = require('express');
const controller = require('./driver-admin.controller');
const { authenticate, requireRoles } = require('../../middlewares/auth');

const router = express.Router();
router.use(authenticate);
router.use(requireRoles('admin', 'accountant', 'transport'));

router.get('/', controller.listWithBalance);
router.post('/:id/payments', controller.payDriver);
router.post('/:id/advances', controller.advanceDriver);
router.post('/:id/deductions', controller.deductDriver);
router.get('/:id/statement', controller.getStatement);

module.exports = router;
