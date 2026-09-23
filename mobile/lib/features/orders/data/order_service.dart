import 'package:dio/dio.dart';
import '../../../core/network/api_client.dart';

class OrderService {
  final _client = ApiClient();

  Future<Map<String, dynamic>> createOrder({
    String? addressId,
    required List<Map<String, dynamic>> items,
    String? notes,
    String deliveryType = 'alghouli_delivery',
    String? traderTruckPlate,
    String? traderDriverName,
    String? traderDriverPhone,
    String paymentTerms = 'cash',
  }) async {
    try {
      final body = <String, dynamic>{
        'deliveryType': deliveryType,
        'items': items,
        'paymentTerms': paymentTerms,
      };
      if (addressId != null) body['addressId'] = addressId;
      if (notes != null && notes.isNotEmpty) body['notes'] = notes;
      if (traderTruckPlate != null && traderTruckPlate.isNotEmpty)
        body['traderTruckPlate'] = traderTruckPlate;
      if (traderDriverName != null && traderDriverName.isNotEmpty)
        body['traderDriverName'] = traderDriverName;
      if (traderDriverPhone != null && traderDriverPhone.isNotEmpty)
        body['traderDriverPhone'] = traderDriverPhone;

      final res = await _client.post('/orders', data: body);
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
