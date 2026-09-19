const success = (res, data = null, message = 'تمت العملية بنجاح', meta = null) => {
  const payload = { success: true, message };
  if (data !== null) payload.data = data;
  if (meta) payload.meta = meta;
  return res.json(payload);
};

const created = (res, data, message = 'تم الإنشاء بنجاح') => {
  return res.status(201).json({ success: true, message, data });
};

const error = (res, message = 'حدث خطأ', status = 400, code = null, errors = null) => {
  const payload = { success: false, message };
  if (code) payload.code = code;
  if (errors) payload.errors = errors;
  return res.status(status).json(payload);
};

module.exports = { success, created, error };
