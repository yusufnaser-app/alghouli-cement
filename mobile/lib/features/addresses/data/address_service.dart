import 'package:dio/dio.dart';
import '../../../core/network/api_client.dart';
import '../domain/address_model.dart';

class AddressService {
  final _client = ApiClient();

  Future<List<Address>> list() async {
    try {
      final res = await _client.get('/customers/me/addresses');
      final list = (res.data['data'] as List?) ?? [];
      return list.map((e) => Address.fromJson(e)).toList();
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  Future<Address> add({
    required String label,
    required String governorate,
    required String area,
    required String addressText,
    String? altPhone,
    bool isDefault = false,
  }) async {
    try {
      final res = await _client.post('/customers/me/addresses', data: {
        'label': label,
        'governorate': governorate,
        'area': area,
        'addressText': addressText,
        if (altPhone != null) 'altPhone': altPhone,
        'isDefault': isDefault,
      });
      return Address.fromJson(res.data['data']);
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  Future<void> delete(String id) async {
    try {
      await _client.delete('/customers/me/addresses/$id');
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }
}
