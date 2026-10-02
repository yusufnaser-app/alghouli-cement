const express = require('express');
const controller = require('./transport.controller');
const { authenticate, requireRoles, requirePermission } = require('../../middlewares/auth');

const router = express.Router();

// عام — حساب النقل (يمكن استخدامه بدون توثيق)
router.get('/calculate', controller.calculate);

router.use(authenticate);
router.get('/rates', requirePermission('pricing.view'), controller.listRates);
router.post('/rates', requirePermission('pricing.update'), controller.createRate);
router.put('/rates/:id', requirePermission('pricing.update'), controller.updateRate);
router.delete('/rates/:id', requirePermission('pricing.update'), controller.removeRate);

module.exports = router;
