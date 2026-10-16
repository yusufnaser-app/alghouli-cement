'use strict';
/**
 * الفاكس صنف واحد من مصنع واحد: الصنف يجب أن يتبع المصنع المختار.
 * يُستدعى داخل المعاملة قبل الإدراج. يرمي 422 PRODUCT_NOT_OF_FACTORY إن لم يتطابق.
 */
const assertProductOfFactory = async (client, productId, factoryId) => {
  if (!productId) {
    const e = new Error('يجب اختيار صنف للفاكس');
    e.status = 422; e.code = 'PRODUCT_REQUIRED';
    throw e;
  }
  const r = await client.query(`SELECT id FROM products WHERE id = $1 AND source_id = $2`, [productId, factoryId]);
  if (!r.rows.length) {
    const e = new Error('الصنف لا ينتمي للمصنع المختار');
    e.status = 422; e.code = 'PRODUCT_NOT_OF_FACTORY';
    throw e;
  }
};

/**
 * يحدد صنف الفاكس: الصنف الصريح إن أُرسل (ويُتحقق من انتمائه للمصنع)،
 * وإلا صنف المصنع الوحيد النشط. مصنع بأكثر من صنف بدون اختيار ⇒ 422 PRODUCT_REQUIRED.
 * يحفظ التوافق مع نسخ التطبيق القديمة التي لا ترسل الصنف.
 */
const resolveFaxProduct = async (client, productId, factoryId) => {
  if (productId) {
    await assertProductOfFactory(client, productId, factoryId);
    return productId;
  }
  const r = await client.query(
    `SELECT id FROM products WHERE source_id = $1 AND COALESCE(status, 'active') = 'active'`,
    [factoryId]
  );
  if (r.rows.length === 1) return r.rows[0].id;
  const e = new Error('اختر الصنف لهذا الفاكس (المصنع لديه أكثر من صنف)');
  e.status = 422; e.code = 'PRODUCT_REQUIRED';
  throw e;
};

module.exports = { assertProductOfFactory, resolveFaxProduct };
