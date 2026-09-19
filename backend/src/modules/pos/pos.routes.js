const express = require('express');
const controller = require('./pos.controller');
const { authenticate, requireRoles } = require('../../middlewares/auth');

const router = express.Router();

router.use(authenticate);
router.use(requireRoles('pos', 'admin'));

router.get('/points', controller.listPoints);
router.post('/points', requireRoles('admin'), controller.createPoint);
router.post('/sessions/open', controller.openSession);
router.post('/sessions/:id/close', controller.closeSession);
router.post('/sales', controller.createSale);

module.exports = router;
