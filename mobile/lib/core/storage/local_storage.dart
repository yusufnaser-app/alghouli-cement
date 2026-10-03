import 'package:shared_preferences/shared_preferences.dart';

/// تخزين دائم باستخدام SharedPreferences — يحفظ الجلسة حتى بعد إغلاق التطبيق.
class LocalStorage {
  static const _kToken = 'auth_token';
  static const _kRefreshToken = 'auth_refresh_token';
  static const _kUser = 'auth_user';

  static SharedPreferences? _prefs;

  static Future<SharedPreferences> _get() async {
    _prefs ??= await SharedPreferences.getInstance();
    return _prefs!;
  }

  // ═══ Token ═══
  static Future<void> saveToken(String token) async {
    final p = await _get();
    await p.setString(_kToken, token);
  }

  static Future<String?> getToken() async {
    final p = await _get();
    return p.getString(_kToken);
  }

  // ═══ Refresh Token ═══
  static Future<void> saveRefreshToken(String token) async {
    final p = await _get();
    await p.setString(_kRefreshToken, token);
  }

  static Future<String?> getRefreshToken() async {
    final p = await _get();
    return p.getString(_kRefreshToken);
  }

  // ═══ User Data ═══
  static Future<void> saveUser(String userJson) async {
    final p = await _get();
    await p.setString(_kUser, userJson);
  }

  static Future<String?> getUser() async {
    final p = await _get();
    return p.getString(_kUser);
  }

  // ═══ Clear All ═══
  static Future<void> clearAll() async {
    final p = await _get();
    await p.remove(_kToken);
    await p.remove(_kRefreshToken);
    await p.remove(_kUser);
  }
}
