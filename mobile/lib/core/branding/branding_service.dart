import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../constants/app_config.dart';

/// خدمة الهوية — تجلب الألوان والشعارات من الخادم، وتخزّنها محليًا.
class BrandingService {
  static const _key = 'branding_cache_v1';

  static Map<String, dynamic> _current = _defaults();

  static Map<String, dynamic> get current => _current;

  static Map<String, dynamic> _defaults() => {
    'primary_color': '#1a3a5c',
    'secondary_color': '#d4a574',
    'logo_url': '',
    'favicon_url': '',
    'login_image_url': '',
    'home_banner_url': '',
    'company_name': 'مؤسسة الغولي',
  };

  // ═══ تحميل من Cache ═══
  static Future<Map<String, dynamic>> loadCached() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_key);
      if (raw != null) {
        _current = {..._defaults(), ...jsonDecode(raw)};
      }
    } catch (_) {}
    return _current;
  }

  // ═══ جلب من الخادم ═══
  static Future<Map<String, dynamic>> fetchFromServer() async {
    try {
      final dio = Dio(BaseOptions(
        baseUrl: AppConfig.apiBaseUrl,
        connectTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 10),
      ));
      final res = await dio.get('/settings/branding');
      final data = res.data['data'];
      if (data is Map) {
        _current = {..._defaults(), ...Map<String, dynamic>.from(data)};
        // احفظ محليًا
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString(_key, jsonEncode(_current));
      }
    } catch (_) {
      // فشل الشبكة → نستخدم الـ cache
    }
    return _current;
  }

  // ═══ قراءة سريعة (متزامنة) ═══
  static Color get primaryColor => _hex(_current['primary_color']);
  static Color get secondaryColor => _hex(_current['secondary_color']);
  static String get companyName => (_current['company_name'] ?? 'مؤسسة الغولي').toString();
  static String get logoUrl => (_current['logo_url'] ?? '').toString();
  static String get faviconUrl => (_current['favicon_url'] ?? '').toString();
  static String get loginImageUrl => (_current['login_image_url'] ?? '').toString();
  static String get homeBannerUrl => (_current['home_banner_url'] ?? '').toString();

  static Color _hex(String? hex) {
    try {
      final h = (hex ?? '').replaceAll('#', '');
      if (h.length == 6) return Color(int.parse('FF$h', radix: 16));
      if (h.length == 8) return Color(int.parse(h, radix: 16));
    } catch (_) {}
    return const Color(0xFF1A3A5C);
  }
}
