import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';

/// مصادر حسابات العملاء للأدمن: كلها قراءة فقط، والمنطق الحسابي في الخادم.
class CustomerAccountService {
  final _client = ApiClient();

  Future<List<Map<String, dynamic>>> customers() async {
    try {
      final res = await _client.dio.get('/admin/customers');
      return ((res.data['data'] as List?) ?? []).cast<Map<String, dynamic>>();
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  Future<Map<String, dynamic>> summary(String customerId) async {
    try {
      final res = await _client.dio.get('/customers/$customerId/summary');
      return (res.data['data'] as Map).cast<String, dynamic>();
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  /// السقوف الخاصة بالعميل فقط (القواعد العامة لا تُعرض هنا).
  Future<List<Map<String, dynamic>>> ceilingRules(String customerId) async {
    try {
      final res = await _client.dio.get('/ceilings/rules');
      final all = ((res.data['data'] as List?) ?? []).cast<Map<String, dynamic>>();
      return all.where((r) => r['customer_id']?.toString() == customerId).toList();
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  /// يحدد سقف الائتمان بالريال فقط (0 = بلا سقف). السبب ثابت ومُسجَّل في التدقيق.
  Future<void> setCreditLimit(String customerId, double limit) async {
    try {
      await _client.dio.patch(
        '/admin/customers/$customerId/credit',
        data: {'creditLimit': limit, 'reason': 'تحديد سقف الائتمان من تطبيق الموبايل'},
      );
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  /// دفعة أو حوالة من التاجر (تُرحَّل إلى حسابه بالخادم).
  Future<void> recordCustomerPayment(String customerId, double amount, String notes) async {
    try {
      await _client.dio.post('/customers/$customerId/payments',
          data: {'amount': amount, 'method': 'transfer', if (notes.isNotEmpty) 'notes': notes});
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  Future<Map<String, dynamic>> statement(String customerId) async {
    try {
      final res = await _client.dio.get('/accounting/customer/$customerId/statement');
      return (res.data['data'] as Map).cast<String, dynamic>();
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }
}

/// تنسيق المبلغ: فواصل آلاف وخانتان عشريتان، من نص عشري قادم من الخادم.
String fmtMoney(dynamic v) {
  final s = (v ?? '0').toString().trim();
  if (!RegExp(r'^-?\d+(\.\d+)?$').hasMatch(s)) return s;
  final neg = s.startsWith('-');
  final parts = s.replaceFirst('-', '').split('.');
  final intPart = parts[0].replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (m) => ',');
  final frac = (parts.length > 1 ? parts[1] : '').padRight(2, '0').substring(0, 2);
  return '${neg ? '-' : ''}$intPart.$frac';
}
