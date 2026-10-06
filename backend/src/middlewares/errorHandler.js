const response = require('../utils/response');

const errorHandler = (err, req, res, next) => {
  console.error('❌', err.message);

  if (err.name === 'ZodError') {
    return response.error(
      res,
      'خطأ في المدخلات',
      422,
      'VALIDATION_ERROR',
      err.errors.map((e) => ({ field: e.path.join('.'), message: e.message }))
    );
  }

  if (err.name === 'JsonWebTokenError') {
    return response.error(res, 'توكن غير صالح', 401, 'UNAUTHORIZED');
  }

  if (err.name === 'TokenExpiredError') {
    return response.error(res, 'توكن منتهي', 401, 'EXPIRED_TOKEN');
  }

  if (err.code === '23505' && /uq_loading_faxes_order_active/.test(err.constraint || err.message || '')) {
    return response.error(res, 'يوجد فاكس نشط لهذا الطلب', 409, 'FAX_ALREADY_EXISTS_FOR_ORDER');
  }

  const status = err.status || 500;
  const message = err.message || 'خطأ داخلي في الخادم';
  return response.error(res, message, status, err.code || 'INTERNAL_ERROR');
};

module.exports = errorHandler;
