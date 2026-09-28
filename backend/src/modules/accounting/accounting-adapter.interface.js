/**
 * AccountingAdapter — الواجهة المجردة لأي نظام محاسبي خارجي (YemenSoft وغيره).
 *
 * هذا المستودع لا يفترض أي طريقة اتصال فعلية (لا API URL، لا بيانات دخول،
 * لا أسماء جداول) لأن هذه المعلومات غير معروفة بعد. أي Adapter حقيقي مستقبلي
 * (مثلاً YemenSoftApiAdapter أو YemenSoftDbAdapter) يجب أن يرث من هذه الفئة
 * ويطبّق كل دالة وفق طريقة الربط الفعلية بعد التحقق منها ميدانيًا.
 *
 * لا يجوز لأي Adapter تخمين أرقام حسابات أو مراجع محاسبية — إن تعذّر تنفيذ
 * عملية فعليًا، يجب رفع خطأ واضح (NotImplementedError) بدل اختلاق نتيجة.
 */

class NotImplementedError extends Error {
  constructor(methodName) {
    super(
      `AccountingAdapter.${methodName}() غير مُنفَّذة بعد — ` +
      `لا يوجد ربط فعلي مُهيَّأ مع النظام المحاسبي (YemenSoft). ` +
      `يجب تحديد طريقة الاتصال الفعلية (API / قاعدة بيانات / ملفات) أولًا.`
    );
    this.name = 'NotImplementedError';
    this.code = 'ACCOUNTING_ADAPTER_NOT_IMPLEMENTED';
  }
}

class AccountingAdapter {
  /** @returns {Promise<object>} بيانات حساب محاسبي بمعرفه */
  async getAccount(_accountingId) { throw new NotImplementedError('getAccount'); }

  /** @returns {Promise<object>} بيانات عميل من النظام المحاسبي */
  async getCustomer(_accountingCustomerId) { throw new NotImplementedError('getCustomer'); }

  /** @returns {Promise<object>} بيانات مورّد (مصنع) من النظام المحاسبي */
  async getSupplier(_accountingSupplierId) { throw new NotImplementedError('getSupplier'); }

  /** @returns {Promise<{balance:number, asOf:string}>} الرصيد الرسمي لحساب معيّن */
  async getBalance(_accountingEntityId) { throw new NotImplementedError('getBalance'); }

  /** @returns {Promise<Array>} كشف حساب رسمي لعميل/مورّد */
  async getStatement(_accountingEntityId, _from, _to) { throw new NotImplementedError('getStatement'); }

  /** @returns {Promise<{accountingReference:string}>} ترحيل حركة مالية عامة */
  async postTransaction(_payload, _idempotencyKey) { throw new NotImplementedError('postTransaction'); }

  /** @returns {Promise<{accountingReference:string}>} ترحيل فاتورة رسمية */
  async postInvoice(_payload, _idempotencyKey) { throw new NotImplementedError('postInvoice'); }

  /** @returns {Promise<{accountingReference:string}>} ترحيل إيصال قبض */
  async postReceipt(_payload, _idempotencyKey) { throw new NotImplementedError('postReceipt'); }

  /** @returns {Promise<{accountingReference:string}>} ترحيل دفعة/سند صرف */
  async postPayment(_payload, _idempotencyKey) { throw new NotImplementedError('postPayment'); }

  /** @returns {Promise<string|null>} استعلام عن مرجع محاسبي لعملية سبق إرسالها (لمنع التكرار) */
  async getAccountingReference(_idempotencyKey) { throw new NotImplementedError('getAccountingReference'); }

  /** @returns {Promise<boolean>} هل الاتصال بالنظام المحاسبي مُهيَّأ فعليًا الآن؟ */
  async isConfigured() { return false; }
}

module.exports = { AccountingAdapter, NotImplementedError };
