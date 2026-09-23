const express = require('express');
const controller = require('./driver-management.controller');
const { authenticate, requireRoles } = require('../../middlewares/auth');

const router = express.Router();
router.use(authenticate);
router.use(requireRoles('customer'));

router.get('/drivers', controller.listDrivers);
router.post('/drivers', controller.addDriver);
router.put('/drivers/:id', controller.updateDriver);
router.delete('/drivers/:id', controller.removeDriver);

router.get('/vehicles', controller.listVehicles);
router.post('/vehicles', controller.addVehicle);
router.delete('/vehicles/:id', controller.removeVehicle);

module.exports = router;
