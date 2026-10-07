import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import '../../../core/network/api_client.dart';

class AdminService {
  final ApiClient _client = ApiClient(); // made public for extensions

  /// يستخرج قائمة من استجابة الـ API بشكل متسامح:
  /// {data:[...]} أو {data:{items|rows|orders|payments:[...]}} أو [...] مباشرة.
  /// لا يطبع أي توكن أو بيانات حساسة، عدد النتائج فقط (وفي وضع التطوير فقط).
  
List<Map<String, dynamic>> _asList(dynamic body, String tag) {
    dynamic d = body is Map ? body['data'] : body;
    if (d is Map) {
      d = d['items'] ?? d['rows'] ?? d['orders'] ?? d['payments'] ?? d['list'];
    }
    final out = <Map<String, dynamic>>[];
    if (d is List) {
      for (final e in d) {
        if (e is Map) out.add(Map<String, dynamic>.from(e));
      }
    } else if (d != null) {
      if (kDebugMode) debugPrint('[$tag] unexpected data type: ${d.runtimeType}');
    }
    if (kDebugMode) debugPrint('[$tag] API OK, count=${out.length}');
    return out;
  }

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
      return _asList(res.data, 'PRICING');
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  Future<void> setPricing(String orderId, {required double transportAmount, required List<Map<String, dynamic>> items, String? beneficiary, String? transportMode, String? reason}) async {
    try {
      await _client.patch('/orders/admin/$orderId/pricing', data: {
        'transportAmount': transportAmount,
        'items': items,
        if (beneficiary != null) 'transportBeneficiary': beneficiary,
        if (transportMode != null) 'transportMode': transportMode,
        if (reason != null && reason.isNotEmpty) 'reason': reason,
      });
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  Future<List<Map<String, dynamic>>> allOrders() async {
    try {
      final res = await _client.get('/admin/orders');
      return _asList(res.data, 'ORDERS');
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  /// طلبات الائتمان المعلقة (تتطلب صلاحية pricing.approve — الأدمن فقط).
  Future<List<Map<String, dynamic>>> pendingCredit() async {
    try {
      final res = await _client.get('/orders/admin/pending-credit');
      return _asList(res.data, 'CREDIT');
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  /// تفاصيل طلب (مع البنود) لشاشة التسعير.
  Future<Map<String, dynamic>> orderDetail(String orderId) async {
    try {
      final res = await _client.get('/orders/$orderId');
      return Map<String, dynamic>.from(res.data['data'] as Map);
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  // ═══ Payments ═══
  Future<List<Map<String, dynamic>>> pendingPayments() async {
    try {
      final res = await _client.get('/payments/pending');
      return _asList(res.data, 'PAYMENTS');
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
            if (item is Map) {   // ✅ لا نفلتر على fax_number — الفاكس قد يكون REQUESTED بدون رقم
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
    String? deliveryGovernorate,
    String? deliveryArea,
  }) async {
    try {
      await _client.post('/faxes/staff/create', data: {
        'factoryId': factoryId,
        'driverId': driverId,
        'vehicleId': vehicleId,
        'quantity': quantity,
        if (orderId != null && orderId.isNotEmpty) 'orderId': orderId,
        if (notes != null && notes.isNotEmpty) 'notes': notes,
        if (deliveryGovernorate != null && deliveryGovernorate.isNotEmpty)
          'deliveryGovernorate': deliveryGovernorate,
        if (deliveryArea != null && deliveryArea.isNotEmpty)
          'deliveryArea': deliveryArea,
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

  /// [transport] اختياري: transportRate / transportRateUnit / transportBaseOn /
  /// transportPayer / transportPayerTraderId / transportPayerNote (يتطلب فاكسًا USED).
  Future<void> saveDestinations(
    String faxId,
    List<Map<String, dynamic>> destinations, {
    Map<String, dynamic>? transport,
  }) async {
    try {
      await _api.put('/faxes/$faxId/destinations', data: {
        'destinations': destinations,
        if (transport != null) ...transport,
      });
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }
}

/// ═══ الكتالوج والتوصيلات (منتجات / تصنيفات / تعيين سائق) ═══
extension AdminCatalogApi on AdminService {
  Future<List<Map<String, dynamic>>> productsList() => _getList('/products', 'PRODUCTS');
  Future<List<Map<String, dynamic>>> categoriesList() => _getList('/categories', 'CATEGORIES');
  Future<List<Map<String, dynamic>>> deliveriesPendingAssignment() =>
      _getList('/deliveries/pending-assignment', 'DELIVERIES');

  /// الرحلات النشطة مع الكمية المتبقية (اختياري: فلتر المحافظة)
  Future<List<Map<String, dynamic>>> availableTrips({String? governorate}) =>
      _getList('/deliveries/available-trips${governorate != null ? '?governorate=${Uri.encodeQueryComponent(governorate)}' : ''}', 'TRIPS');

  /// تكليف طلب على رحلة قائمة
  Future<Map<String, dynamic>> autoAssignOrder(String orderId) => _post('/deliveries/auto-assign/$orderId');

  /// تكليف كل الطلبات المعلقة
  Future<Map<String, dynamic>> autoAssignAll() => _post('/deliveries/auto-assign-all');

  Future<Map<String, dynamic>> _post(String path) async {
    try {
      final res = await _client.post(path);
      final d = res.data is Map ? res.data['data'] : null;
      return d is Map ? Map<String, dynamic>.from(d) : <String, dynamic>{};
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  Future<void> productCreate(Map<String, dynamic> d) => _send('POST', '/products', d);
  Future<void> productUpdate(String id, Map<String, dynamic> d) => _send('PUT', '/products/$id', d);
  Future<void> productDelete(String id) => _send('DELETE', '/products/$id');
  Future<void> categoryCreate(Map<String, dynamic> d) => _send('POST', '/categories', d);
  Future<void> categoryUpdate(String id, Map<String, dynamic> d) => _send('PUT', '/categories/$id', d);
  Future<void> categoryDelete(String id) => _send('DELETE', '/categories/$id');
  Future<void> assignDriver(String orderId, String driverId, String vehicleId) =>
      _send('POST', '/deliveries/order/$orderId/assign', {'driverId': driverId, 'vehicleId': vehicleId});

  Future<List<Map<String, dynamic>>> _getList(String path, String tag) async {
    try {
      final res = await _client.get(path);
      return _asList(res.data, tag);
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  Future<void> _send(String method, String path, [Map<String, dynamic>? data]) async {
    try {
      switch (method) {
        case 'POST': await _client.post(path, data: data); break;
        case 'PUT': await _client.put(path, data: data); break;
        default: await _client.delete(path);
      }
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }
}
