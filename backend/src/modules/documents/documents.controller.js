'use strict';
const asyncHandler = require('../../utils/asyncHandler');
const { loadPermissions } = require('../../middlewares/auth');
const svc = require('./documents.service');
const { renderDocument } = require('./document-renderer');

/** سياق المستخدم للمستند: الصلاحيات تُحمَّل من الجلسة نفسها (لا من معامِلات الطلب). */
const ctxOf = async (req) => ({
  userId: req.user.id,
  userName: req.user.full_name || req.user.phone || '—',
  roles: req.roles || [],
  perms: await loadPermissions(req),
});

const send = (res, doc) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');   // مستندات مالية: لا تُخزَّن في المتصفح أو الوسيط
  return res.send(renderDocument(doc));
};

const orderPurchaseRequest = asyncHandler(async (req, res) => send(res, await svc.orderPurchaseRequest(await ctxOf(req), req.params.id)));
const orderValueNotice = asyncHandler(async (req, res) => send(res, await svc.orderValueNotice(await ctxOf(req), req.params.id)));
const fax = asyncHandler(async (req, res) => send(res, await svc.faxDocument(await ctxOf(req), req.params.id)));
const loading = asyncHandler(async (req, res) => send(res, await svc.loadingDocument(await ctxOf(req), req.params.id)));
const delivery = asyncHandler(async (req, res) => send(res, await svc.deliveryDocument(await ctxOf(req), req.params.id)));
const customerStatement = asyncHandler(async (req, res) => send(res, await svc.customerStatement(await ctxOf(req), req.params.customerId, {
  from: req.query.from, to: req.query.to, currency: req.query.currency,
})));
const driverStatement = asyncHandler(async (req, res) => send(res, await svc.driverStatement(await ctxOf(req), req.params.driverId)));
const paymentReceipt = asyncHandler(async (req, res) => send(res, await svc.paymentReceipt(await ctxOf(req), req.params.id)));
const report = asyncHandler(async (req, res) => send(res, await svc.report(await ctxOf(req), req.params.kind, {
  from: req.query.from, to: req.query.to,
})));

module.exports = {
  orderPurchaseRequest, orderValueNotice, fax, loading, delivery,
  customerStatement, driverStatement, paymentReceipt, report,
};
