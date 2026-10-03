'use strict';
const express = require('express');
const controller = require('./settings.controller');
const { authenticate, requireRoles, requirePermission } = require('../../middlewares/auth');

const router = express.Router();

// ═══ عام (بدون توثيق) ═══
router.get('/public', controller.publicSettings);
router.get('/branding', controller.getBranding);

// ═══ تحتاج توثيق ═══
router.use(authenticate);

router.get('/', requireRoles('admin'), controller.listAll);
router.put('/', requirePermission('settings.manage', 'roles.manage'), controller.update);
router.post('/', requirePermission('settings.manage', 'roles.manage'), controller.create);
router.delete('/:key', requirePermission('settings.manage', 'roles.manage'), controller.remove);

// الهوية
router.put('/branding', requirePermission('settings.manage', 'roles.manage'), controller.updateBranding);

// المزودون
router.get('/providers', requirePermission('providers.manage', 'roles.manage'), controller.listProviders);
router.put('/providers/:name', requirePermission('providers.manage', 'roles.manage'), controller.updateProvider);

module.exports = router;
