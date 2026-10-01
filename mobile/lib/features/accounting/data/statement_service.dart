import 'package:dio/dio.dart';
import '../../../core/network/api_client.dart';

class StatementService {
  final _client = ApiClient();

  Future<Map<String, dynamic>> myStatement({int limit = 100, int offset = 0}) async {
    try {
      final res = await _client.get('/accounting/my-statement', query: {
        'limit': limit,
        'offset': offset,
      });
      return Map<String, dynamic>.from(res.data['data'] as Map);
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }
}
