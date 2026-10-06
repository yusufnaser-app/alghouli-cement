'use strict';
/**
 * بوابة التسليم (A2): متى يُسمح بتسليم وجهة أو إغلاق فاكس؟
 *  - فاكس المؤسسة (is_managed_by_institution = true أو NULL) → READY_FOR_TRANSIT فقط
 *    (أي بعد تحديد الوجهات وخط السير وأجرة النقل).
 *  - فاكس التاجر (is_managed_by_institution = false) → USED فقط (بعد التحميل).
 *  - DELIVERED/CANCELLED وكل حالة أخرى → مرفوض.
 * NULL يُعامَل كفاكس مؤسسة (الافتراضي نفسه المعتمد في available-trips).
 */

const httpError = (message, status = 400, code = null) => {
  const e = new Error(message);
  e.status = status;
  if (code) e.code = code;
  return e;
};

const isInstitutionFax = (fax) => fax.is_managed_by_institution !== false;
const requiredFaxStatus = (fax) => (isInstitutionFax(fax) ? 'READY_FOR_TRANSIT' : 'USED');

/** يرمي خطأً إن لم تكن حالة الفاكس تسمح بالتسليم. fax = { status, is_managed_by_institution } */
const assertFaxDeliverable = (fax) => {
  if (fax.status === 'DELIVERED') throw httpError('تم تسليم الفاكس مسبقًا', 400, 'FAX_ALREADY_DELIVERED');
  if (fax.status === 'CANCELLED') throw httpError('الفاكس ملغى', 400, 'FAX_CANCELLED');
  if (fax.status !== requiredFaxStatus(fax)) {
    throw httpError(
      isInstitutionFax(fax)
        ? 'الفاكس ليس جاهزًا للتسليم — حدّد الوجهات وسعر النقل أولًا'
        : 'الفاكس ليس مُحمَّلًا بعد',
      400,
      'FAX_NOT_READY_FOR_DELIVERY'
    );
  }
};

/** رفض إغلاق الفاكس مع وجود وجهات PENDING. يستخدم client المعاملة. */
const assertNoPendingDestinations = async (client, faxId) => {
  const r = await client.query(
    `SELECT COUNT(*)::int AS n FROM delivery_destinations WHERE fax_id = $1 AND status = 'PENDING'`,
    [faxId]
  );
  const n = (r.rows[0] && r.rows[0].n) || 0;
  if (n > 0) {
    throw httpError(`يوجد ${n} وجهات معلقة — استخدم تسليم الوجهات`, 400, 'PENDING_DESTINATIONS');
  }
};

module.exports = { assertFaxDeliverable, assertNoPendingDestinations, requiredFaxStatus, isInstitutionFax };
