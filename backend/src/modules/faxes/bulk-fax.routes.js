const express = require('express');
const controller = require('./bulk-fax.controller');
const { authenticate, requireRoles } = require('../../middlewares/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', requireRoles('admin', 'transport', 'sales'), controller.list);
router.get('/suggestions', requireRoles('admin', 'transport', 'sales'), controller.getSuggestions);
router.post('/create', requireRoles('admin', 'transport', 'sales'), controller.createBulk);

module.exports = router;
