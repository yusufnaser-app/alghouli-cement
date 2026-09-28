const { AccountingAdapter } = require('./accounting-adapter.interface');

/**
 * MockAccountingAdapter — يُستخدم فقط عندما لا يوجد ربط فعلي مُهيَّأ بعد مع
 * YemenSoft. الهدف: السماح لبقية النظام (طابور المزامنة، شاشات الإدارة)
 * بالعمل والاختبار دون كسر أي شيء، مع تعليم كل نتيجة بوضوح تام بأنها
 * "غير متصلة فعليًا" — حتى لا يُفهم خطأً أن هناك تكاملاً حقيقيًا يعمل.
 *
 * ممنوع استخدام هذا الـ Adapter في الإنتاج لأي عملية مالية حقيقية.
 * عند توفر معلومات الربط الفعلية (API أو قاعدة بيانات YemenSoft)، يُستبدل
 * بـ Adapter حقيقي يطبّق نفس الواجهة (AccountingAdapter) دون تغيير بقية الكود.
 */
class MockAccountingAdapter extends AccountingAdapter {
  async isConfigured() {
    return false;
  }

  async getAccount(accountingId) {
    console.warn(`[MockAccountingAdapter] getAccount(${accountingId}) — لا يوجد اتصال فعلي بـ YemenSoft`);
    return null;
  }

  async getCustomer(accountingCustomerId) {
    console.warn(`[MockAccountingAdapter] getCustomer(${accountingCustomerId}) — لا يوجد اتصال فعلي`);
    return null;
  }

  async getSupplier(accountingSupplierId) {
    console.warn(`[MockAccountingAdapter] getSupplier(${accountingSupplierId}) — لا يوجد اتصال فعلي`);
    return null;
  }

  async getBalance(accountingEntityId) {
    console.warn(`[MockAccountingAdapter] getBalance(${accountingEntityId}) — لا يوجد اتصال فعلي`);
    return { balance: null, asOf: null, source: 'NOT_CONNECTED' };
  }

  async getStatement(accountingEntityId) {
    console.warn(`[MockAccountingAdapter] getStatement(${accountingEntityId}) — لا يوجد اتصال فعلي`);
    return [];
  }

  // عمليات الترحيل: لا تتظاهر بالنجاح — ترفض بوضوح ليبقى العنصر PENDING/FAILED
  // في طابور المزامنة إلى أن يُهيَّأ Adapter حقيقي، بدل توليد مرجع محاسبي وهمي.
  async postTransaction() {
    throw new Error('لا يوجد ربط فعلي مع YemenSoft بعد — العملية بقيت في طابور الانتظار');
  }
  async postInvoice() {
    throw new Error('لا يوجد ربط فعلي مع YemenSoft بعد — العملية بقيت في طابور الانتظار');
  }
  async postReceipt() {
    throw new Error('لا يوجد ربط فعلي مع YemenSoft بعد — العملية بقيت في طابور الانتظار');
  }
  async postPayment() {
    throw new Error('لا يوجد ربط فعلي مع YemenSoft بعد — العملية بقيت في طابور الانتظار');
  }
  async getAccountingReference() {
    return null;
  }
}

module.exports = { MockAccountingAdapter };
