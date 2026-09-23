import 'package:dio/dio.dart';
import '../../../core/network/api_client.dart';

class TraderService {
  final _client = ApiClient();

  // === السائقون ===
  Future<List<Map<String, dynamic>>> listDrivers() async {
    try {
      final res = await _client.get('/traders/me/drivers');
      final list = (res.data['data'] as List?) ?? [];
      return list.cast<Map<String, dynamic>>();
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  Future<Map<String, dynamic>> addDriver({
    required String fullName,
    required String phone,
    String? password,
    String? vehiclePlate,
    String? vehicleType,
    double? capacityTons,
  }) async {
    try {
      final res = await _client.post('/traders/me/drivers', data: {
        'fullName': fullName,
        'phone': phone,
        if (password != null && password.isNotEmpty) 'password': password,
        if (vehiclePlate != null && vehiclePlate.isNotEmpty) 'vehiclePlate': vehiclePlate,
        if (vehicleType != null) 'vehicleType': vehicleType,
        if (capacityTons != null) 'capacityTons': capacityTons,
      });
      return res.data['data'] as Map<String, dynamic>;
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  Future<void> removeDriver(String driverId) async {
    try {
      await _client.delete('/traders/me/drivers/$driverId');
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  // === القاطرات ===
  Future<List<Map<String, dynamic>>> listVehicles() async {
    try {
      final res = await _client.get('/traders/me/vehicles');
      final list = (res.data['data'] as List?) ?? [];
      return list.cast<Map<String, dynamic>>();
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  Future<Map<String, dynamic>> addVehicle({
    required String plateNumber,
    String? vehicleType,
    double? capacityTons,
    int? capacityBags,
    String? currentDriverId,
    String? notes,
  }) async {
    try {
      final res = await _client.post('/traders/me/vehicles', data: {
        'plateNumber': plateNumber,
        if (vehicleType != null) 'vehicleType': vehicleType,
        if (capacityTons != null) 'capacityTons': capacityTons,
        if (capacityBags != null) 'capacityBags': capacityBags,
        if (currentDriverId != null) 'currentDriverId': currentDriverId,
        if (notes != null && notes.isNotEmpty) 'notes': notes,
      });
      return res.data['data'] as Map<String, dynamic>;
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  Future<void> removeVehicle(String vehicleId) async {
    try {
      await _client.delete('/traders/me/vehicles/$vehicleId');
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  // === طلب فاكس لسائقي ===
  Future<Map<String, dynamic>> requestFaxForDriver({
    required String driverId,
    required String factoryId,
    required String vehicleId,
    required double quantity,
    String? notes,
  }) async {
    try {
      final res = await _client.post('/faxes/request-for-driver', data: {
        'driverId': driverId,
        'factoryId': factoryId,
        'vehicleId': vehicleId,
        'quantity': quantity,
        if (notes != null && notes.isNotEmpty) 'notes': notes,
      });
      return res.data['data'] as Map<String, dynamic>;
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }
}

extension TraderServiceFactories on TraderService {
  Future<List<Map<String, dynamic>>> factories() async {
    try {
      final res = await ApiClient().get('/sources');
      final list = (res.data['data'] as List?) ?? [];
      return list.cast<Map<String, dynamic>>();
    } catch (e) {
      return [];
    }
  }
}
