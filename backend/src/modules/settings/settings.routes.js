const express = require('express');
const controller = require('./settings.controller');
const { authenticate, requireRoles } = require('../../middlewares/auth');

const router = express.Router();

router.get('/public', controller.publicSettings);

router.use(authenticate);
router.get('/', requireRoles('admin'), controller.listAll);
router.put('/', requireRoles('admin'), controller.update);
router.post('/', requireRoles('admin'), controller.create);
router.delete('/:key', requireRoles('admin'), controller.remove);

module.exports = router;
