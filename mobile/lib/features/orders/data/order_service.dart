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
    String? traderDriverId,
    String? traderVehicleId,
    bool faxRequested = false,
    String? transportBeneficiary,
  }) async {
    try {
      final body = <String, dynamic>{
        'deliveryType': deliveryType,
        'items': items,
        // لا سعر ولا طريقة دفع هنا إطلاقًا — الموظف يسعّر لاحقًا،
        // ثم يختار العميل طريقة السداد عبر choosePayment بعد معرفة السعر.
      };
      if (addressId != null) body['addressId'] = addressId;
      if (notes != null && notes.isNotEmpty) body['notes'] = notes;
      if (traderTruckPlate != null && traderTruckPlate.isNotEmpty)
        body['traderTruckPlate'] = traderTruckPlate;
      if (traderDriverName != null && traderDriverName.isNotEmpty)
        body['traderDriverName'] = traderDriverName;
      if (traderDriverPhone != null && traderDriverPhone.isNotEmpty)
        body['traderDriverPhone'] = traderDriverPhone;
      if (traderDriverId != null) body['traderDriverId'] = traderDriverId;
      if (traderVehicleId != null) body['traderVehicleId'] = traderVehicleId;
      body['faxRequested'] = faxRequested;
      if (transportBeneficiary != null) body['transportBeneficiary'] = transportBeneficiary;

      final res = await _client.post('/orders', data: body);
      return res.data['data'] as Map<String, dynamic>;
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  /// اختيار طريقة السداد بعد أن يحدد الموظف السعر (الحالة PENDING_PAYMENT_METHOD).
  Future<Map<String, dynamic>> choosePayment({
    required String orderId,
    required String paymentTerms, // network_transfer | e_wallet | on_account
    double? paidAmountNow,
  }) async {
    try {
      final body = <String, dynamic>{'paymentTerms': paymentTerms};
      if (paidAmountNow != null) body['paidAmountNow'] = paidAmountNow;
      final res = await _client.patch('/orders/$orderId/choose-payment', data: body);
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
