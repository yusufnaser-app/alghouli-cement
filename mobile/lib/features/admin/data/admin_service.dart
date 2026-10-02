import 'package:dio/dio.dart';
import '../../../core/network/api_client.dart';

class AdminService {
  final _client = ApiClient();

  Future<Map<String, dynamic>> dashboard() async {
    try {
      final res = await _client.get('/admin/dashboard');
      return Map<String, dynamic>.from(res.data['data'] as Map);
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  Future<List<Map<String, dynamic>>> pendingPricing() async {
    try {
      final res = await _client.get('/orders/admin/pending-pricing');
      return ((res.data['data'] as List?) ?? []).cast<Map<String, dynamic>>();
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  Future<void> setPricing(String orderId, {required double transportAmount, required List<Map<String, dynamic>> items, String? beneficiary}) async {
    try {
      await _client.patch('/orders/admin/$orderId/pricing', data: {
        'transportAmount': transportAmount,
        'items': items,
        if (beneficiary != null) 'transportBeneficiary': beneficiary,
      });
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  Future<List<Map<String, dynamic>>> pendingPayments() async {
    try {
      final res = await _client.get('/payments/pending');
      return ((res.data['data'] as List?) ?? []).cast<Map<String, dynamic>>();
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  Future<void> approvePayment(String id) async {
    try {
      await _client.patch('/payments/$id/approve');
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  Future<void> rejectPayment(String id, String reason) async {
    try {
      await _client.patch('/payments/$id/reject', data: {'reason': reason});
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  Future<List<Map<String, dynamic>>> allOrders() async {
    try {
      final res = await _client.get('/admin/orders');
      return ((res.data['data'] as List?) ?? []).cast<Map<String, dynamic>>();
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }
}
