import 'package:dio/dio.dart';
import '../../../core/network/api_client.dart';

class PaymentService {
  final _client = ApiClient();

  Future<List<Map<String, dynamic>>> methods() async {
    try {
      final res = await _client.get('/payments/methods');
      final list = (res.data['data'] as List?) ?? [];
      return list.cast<Map<String, dynamic>>();
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  Future<Map<String, dynamic>> submit({
    required String orderId,
    required String methodId,
    required double amount,
    required String transferDate,
    String? transactionRef,
  }) async {
    try {
      final res = await _client.post('/payments', data: {
        'orderId': orderId,
        'methodId': methodId,
        'amountTransferred': amount,
        'transferDate': transferDate,
        if (transactionRef != null && transactionRef.isNotEmpty)
          'transactionRef': transactionRef,
      });
      return res.data['data'] as Map<String, dynamic>;
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }
}
