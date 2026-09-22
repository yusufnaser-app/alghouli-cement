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
    final balance = _parseDouble(json['current_balance']);
    final limit = _parseDouble(json['credit_limit']);
    return CustomerSummary(
      currentBalance: balance,
      creditLimit: limit,
      totalPurchases: _parseDouble(json['total_purchases']),
      totalPayments: _parseDouble(json['total_payments']),
      totalOrders: _parseInt(json['total_orders']),
      availableCredit: limit > 0 ? (limit - balance) : 0,
    );
  }

  static double _parseDouble(dynamic v) {
    if (v == null) return 0;
    if (v is num) return v.toDouble();
    return double.tryParse(v.toString()) ?? 0;
  }

  static int _parseInt(dynamic v) {
    if (v == null) return 0;
    if (v is int) return v;
    if (v is num) return v.toInt();
    return int.tryParse(v.toString()) ?? 0;
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
      final v = res.data['data']?['amount'];
      if (v == null) return 0;
      if (v is num) return v.toDouble();
      return double.tryParse(v.toString()) ?? 0;
    } catch (_) {
      return 0;
    }
  }
}
