import 'package:dio/dio.dart';
import '../../../core/network/api_client.dart';

class CustomerSummary {
  final double currentBalance;
  final double creditLimit;
  final double totalPurchases;
  final double totalPayments;
  final int totalOrders;
  final double availableCredit;

  CustomerSummary({
    required this.currentBalance,
    required this.creditLimit,
    required this.totalPurchases,
    required this.totalPayments,
    required this.totalOrders,
    required this.availableCredit,
  });

  factory CustomerSummary.fromJson(Map<String, dynamic> json) {
    final balance = double.tryParse(json['current_balance']?.toString() ?? '0') ?? 0;
    final limit = double.tryParse(json['credit_limit']?.toString() ?? '0') ?? 0;
    return CustomerSummary(
      currentBalance: balance,
      creditLimit: limit,
      totalPurchases: double.tryParse(json['total_purchases']?.toString() ?? '0') ?? 0,
      totalPayments: double.tryParse(json['total_payments']?.toString() ?? '0') ?? 0,
      totalOrders: json['total_orders'] ?? 0,
      availableCredit: limit > 0 ? (limit - balance) : 0,
    );
  }
}

class WalletService {
  final _client = ApiClient();

  Future<CustomerSummary> getSummary() async {
    try {
      final res = await _client.get('/customers/me/summary');
      return CustomerSummary.fromJson(res.data['data'] ?? {});
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  Future<List<Map<String, dynamic>>> getLedger() async {
    try {
      final res = await _client.get('/customers/me/ledger');
      final list = (res.data['data'] as List?) ?? [];
      return list.cast<Map<String, dynamic>>();
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  Future<Map<String, dynamic>> checkCredit(double amount) async {
    try {
      final res = await _client.get('/orders/credit-check',
          query: {'amount': amount.toString()});
      return res.data['data'] as Map<String, dynamic>;
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  Future<double> calculateTransport({
    required String governorate,
    required String area,
    required String packagingType,
    required double quantity,
    required String unit,
  }) async {
    try {
      final res = await _client.get('/transport/calculate', query: {
        'governorate': governorate,
        'area': area,
        'packaging_type': packagingType,
        'quantity': quantity.toString(),
        'unit': unit,
      });
      return double.tryParse(res.data['data']['amount']?.toString() ?? '0') ?? 0;
    } catch (_) {
      return 0;
    }
  }
}
