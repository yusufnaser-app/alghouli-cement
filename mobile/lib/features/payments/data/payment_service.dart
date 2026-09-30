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

  Future<Map<String, dynamic>> uploadReceipt(String filePath) async {
    try {
      final form = FormData.fromMap({
        'type': 'receipt',
        'file': await MultipartFile.fromFile(filePath, filename: filePath.split('/').last),
      });
      final res = await _client.post('/files/upload', data: form);
      return Map<String, dynamic>.from(res.data['data'] as Map);
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
    String? receiptUrl,
    String? receiptPath,
  }) async {
    try {
      final res = await _client.post('/payments', data: {
        'orderId': orderId,
        'methodId': methodId,
        'amountTransferred': amount,
        'transferDate': transferDate,
        if (transactionRef != null && transactionRef.isNotEmpty)
          'transactionRef': transactionRef,
        if (receiptUrl != null && receiptUrl.isNotEmpty) 'receiptUrl': receiptUrl,
        if (receiptPath != null && receiptPath.isNotEmpty) 'receiptPath': receiptPath,
      });
      return res.data['data'] as Map<String, dynamic>;
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }
}
