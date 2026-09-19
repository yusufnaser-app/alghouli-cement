const express = require('express');
const controller = require('./products.controller');

const router = express.Router();

router.get('/', controller.list);
router.get('/calculate', controller.calculate);
router.get('/:id', controller.getById);

module.exports = router;
