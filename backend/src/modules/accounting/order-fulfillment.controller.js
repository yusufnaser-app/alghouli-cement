const asyncHandler = require('../../utils/asyncHandler');
const response = require('../../utils/response');
const service = require('./order-fulfillment.service');

const awaitingPosting = asyncHandler(async (req,res) => response.success(res, await service.listAwaitingPosting(), 'الطلبات المحمّلة بانتظار الترحيل'));
const getOrder = asyncHandler(async (req,res) => {
  const data = await service.getOrderAccounting(req.params.orderId);
  if (!data) return response.error(res,'الطلب غير موجود',404);
  return response.success(res,data,'حسابات الطلب');
});
const postOrder = asyncHandler(async (req,res) => {
  const result = await service.postExistingLoadedOrder(req.params.orderId,req.user.id,req.body?.notes);
  return response.success(res,result,'تم ترحيل الطلب محاسبيًا');
});
module.exports={awaitingPosting,getOrder,postOrder};
