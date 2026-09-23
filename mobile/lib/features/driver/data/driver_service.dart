import 'package:dio/dio.dart';
import '../../../core/network/api_client.dart';

class DriverService {
  final _client = ApiClient();

  // فاكساتي
  Future<List<Map<String, dynamic>>> myFaxes() async {
    try {
      final res = await _client.get('/faxes/me');
      final list = (res.data['data'] as List?) ?? [];
      return list.cast<Map<String, dynamic>>();
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  // طلب فاكس جديد
  Future<Map<String, dynamic>> requestFax({
    required String factoryId,
    required String vehicleId,
    required double quantity,
    String? orderId,
    String? notes,
  }) async {
    try {
      final res = await _client.post('/faxes/request', data: {
        'factoryId': factoryId,
        'vehicleId': vehicleId,
        'quantity': quantity,
        if (orderId != null) 'orderId': orderId,
        if (notes != null && notes.isNotEmpty) 'notes': notes,
      });
      return res.data['data'] as Map<String, dynamic>;
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  // تسجيل الدخول للمصنع
  Future<void> enterFactory(String faxId) async {
    try {
      await _client.patch('/faxes/$faxId/enter-factory');
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  // مستحقاتي
  Future<Map<String, dynamic>> mySummary() async {
    try {
      final res = await _client.get('/drivers/me/summary');
      return res.data['data'] as Map<String, dynamic>;
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  // كشف حسابي
  Future<List<Map<String, dynamic>>> myLedger() async {
    try {
      final res = await _client.get('/drivers/me/ledger');
      final list = (res.data['data'] as List?) ?? [];
      return list.cast<Map<String, dynamic>>();
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  // قوائم مساعدة
  Future<List<Map<String, dynamic>>> factories() async {
    try {
      final res = await _client.get('/sources');
      final list = (res.data['data'] as List?) ?? [];
      return list.cast<Map<String, dynamic>>();
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  Future<List<Map<String, dynamic>>> vehicles() async {
    try {
      final res = await _client.get('/vehicles');
      final list = (res.data['data'] as List?) ?? [];
      return list.cast<Map<String, dynamic>>();
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }
}
