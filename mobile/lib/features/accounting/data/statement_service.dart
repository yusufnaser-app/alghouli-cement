import 'package:dio/dio.dart';
import '../../../core/network/api_client.dart';

class StatementService {
  final _client = ApiClient();

  Future<Map<String, dynamic>> myStatement({String? from, String? to, String? currency}) async {
    try {
      final res = await _client.get('/accounting/my-statement', query: {
        if (from != null) 'from': from,
        if (to != null) 'to': to,
        if (currency != null) 'currency': currency,
      });
      return Map<String, dynamic>.from(res.data['data'] as Map);
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }
}
