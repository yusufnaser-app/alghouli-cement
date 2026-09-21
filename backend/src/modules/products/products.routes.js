const express = require('express');
const controller = require('./products.controller');
const { authenticate, requireRoles } = require('../../middlewares/auth');

const router = express.Router();

router.get('/', controller.list);
router.get('/calculate', controller.calculate);
router.get('/:id', controller.getById);

router.post('/', authenticate, requireRoles('admin', 'inventory'), controller.create);
router.put('/:id', authenticate, requireRoles('admin', 'inventory'), controller.update);
router.delete('/:id', authenticate, requireRoles('admin'), controller.remove);
router.patch('/:id/prices', authenticate, requireRoles('admin'), controller.updatePrices);
router.patch('/:id/inventory', authenticate, requireRoles('admin', 'inventory'), controller.updateInventory);

module.exports = router;
