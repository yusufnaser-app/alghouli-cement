const express = require('express');
const controller = require('./transport.controller');
const { authenticate, requireRoles } = require('../../middlewares/auth');

const router = express.Router();

// عام — حساب النقل (يمكن استخدامه بدون توثيق)
router.get('/calculate', controller.calculate);

router.use(authenticate);
router.get('/rates', requireRoles('admin', 'sales'), controller.listRates);
router.post('/rates', requireRoles('admin'), controller.createRate);
router.put('/rates/:id', requireRoles('admin'), controller.updateRate);
router.delete('/rates/:id', requireRoles('admin'), controller.removeRate);

module.exports = router;
