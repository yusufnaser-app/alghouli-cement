const express = require('express');
const controller = require('./sms.controller');
const { authenticate, requireRoles } = require('../../middlewares/auth');

const router = express.Router();
router.use(authenticate);
router.use(requireRoles('admin'));

router.get('/status', controller.status);
router.get('/messages', controller.list);
router.post('/messages/process', controller.processQueue);
router.post('/messages/:id/retry', controller.retry);
router.get('/templates', controller.templates);
router.put('/templates/:id', controller.updateTemplate);

module.exports = router;
