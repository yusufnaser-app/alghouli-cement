const { pool } = require('../../config/db');
const { MockAccountingAdapter } = require('./mock-accounting-adapter');

/**
 * اختيار الـ Adapter الفعلي. حاليًا لا يوجد سوى Mock لأن طريقة الربط الحقيقية
 * مع YemenSoft لم تُحدَّد بعد (API؟ قاعدة بيانات؟ ملفات؟). عند تحديدها،
 * يُضاف Adapter حقيقي هنا خلف متغيّر بيئة (مثلاً ACCOUNTING_ADAPTER=yemensoft_api)
 * دون الحاجة لتعديل أي كود آخر يستخدم هذه الخدمة.
 */
const getAdapter = () => {
  return new MockAccountingAdapter();
};

/**
 * إضافة عملية إلى طابور المزامنة مع YemenSoft.
 * idempotencyKey إلزامي وفريد — إعادة استدعاء هذه الدالة بنفس المفتاح
 * (مثلاً بسبب انقطاع شبكة وإعادة محاولة) لن تُنشئ صفًا جديدًا ولن تُرحَّل
 * العملية مرتين؛ ستُعاد الصف الموجود كما هو (ON CONFLICT DO NOTHING).
 */
const enqueueSync = async ({
  accountingSystem = 'yemensoft',
  operation,
  entityType,
  entityId,
  payload,
  idempotencyKey,
  createdBy = null,
  client = null, // اختياري: مرّر client المعاملة ليُكتب الطابور ذرّيًا مع قيد الدفتر (rollback = لا عنصر يتيم)
}) => {
  const runner = client || pool;
  if (!operation || !entityType || !entityId || !payload || !idempotencyKey) {
    throw new Error('enqueueSync: بيانات ناقصة (operation, entityType, entityId, payload, idempotencyKey إلزامية)');
  }

  const r = await runner.query(
    `INSERT INTO accounting_sync_queue
       (accounting_system, operation, entity_type, entity_id, payload, idempotency_key, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING *`,
    [accountingSystem, operation, entityType, entityId, JSON.stringify(payload), idempotencyKey, createdBy]
  );

  if (r.rows.length > 0) return r.rows[0];

  // كانت موجودة مسبقًا بنفس idempotency_key — أعد الصف الحالي بدل إنشاء تكرار
  const existing = await runner.query(
    `SELECT * FROM accounting_sync_queue WHERE idempotency_key = $1`,
    [idempotencyKey]
  );
  return existing.rows[0];
};

/** معالجة عنصر واحد من الطابور فعليًا عبر الـ Adapter الحالي */
const processQueueItem = async (item) => {
  const adapter = getAdapter();

  await pool.query(
    `UPDATE accounting_sync_queue SET status = 'SYNCING', last_attempt_at = NOW() WHERE id = $1`,
    [item.id]
  );

  try {
    let result;
    const payload = typeof item.payload === 'string' ? JSON.parse(item.payload) : item.payload;

    switch (item.operation) {
      case 'POST_INVOICE':
        result = await adapter.postInvoice(payload, item.idempotency_key);
        break;
      case 'POST_RECEIPT':
        result = await adapter.postReceipt(payload, item.idempotency_key);
        break;
      case 'POST_PAYMENT':
        result = await adapter.postPayment(payload, item.idempotency_key);
        break;
      default:
        result = await adapter.postTransaction(payload, item.idempotency_key);
    }

    await pool.query(
      `UPDATE accounting_sync_queue
       SET status = 'SYNCED', accounting_reference = $1, synced_at = NOW(), sync_error = NULL
       WHERE id = $2`,
      [result?.accountingReference || null, item.id]
    );
    return { success: true, id: item.id, accountingReference: result?.accountingReference || null };
  } catch (err) {
    const retryCount = (item.retry_count || 0) + 1;
    const willRetry = retryCount < (item.max_retries || 5);
    await pool.query(
      `UPDATE accounting_sync_queue
       SET status = $1, retry_count = $2, sync_error = $3
       WHERE id = $4`,
      [willRetry ? 'RETRYING' : 'FAILED', retryCount, err.message, item.id]
    );
    return { success: false, id: item.id, error: err.message, willRetry };
  }
};

/** جلب العناصر المعلّقة/التي يجب إعادة محاولتها (للاستدعاء من Job دوري لاحقًا) */
const listPendingQueue = async (limit = 50) => {
  const r = await pool.query(
    `SELECT * FROM accounting_sync_queue
     WHERE status IN ('PENDING', 'RETRYING')
     ORDER BY created_at ASC
     LIMIT $1`,
    [limit]
  );
  return r.rows;
};

/** لوحة الإدارة: عرض حالة الطابور مع فلترة اختيارية بالحالة */
const listQueue = async (status = null, limit = 100) => {
  const params = [];
  let sql = `SELECT * FROM accounting_sync_queue`;
  if (status) {
    params.push(status);
    sql += ` WHERE status = $${params.length}`;
  }
  params.push(limit);
  sql += ` ORDER BY created_at DESC LIMIT $${params.length}`;
  const r = await pool.query(sql, params);
  return r.rows;
};

/** إعادة محاولة عنصر فشل يدويًا من لوحة الإدارة */
const retryItem = async (id) => {
  const r = await pool.query(`SELECT * FROM accounting_sync_queue WHERE id = $1`, [id]);
  if (r.rows.length === 0) {
    const err = new Error('العنصر غير موجود في الطابور');
    err.status = 404;
    throw err;
  }
  return processQueueItem(r.rows[0]);
};

module.exports = {
  getAdapter,
  enqueueSync,
  processQueueItem,
  listPendingQueue,
  listQueue,
  retryItem,
};
