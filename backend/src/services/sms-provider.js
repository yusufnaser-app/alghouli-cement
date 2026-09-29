/**
 * واجهة مزود SMS. لا يوجد مزود حقيقي مُهيَّأ بعد (لم يُحدَّد مزود ولا بيانات API).
 * عند اختيار مزود: أنشئ فئة ترث SmsProvider وتطبّق send() ثم أرجعها من getProvider()
 * بحسب متغيرات البيئة في الخادم فقط (لا تُوضع مفاتيح المزود في تطبيق Flutter أبدًا).
 */
class SmsProvider {
  async isConfigured() { return false; }
  // @returns {Promise<{providerMessageId: string|null}>}
  async send(_phone, _message) { throw new Error('SmsProvider.send غير مُنفَّذة'); }
}

class NoopSmsProvider extends SmsProvider {
  async send() {
    throw new Error('لا يوجد مزود SMS مُهيَّأ بعد — بقيت الرسالة في الطابور');
  }
}

const getProvider = () => new NoopSmsProvider();

module.exports = { SmsProvider, NoopSmsProvider, getProvider };
