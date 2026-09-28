const express = require('express');
const controller = require('./crm.controller');
const { authenticate, requireRoles } = require('../../middlewares/auth');

const router = express.Router();
router.use(authenticate);
router.use(requireRoles('admin', 'sales'));

router.get('/customers', controller.list);
router.get('/customers.csv', controller.exportCsv);

module.exports = router;
