const express = require('express');
const controller = require('./sources.controller');

const router = express.Router();

router.get('/', controller.list);
router.get('/:id', controller.getById);

module.exports = router;
