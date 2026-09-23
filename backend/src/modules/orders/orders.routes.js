const express = require('express');
const controller = require('./orders.controller');
const { authenticate, requireRoles } = require('../../middlewares/auth');

const router = express.Router();

router.use(authenticate);

// للعميل
router.post('/', controller.create);
router.get('/', controller.list);
router.get('/credit-check', controller.checkCredit);
router.patch('/:id/cancel', controller.cancel);

// للمدير — الطلبات المعلقة
router.get('/admin/pending-credit', requireRoles('admin'), controller.listPendingCredit);
router.patch('/admin/:id/approve-credit', requireRoles('admin'), controller.approveCredit);
router.patch('/admin/:id/reject-credit', requireRoles('admin'), controller.rejectCredit);

// أسعار النقل العامة
router.get('/admin/transport-rates', requireRoles('admin', 'sales'), controller.listTransportRates);
router.post('/admin/transport-rates', requireRoles('admin'), controller.createTransportRate);
router.put('/admin/transport-rates/:id', requireRoles('admin'), controller.updateTransportRate);
router.delete('/admin/transport-rates/:id', requireRoles('admin'), controller.removeTransportRate);

// أسعار خاصة للعميل
router.get('/admin/customers/:customerId/transport-rates', requireRoles('admin', 'sales'), controller.listCustomerTransportRates);
router.post('/admin/customers/:customerId/transport-rates', requireRoles('admin'), controller.createCustomerTransportRate);
router.delete('/admin/customers/:customerId/transport-rates/:id', requireRoles('admin'), controller.removeCustomerTransportRate);

router.get('/admin/customers/:customerId/product-prices', requireRoles('admin', 'sales'), controller.listCustomerProductPrices);
router.post('/admin/customers/:customerId/product-prices', requireRoles('admin'), controller.createCustomerProductPrice);
router.delete('/admin/customers/:customerId/product-prices/:id', requireRoles('admin'), controller.removeCustomerProductPrice);

// يجب أن يكون آخر شيء — :id
router.get('/:id', controller.getById);

module.exports = router;
