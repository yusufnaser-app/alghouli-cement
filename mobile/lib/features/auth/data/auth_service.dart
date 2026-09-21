import 'package:dio/dio.dart';
import '../../../core/network/api_client.dart';
import '../../../core/storage/local_storage.dart';
import '../domain/models/user_model.dart';

class AuthResult {
  final String token;
  final String refreshToken;
  final UserModel user;

  AuthResult({
    required this.token,
    required this.refreshToken,
    required this.user,
  });
}

class AuthService {
  final _client = ApiClient();

  Future<Map<String, dynamic>> register({
    required String fullName,
    required String phone,
    required String customerType,
    required String governorate,
    String? area,
    String? address,
  }) async {
    try {
      final res = await _client.post('/auth/register', data: {
        'fullName': fullName,
        'phone': phone,
        'customerType': customerType,
        'governorate': governorate,
        if (area != null) 'area': area,
        if (address != null) 'address': address,
      });
      return res.data['data'] as Map<String, dynamic>;
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  Future<AuthResult> verifyOtp({
    required String phone,
    required String otp,
  }) async {
    try {
      final res = await _client.post('/auth/verify-otp', data: {
        'phone': phone,
        'otp': otp,
      });
      final data = res.data['data'];
      final result = AuthResult(
        token: data['token'],
        refreshToken: data['refreshToken'],
        user: UserModel.fromJson(data['user']),
      );
      await LocalStorage.saveToken(result.token);
      await LocalStorage.saveRefreshToken(result.refreshToken);
      return result;
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  Future<AuthResult> login({
    required String phone,
    required String password,
  }) async {
    try {
      final res = await _client.post('/auth/login', data: {
        'phone': phone,
        'password': password,
      });
      final data = res.data['data'];
      final result = AuthResult(
        token: data['token'],
        refreshToken: data['refreshToken'],
        user: UserModel.fromJson(data['user']),
      );
      await LocalStorage.saveToken(result.token);
      await LocalStorage.saveRefreshToken(result.refreshToken);
      return result;
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  Future<UserModel?> me() async {
    try {
      final res = await _client.get('/auth/me');
      final data = res.data['data'];
      return UserModel(
        id: data['id'] ?? '',
        fullName: data['full_name'] ?? data['fullName'] ?? '',
        phone: data['phone'] ?? '',
        userType: data['user_type'] ?? data['userType'] ?? '',
        customerType: data['customer_type'] ?? data['customerType'],
        roles: (data['roles'] as List?)?.map((e) => e.toString()).toList() ?? [],
      );
    } catch (_) {
      return null;
    }
  }

  Future<void> logout() async {
    await LocalStorage.clearAll();
  }
}
