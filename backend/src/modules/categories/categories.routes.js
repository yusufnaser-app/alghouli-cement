const express = require('express');
const controller = require('./categories.controller');

const router = express.Router();

router.get('/', controller.list);

module.exports = router;
