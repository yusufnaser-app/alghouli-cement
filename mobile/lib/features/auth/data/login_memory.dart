import 'package:shared_preferences/shared_preferences.dart';

/// بادئة الجوال الثابتة (اليمن). المستخدم يكتب تسعة أرقام فقط، والنظام يضيف 967.
const String kPhoneCountryPrefix = '967';

/// تخزين بيانات الدخول على الجهاز عند اختيار "تذكّرني".
class LoginMemory {
  static const _kDigits = 'login_phone_digits';
  static const _kPassword = 'login_password';
  static const _kRemember = 'login_remember';

  /// يُرجع الأرقام التسعة (بلا 967)، وكلمة المرور، وحالة التذكّر.
  static Future<Map<String, dynamic>> load() async {
    final p = await SharedPreferences.getInstance();
    return {
      'digits': p.getString(_kDigits) ?? '',
      'password': p.getString(_kPassword) ?? '',
      'remember': p.getBool(_kRemember) ?? true,
    };
  }

  /// عند "تذكّرني" يُحفظ الرقم وكلمة المرور، وإلا تُمسح كلمة المرور فقط.
  static Future<void> save({required String digits, required String password, required bool remember}) async {
    final p = await SharedPreferences.getInstance();
    await p.setBool(_kRemember, remember);
    if (remember) {
      await p.setString(_kDigits, digits);
      await p.setString(_kPassword, password);
    } else {
      await p.remove(_kPassword);
    }
  }
}
