const express = require('express');
const controller = require('./driver-file.controller');
const { authenticate, requireRoles } = require('../../middlewares/auth');

const router = express.Router();
router.use(authenticate);

router.get('/stats', requireRoles('admin', 'transport', 'accountant'), controller.getStats);
router.get('/:id/profile', requireRoles('admin', 'transport', 'accountant'), controller.getProfile);
router.get('/:id/trips', requireRoles('admin', 'transport', 'accountant'), controller.getTrips);
router.get('/:id/activity', requireRoles('admin', 'transport', 'accountant'), controller.getActivity);
router.get('/:id/transfers', requireRoles('admin', 'accountant'), controller.getTransfers);
router.post('/:id/transfers', requireRoles('admin', 'accountant'), controller.createTransfer);
router.put('/:id/profile', requireRoles('admin', 'transport'), controller.updateProfile);

module.exports = router;
