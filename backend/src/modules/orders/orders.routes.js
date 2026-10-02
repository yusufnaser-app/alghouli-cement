const express = require('express');
const controller = require('./orders.controller');
const { authenticate, requireRoles, requirePermission } = require('../../middlewares/auth');

const router = express.Router();

router.use(authenticate);

// للعميل
router.post('/', controller.create);
router.post('/group', controller.createGroup);
router.get('/group/:groupId', controller.getGroup);
router.get('/', controller.list);
router.get('/credit-check', controller.checkCredit);
router.patch('/:id/cancel', controller.cancel);
router.patch('/:id/choose-payment', controller.choosePayment);

router.get('/admin/pending-pricing', requirePermission('pricing.view'), controller.listPendingPricing);
router.patch('/admin/:id/pricing', requirePermission('pricing.create', 'pricing.update'), controller.setPricing);

// للمدير — الطلبات المعلقة
router.get('/admin/pending-credit', requirePermission('pricing.approve'), controller.listPendingCredit);
router.patch('/admin/:id/approve-credit', requirePermission('pricing.approve'), controller.approveCredit);
router.patch('/admin/:id/reject-credit', requirePermission('pricing.approve'), controller.rejectCredit);

// أسعار النقل العامة
router.get('/admin/transport-rates', requirePermission('pricing.view'), controller.listTransportRates);
router.post('/admin/transport-rates', requirePermission('pricing.update'), controller.createTransportRate);
router.put('/admin/transport-rates/:id', requirePermission('pricing.update'), controller.updateTransportRate);
router.delete('/admin/transport-rates/:id', requirePermission('pricing.update'), controller.removeTransportRate);

// أسعار خاصة للعميل
router.get('/admin/customers/:customerId/transport-rates', requirePermission('pricing.view'), controller.listCustomerTransportRates);
router.post('/admin/customers/:customerId/transport-rates', requirePermission('pricing.update'), controller.createCustomerTransportRate);
router.delete('/admin/customers/:customerId/transport-rates/:id', requirePermission('pricing.update'), controller.removeCustomerTransportRate);

router.get('/admin/customers/:customerId/product-prices', requirePermission('pricing.view'), controller.listCustomerProductPrices);
router.post('/admin/customers/:customerId/product-prices', requirePermission('pricing.update'), controller.createCustomerProductPrice);
router.delete('/admin/customers/:customerId/product-prices/:id', requirePermission('pricing.update'), controller.removeCustomerProductPrice);

// يجب أن يكون آخر شيء — :id
router.get('/:id/full', controller.getFullOrder);
router.get('/:id', controller.getById);

module.exports = router;
