import 'package:dio/dio.dart';
import '../../../core/network/api_client.dart';

class OfferService {
  final _client = ApiClient();

  Future<List<Map<String, dynamic>>> activeOffers() async {
    try {
      final res = await _client.get('/offers/active');
      final list = (res.data['data'] as List?) ?? [];
      return list.cast<Map<String, dynamic>>();
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }
}
