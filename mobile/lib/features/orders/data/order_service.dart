import 'package:dio/dio.dart';
import '../../../core/network/api_client.dart';

class OrderService {
  final _client = ApiClient();

  Future<Map<String, dynamic>> createOrder({
    required String addressId,
    required List<Map<String, dynamic>> items,
    String? notes,
  }) async {
    try {
      final res = await _client.post('/orders', data: {
        'addressId': addressId,
        'items': items,
        if (notes != null && notes.isNotEmpty) 'notes': notes,
      });
      return res.data['data'] as Map<String, dynamic>;
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  Future<List<Map<String, dynamic>>> myOrders() async {
    try {
      final res = await _client.get('/orders');
      final list = (res.data['data'] as List?) ?? [];
      return list.cast<Map<String, dynamic>>();
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  Future<Map<String, dynamic>> orderDetails(String id) async {
    try {
      final res = await _client.get('/orders/$id');
      return res.data['data'] as Map<String, dynamic>;
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  Future<void> cancelOrder(String id, String reason) async {
    try {
      await _client.patch('/orders/$id/cancel', data: {'reason': reason});
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }
}
