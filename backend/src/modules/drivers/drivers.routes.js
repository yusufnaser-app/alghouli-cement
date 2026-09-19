const express = require('express');
const controller = require('./drivers.controller');
const { authenticate, requireRoles } = require('../../middlewares/auth');

const router = express.Router();

router.use(authenticate);
router.use(requireRoles('transport', 'sales'));

router.get('/', controller.list);
router.post('/', controller.create);
router.get('/:id', controller.getById);
router.put('/:id', controller.update);

module.exports = router;
