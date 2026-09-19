const express = require('express');
const controller = require('./reports.controller');
const { authenticate, requireRoles } = require('../../middlewares/auth');

const router = express.Router();

router.use(authenticate);
router.use(requireRoles('accountant', 'sales'));

router.get('/summary', controller.summary);
router.get('/by-source', controller.bySource);
router.get('/by-category', controller.byCategory);
router.get('/by-packaging', controller.byPackaging);
router.get('/top-products', controller.top);
router.get('/daily', controller.daily);
router.get('/pending-payments', controller.pending);
router.get('/low-stock', controller.lowStock);

module.exports = router;
