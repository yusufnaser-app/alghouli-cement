const express = require('express');
const controller = require('./offers.controller');
const { authenticate, requireRoles } = require('../../middlewares/auth');

const router = express.Router();

router.get('/active', authenticate, controller.listActiveOffers);

router.use(authenticate);
router.use(requireRoles('admin', 'sales'));
router.get('/campaigns', controller.listCampaigns);
router.post('/campaigns', controller.createCampaign);
router.put('/campaigns/:id', controller.updateCampaign);
router.delete('/campaigns/:id', controller.deleteCampaign);
router.post('/', controller.createOffer);
router.delete('/:id', controller.deleteOffer);

module.exports = router;
