const express = require('express');
const controller = require('./customers.controller');
const { authenticate } = require('../../middlewares/auth');

const router = express.Router();

router.use(authenticate);

router.get('/me', controller.me);
router.put('/me', controller.updateMe);
router.get('/me/addresses', controller.listAddresses);
router.post('/me/addresses', controller.addAddress);
router.delete('/me/addresses/:id', controller.deleteAddress);

module.exports = router;
