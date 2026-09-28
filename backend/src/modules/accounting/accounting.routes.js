const express = require('express');
const controller = require('./accounting.controller');
const { authenticate, requireRoles } = require('../../middlewares/auth');

const router = express.Router();
router.use(authenticate);
router.use(requireRoles('admin', 'accountant'));

router.get('/status', controller.status);
router.get('/sync-queue', controller.listQueue);
router.post('/sync-queue/:id/retry', controller.retry);

module.exports = router;
