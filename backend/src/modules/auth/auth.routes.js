const express = require('express');
const controller = require('./auth.controller');
const { authenticate } = require('../../middlewares/auth');

const router = express.Router();

router.post('/register', controller.register);
router.post('/verify-otp', controller.verifyOtp);
router.post('/login', controller.login);
router.post('/refresh-token', controller.refresh);
router.get('/me', authenticate, controller.me);

module.exports = router;
