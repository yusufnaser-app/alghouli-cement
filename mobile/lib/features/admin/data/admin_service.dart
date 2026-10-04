import 'package:dio/dio.dart';
import '../../../core/network/api_client.dart';

class AdminService {
  final ApiClient _client = ApiClient(); // made public for extensions

  // ═══ Dashboard ═══
  Future<Map<String, dynamic>> dashboard() async {
    try {
      final res = await _client.get('/admin/dashboard');
      return Map<String, dynamic>.from(res.data['data'] as Map);
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  // ═══ Orders ═══
  Future<List<Map<String, dynamic>>> pendingPricing() async {
    try {
      final res = await _client.get('/orders/admin/pending-pricing');
      return ((res.data['data'] as List?) ?? []).cast<Map<String, dynamic>>();
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  Future<void> setPricing(String orderId, {required double transportAmount, required List<Map<String, dynamic>> items, String? beneficiary}) async {
    try {
      await _client.patch('/orders/admin/$orderId/pricing', data: {
        'transportAmount': transportAmount,
        'items': items,
        if (beneficiary != null) 'transportBeneficiary': beneficiary,
      });
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  Future<List<Map<String, dynamic>>> allOrders() async {
    try {
      final res = await _client.get('/admin/orders');
      return ((res.data['data'] as List?) ?? []).cast<Map<String, dynamic>>();
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  // ═══ Payments ═══
  Future<List<Map<String, dynamic>>> pendingPayments() async {
    try {
      final res = await _client.get('/payments/pending');
      return ((res.data['data'] as List?) ?? []).cast<Map<String, dynamic>>();
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  Future<void> approvePayment(String id) async {
    try { await _client.patch('/payments/$id/approve'); }
    on DioException catch (e) { throw Exception(handleApiError(e)); }
  }

  Future<void> rejectPayment(String id, String reason) async {
    try { await _client.patch('/payments/$id/reject', data: {'reason': reason}); }
    on DioException catch (e) { throw Exception(handleApiError(e)); }
  }

  // ═══ Faxes ═══
  Future<List<Map<String, dynamic>>> faxes({String? status}) async {
    try {
      // نجلب من operations-center الذي يحتوي كل الحالات
      final res = await _client.get('/faxes/operations-center');
      final data = res.data['data'];
      if (data is! Map) return [];

      // نجمع كل الفاكسات من كل القوائم (أي مفتاح يحتوي list of faxes)
      final all = <Map<String, dynamic>>[];
      for (final entry in data.entries) {
        final list = entry.value;
        if (list is List) {
          for (final item in list) {
            if (item is Map && item['fax_number'] != null) {
              all.add(Map<String, dynamic>.from(item));
            }
          }
        }
      }

      // نُزيل التكرار
      final seen = <String>{};
      final unique = <Map<String, dynamic>>[];
      for (final f in all) {
        final id = f['id']?.toString();
        if (id != null && !seen.contains(id)) {
          seen.add(id);
          unique.add(f);
        }
      }

      if (status == null) return unique;
      return unique.where((f) => f['status'] == status).toList();
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  Future<Map<String, dynamic>> operationsCenter() async {
    try {
      final res = await _client.get('/faxes/operations-center');
      return Map<String, dynamic>.from(res.data['data'] as Map);
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  Future<void> createFax({
    required String factoryId,
    required String driverId,
    required String vehicleId,
    required double quantity,
    String? orderId,
    String? notes,
  }) async {
    try {
      await _client.post('/faxes/staff/create', data: {
        'factoryId': factoryId,
        'driverId': driverId,
        'vehicleId': vehicleId,
        'quantity': quantity,
        if (orderId != null && orderId.isNotEmpty) 'orderId': orderId,
        if (notes != null && notes.isNotEmpty) 'notes': notes,
      });
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  Future<void> approveFax(String id) async {
    try { await _client.patch('/faxes/$id/approve'); }
    on DioException catch (e) { throw Exception(handleApiError(e)); }
  }

  Future<void> issueFax(String id, String faxNumber) async {
    try { await _client.patch('/faxes/$id/issue', data: {'faxNumber': faxNumber}); }
    on DioException catch (e) { throw Exception(handleApiError(e)); }
  }

  Future<void> issueAndNotify(String id, String faxNumber) async {
    try { await _client.patch('/faxes/$id/issue-and-notify', data: {'faxNumber': faxNumber}); }
    on DioException catch (e) { throw Exception(handleApiError(e)); }
  }

  Future<void> cancelFax(String id, {String? reason}) async {
    try { await _client.patch('/faxes/$id/cancel', data: {if (reason != null) 'reason': reason}); }
    on DioException catch (e) { throw Exception(handleApiError(e)); }
  }

  // ═══ Lookups ═══
  Future<List<Map<String, dynamic>>> sources() async {
    try {
      final res = await _client.get('/sources');
      return ((res.data['data'] as List?) ?? []).cast<Map<String, dynamic>>();
    } on DioException catch (e) { throw Exception(handleApiError(e)); }
  }

  Future<List<Map<String, dynamic>>> drivers() async {
    try {
      final res = await _client.get('/drivers');
      return ((res.data['data'] as List?) ?? []).cast<Map<String, dynamic>>();
    } on DioException catch (e) { throw Exception(handleApiError(e)); }
  }

  Future<List<Map<String, dynamic>>> vehicles() async {
    try {
      final res = await _client.get('/vehicles');
      return ((res.data['data'] as List?) ?? []).cast<Map<String, dynamic>>();
    } on DioException catch (e) { throw Exception(handleApiError(e)); }
  }

  Future<List<Map<String, dynamic>>> customers() async {
    try {
      final res = await _client.get('/admin/customers');
      return ((res.data['data'] as List?) ?? []).cast<Map<String, dynamic>>();
    } on DioException catch (e) { throw Exception(handleApiError(e)); }
  }

  // ═══ Accounting ═══
  Future<Map<String, dynamic>> integrityCheck() async {
    try {
      final res = await _client.get('/accounting/integrity-check');
      return Map<String, dynamic>.from(res.data['data'] as Map);
    } on DioException catch (e) { throw Exception(handleApiError(e)); }
  }
}

// ═══════════════ v2 extensions ═══════════════

extension AdminServiceV2 on AdminService {
  // Bulk Faxes
  Future<List<Map<String, dynamic>>> bulkFaxSuggestions({String? driverType}) async {
    try {
      final res = await _client.get('/bulk-fax/suggestions',
          query: {if (driverType != null) 'driverType': driverType});
      return ((res.data['data'] as List?) ?? []).cast<Map<String, dynamic>>();
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  Future<Map<String, dynamic>> createBulkFaxes(List<Map<String, dynamic>> items) async {
    try {
      final res = await _client.post('/bulk-fax/create', data: {'items': items});
      return Map<String, dynamic>.from(res.data['data'] as Map);
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  // Reports
  Future<Map<String, dynamic>> reportsSummary() async {
    try {
      final res = await _client.get('/reports/summary');
      return Map<String, dynamic>.from(res.data['data'] as Map);
    } on DioException catch (e) { throw Exception(handleApiError(e)); }
  }

  Future<List<Map<String, dynamic>>> reportsDaily() async {
    try {
      final res = await _client.get('/reports/daily');
      return ((res.data['data'] as List?) ?? []).cast<Map<String, dynamic>>();
    } on DioException catch (e) { throw Exception(handleApiError(e)); }
  }

  Future<List<Map<String, dynamic>>> reportsBySource() async {
    try {
      final res = await _client.get('/reports/by-source');
      return ((res.data['data'] as List?) ?? []).cast<Map<String, dynamic>>();
    } on DioException catch (e) { throw Exception(handleApiError(e)); }
  }

  // Settings
  Future<List<Map<String, dynamic>>> settingsList() async {
    try {
      final res = await _client.get('/settings');
      return ((res.data['data'] as List?) ?? []).cast<Map<String, dynamic>>();
    } on DioException catch (e) { throw Exception(handleApiError(e)); }
  }

  Future<void> updateSettings(Map<String, dynamic> data) async {
    try { await _client.put('/settings', data: data); }
    on DioException catch (e) { throw Exception(handleApiError(e)); }
  }

  // Drivers admin
  Future<List<Map<String, dynamic>>> driversAdmin() async {
    try {
      final res = await _client.get('/drivers-admin');
      return ((res.data['data'] as List?) ?? []).cast<Map<String, dynamic>>();
    } on DioException catch (e) { throw Exception(handleApiError(e)); }
  }

  Future<Map<String, dynamic>> driverStatement(String id) async {
    try {
      final res = await _client.get('/drivers-admin/$id/statement');
      return Map<String, dynamic>.from(res.data['data'] as Map);
    } on DioException catch (e) { throw Exception(handleApiError(e)); }
  }
}

extension AdminServiceUsers on AdminService {
  ApiClient get _api => ApiClient();

  Future<List<Map<String, dynamic>>> adminUsers({String? userType, String? status, String? search, String? role}) async {
    try {
      final res = await _api.get('/admin/users', query: {
        if (userType != null) 'user_type': userType,
        if (status != null) 'status': status,
        if (search != null && search.isNotEmpty) 'search': search,
        if (role != null) 'role': role,
      });
      return ((res.data['data'] as List?) ?? []).cast<Map<String, dynamic>>();
    } on DioException catch (e) { throw Exception(handleApiError(e)); }
  }

  Future<List<Map<String, dynamic>>> adminRoles() async {
    try {
      final res = await _api.get('/admin/roles');
      return ((res.data['data'] as List?) ?? []).cast<Map<String, dynamic>>();
    } on DioException catch (e) { throw Exception(handleApiError(e)); }
  }

  Future<Map<String, dynamic>> createUser(Map<String, dynamic> data) async {
    try {
      final res = await _api.post('/admin/users', data: data);
      return Map<String, dynamic>.from(res.data['data'] as Map);
    } on DioException catch (e) { throw Exception(handleApiError(e)); }
  }

  Future<void> updateUser(String id, Map<String, dynamic> data) async {
    try { await _api.patch('/admin/users/$id', data: data); }
    on DioException catch (e) { throw Exception(handleApiError(e)); }
  }

  Future<void> setUserRoles(String id, List<String> roles) async {
    try { await _api.patch('/admin/users/$id/roles', data: {'roles': roles}); }
    on DioException catch (e) { throw Exception(handleApiError(e)); }
  }

  Future<void> setUserStatus(String id, String status) async {
    try { await _api.patch('/admin/users/$id/status', data: {'status': status}); }
    on DioException catch (e) { throw Exception(handleApiError(e)); }
  }

  Future<void> resetUserPassword(String id, String password) async {
    try { await _api.post('/admin/users/$id/reset-password', data: {'password': password}); }
    on DioException catch (e) { throw Exception(handleApiError(e)); }
  }
}

extension AdminServiceUserDetail on AdminService {
  Future<Map<String, dynamic>> userDetails(String id) async {
    try {
      final api = ApiClient();
      final res = await api.get('/admin/users/$id/details');
      return Map<String, dynamic>.from(res.data['data'] as Map);
    } on DioException catch (e) { throw Exception(handleApiError(e)); }
  }
}


// ═══════════════════ Multi-Drop Destinations ═══════════════════
extension AdminServiceDestinations on AdminService {
  ApiClient get _api => ApiClient();

  Future<List<Map<String, dynamic>>> faxDestinations(String faxId) async {
    try {
      final res = await _api.get('/faxes/$faxId/destinations');
      return ((res.data['data'] as List?) ?? []).cast<Map<String, dynamic>>();
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  Future<List<Map<String, dynamic>>> warehouses() async {
    try {
      final res = await _api.get('/faxes/warehouses/list');
      return ((res.data['data'] as List?) ?? []).cast<Map<String, dynamic>>();
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  Future<List<Map<String, dynamic>>> tradersList() async {
    try {
      final res = await _api.get('/faxes/traders/list');
      return ((res.data['data'] as List?) ?? []).cast<Map<String, dynamic>>();
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  Future<void> saveDestinations(String faxId, List<Map<String, dynamic>> destinations) async {
    try {
      await _api.put('/faxes/$faxId/destinations', data: {'destinations': destinations});
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }
}
