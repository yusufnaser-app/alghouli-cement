const express = require('express');
const controller = require('./sources.controller');
const { authenticate, requireRoles } = require('../../middlewares/auth');

const router = express.Router();

router.get('/', controller.list);
router.get('/:id', controller.getById);

// إدارة المصانع — الإنشاء/التعديل للأدمن والمخزون، الحذف للأدمن فقط
router.post('/', authenticate, requireRoles('admin', 'inventory'), controller.create);
router.put('/:id', authenticate, requireRoles('admin', 'inventory'), controller.update);
router.delete('/:id', authenticate, requireRoles('admin'), controller.remove);

module.exports = router;
