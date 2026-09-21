import 'package:dio/dio.dart';
import '../constants/app_config.dart';
import '../storage/local_storage.dart';

class ApiClient {
  static final ApiClient _instance = ApiClient._internal();
  factory ApiClient() => _instance;

  late final Dio dio;

  ApiClient._internal() {
    dio = Dio(
      BaseOptions(
        baseUrl: AppConfig.apiBaseUrl,
        connectTimeout: AppConfig.apiTimeout,
        receiveTimeout: AppConfig.apiTimeout,
        sendTimeout: AppConfig.apiTimeout,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      ),
    );

    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await LocalStorage.getToken();
          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          handler.next(options);
        },
        onError: (error, handler) async {
          if (error.response?.statusCode == 401) {
            await LocalStorage.clearAll();
          }
          handler.next(error);
        },
      ),
    );
  }

  Future<Response> get(String path, {Map<String, dynamic>? query}) {
    return _retry(() => dio.get(path, queryParameters: query));
  }

  Future<Response> post(String path, {dynamic data}) {
    return _retry(() => dio.post(path, data: data));
  }

  Future<Response> put(String path, {dynamic data}) {
    return _retry(() => dio.put(path, data: data));
  }

  Future<Response> patch(String path, {dynamic data}) {
    return _retry(() => dio.patch(path, data: data));
  }

  Future<Response> delete(String path) {
    return _retry(() => dio.delete(path));
  }

  Future<Response> _retry(Future<Response> Function() fn) async {
    try {
      return await fn();
    } on DioException catch (e) {
      // أعد المحاولة فقط عند فشل الاتصال (ليس عند خطأ منطقي)
      if (e.type == DioExceptionType.connectionError ||
          e.type == DioExceptionType.connectionTimeout ||
          e.type == DioExceptionType.receiveTimeout) {
        await Future.delayed(const Duration(seconds: 3));
        return await fn();
      }
      rethrow;
    }
  }
}

class ApiException implements Exception {
  final String message;
  final int? statusCode;
  final String? code;

  ApiException(this.message, {this.statusCode, this.code});

  @override
  String toString() => message;
}

String handleApiError(dynamic error) {
  if (error is DioException) {
    if (error.response?.data is Map) {
      final data = error.response!.data as Map;
      if (data['message'] != null) return data['message'].toString();
    }
    switch (error.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.sendTimeout:
        return 'الخادم بطيء، جاري إعادة المحاولة...';
      case DioExceptionType.connectionError:
        return 'تحقق من الاتصال بالإنترنت ثم أعد المحاولة';
      case DioExceptionType.badCertificate:
        return 'خطأ في شهادة الأمان';
      case DioExceptionType.cancel:
        return 'تم إلغاء الطلب';
      case DioExceptionType.badResponse:
        return 'خطأ في الخادم: ${error.response?.statusCode}';
      case DioExceptionType.unknown:
        return 'خطأ غير معروف في الاتصال';
    }
  }
  return 'حدث خطأ غير متوقع';
}
