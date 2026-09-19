const express = require('express');
const controller = require('./deliveries.controller');
const { authenticate, requireRoles } = require('../../middlewares/auth');

const router = express.Router();

router.use(authenticate);

router.post('/order/:orderId/assign', requireRoles('transport'), controller.assign);
router.get('/order/:orderId', controller.listByOrder);
router.patch('/:id/status', requireRoles('transport', 'driver'), controller.updateStatus);

module.exports = router;
