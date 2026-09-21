const express = require('express');
const controller = require('./categories.controller');
const { authenticate, requireRoles } = require('../../middlewares/auth');

const router = express.Router();

router.get('/', controller.list);
router.post('/', authenticate, requireRoles('admin'), controller.create);
router.put('/:id', authenticate, requireRoles('admin'), controller.update);
router.delete('/:id', authenticate, requireRoles('admin'), controller.remove);

module.exports = router;
