import 'package:dio/dio.dart';
import '../../../core/network/api_client.dart';

class InvoiceService {
  final _client = ApiClient();

  Future<List<Map<String, dynamic>>> myInvoices() async {
    try {
      final res = await _client.get('/invoices');
      final list = (res.data['data'] as List?) ?? [];
      return list.cast<Map<String, dynamic>>();
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  Future<Map<String, dynamic>> invoiceDetails(String id) async {
    try {
      final res = await _client.get('/invoices/$id');
      return res.data['data'] as Map<String, dynamic>;
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }
}
