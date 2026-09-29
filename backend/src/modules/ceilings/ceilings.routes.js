const express = require('express');
const controller = require('./ceilings.controller');
const { authenticate, requireRoles } = require('../../middlewares/auth');

const router = express.Router();
router.use(authenticate);

router.post('/overrides', requireRoles('customer'), controller.requestOverride);

router.use(requireRoles('admin', 'sales'));
router.get('/rules', controller.listRules);
router.post('/rules', controller.createRule);
router.put('/rules/:id', controller.updateRule);
router.get('/overrides', controller.listOverrides);
router.patch('/overrides/:id/decide', requireRoles('admin'), controller.decideOverride);

module.exports = router;
