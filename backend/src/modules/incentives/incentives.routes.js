const express = require('express');
const controller = require('./incentives.controller');
const { authenticate, requireRoles } = require('../../middlewares/auth');

const router = express.Router();
router.use(authenticate);
router.use(requireRoles('admin', 'accountant'));

router.get('/report', controller.report);
router.get('/report.csv', controller.reportCsv);
router.get('/rules', controller.listRules);
router.post('/rules', controller.createRule);
router.put('/rules/:id', controller.updateRule);

module.exports = router;
