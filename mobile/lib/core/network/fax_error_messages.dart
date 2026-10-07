/// رسائل واضحة لرموز أخطاء الفاكسات/الوجهات (الخادم يعيد `code` في جسم الخطأ).
/// ترجع null إن لم يكن الرمز معروفًا فيُستعمل نص الخادم كما هو.
/// الرموز الديناميكية (فيها أرقام) تُبقي نص الخادم وتُلحق به إرشادًا.
String? friendlyFaxMessage(String code, String? serverMessage) {
  final msg = (serverMessage ?? '').trim();
  switch (code) {
    case 'FAX_NOT_READY_FOR_DELIVERY':
      return 'الفاكس ليس جاهزًا للتسليم بعد.\n'
          'فاكس المؤسسة: حدّد الوجهات وسعر النقل أولًا.\n'
          'فاكس التاجر: يجب تسجيل التحميل أولًا.';
    case 'PENDING_DESTINATIONS':
      return '${msg.isEmpty ? 'توجد وجهات معلّقة' : msg}\nسلّم كل وجهة على حدة، فيُغلق الفاكس تلقائيًا بعد آخر وجهة.';
    case 'QUANTITY_EXCEEDS_LOADED':
      return '${msg.isEmpty ? 'مجموع الوجهات يتجاوز كمية الفاكس' : msg}\nخفّض كميات الوجهات (الطن = 20 كيسًا).';
    case 'FAX_ALREADY_DELIVERED':
      return 'تم تسليم هذا الفاكس مسبقًا.';
    case 'FAX_CANCELLED':
      return 'هذا الفاكس ملغى.';
    case 'FAX_CLOSED':
      return 'لا يمكن تعديل وجهات فاكس مُسلَّم أو ملغى.';
    case 'DESTINATION_ALREADY_DELIVERED':
      return 'تم تسليم هذه الوجهة مسبقًا.';
    case 'DESTINATION_CANCELLED':
      return 'هذه الوجهة ملغاة.';
    case 'ALREADY_ROUTED':
      return 'تم تحديد خط السير وأجرة النقل لهذا الفاكس مسبقًا.';
    case 'TRANSPORT_NOT_ALLOWED_YET':
      return 'سعر النقل يُحدَّد بعد تسجيل التحميل فقط.';
    case 'ROUTE_REQUIRED':
      return 'تعذّر اشتقاق خط السير — أضف محافظة لوجهة واحدة على الأقل.';
    case 'TRANSPORT_PAYER_TRADER_REQUIRED':
      return 'اختر التاجر المتحمّل لأجرة النقل.';
    case 'NO_DRIVER':
      return 'لا يوجد سائق مرتبط بهذا الفاكس.';
    case 'FAX_NOT_READY':
      return 'تعذّر إنشاء الفاكس: بيانات السائق/القاطرة أو الطلب ناقصة.';
    case 'FAX_ALREADY_EXISTS_FOR_ORDER':
      return 'يوجد فاكس نشط لهذا الطلب بالفعل.';
    case 'ORDER_ALREADY_ASSIGNED':
      return 'هذا الطلب مكلَّف أصلًا على رحلة قائمة.';
    case 'INVALID_STATUS':
      return msg.isEmpty ? 'حالة الفاكس لا تسمح بهذا الإجراء.' : msg;
    default:
      return null;
  }
}
