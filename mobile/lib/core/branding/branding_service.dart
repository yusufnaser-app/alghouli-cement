import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../constants/app_config.dart';

/// خدمة الهوية — تجلب الألوان من الخادم، وتخزّنها محليًا.
class BrandingService {
  static const _key = 'branding_cache_v2';

  static Map<String, dynamic> _current = _defaults();
  static Map<String, dynamic> get current => _current;

  static Map<String, dynamic> _defaults() => {
    'primary_color': '#d71920',      // أحمر
    'secondary_color': '#082d5c',    // كحلي
    'logo_url': '',                   // نستخدم asset
    'favicon_url': '',
    'login_image_url': '',
    'home_banner_url': '',
    'company_name': 'مؤسسة الغولي',
    'company_full_name': 'مؤسسة الغولي للتجارة وتسويق الأسمنت',
    'company_subtitle': 'المصداقية أساس تميزنا',
  };

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
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString(_key, jsonEncode(_current));
      }
    } catch (_) {}
    return _current;
  }

  // ═══ قراءة سريعة ═══
  static Color get primaryColor => _hex(_current['primary_color']);
  static Color get secondaryColor => _hex(_current['secondary_color']);
  static Color get navyColor => _hex(_current['secondary_color']);

  /// الاسم المختصر — للـ AppBar
  static String get companyName =>
      (_current['company_name'] ?? 'مؤسسة الغولي').toString();

  /// الاسم الكامل — لصفحة الدخول
  static String get companyFullName =>
      (_current['company_full_name'] ?? 'مؤسسة الغولي للتجارة وتسويق الأسمنت').toString();

  /// الاسم الفرعي
  static String get companySubtitle =>
      (_current['company_subtitle'] ?? 'المصداقية أساس تميزنا').toString();

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
    return const Color(0xFFD71920);
  }
}
