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
      
      // عرض رسالة الخطأ الأساسية
      final mainMsg = data['message']?.toString();
      
      // إضافة تفاصيل حقول التحقق (Zod)
      if (data['errors'] is List && (data['errors'] as List).isNotEmpty) {
        final details = (data['errors'] as List)
            .map((e) {
              if (e is Map) {
                final field = e['field'] ?? e['path'] ?? '';
                final msg = e['message'] ?? '';
                return '$field: $msg';
              }
              return e.toString();
            })
            .join('\n');
        return '$mainMsg\n$details';
      }
      
      if (mainMsg != null) return mainMsg;
    }
    
    final type = error.type;
    if (type == DioExceptionType.connectionTimeout ||
        type == DioExceptionType.receiveTimeout ||
        type == DioExceptionType.sendTimeout) {
      return 'الخادم بطيء، جاري إعادة المحاولة...';
    }
    if (type == DioExceptionType.connectionError) {
      return 'تحقق من الاتصال بالإنترنت ثم أعد المحاولة';
    }
    if (type == DioExceptionType.badCertificate) {
      return 'خطأ في شهادة الأمان';
    }
    if (type == DioExceptionType.cancel) {
      return 'تم إلغاء الطلب';
    }
    if (type == DioExceptionType.badResponse) {
      return 'خطأ في الخادم: ${error.response?.statusCode}';
    }
    return 'خطأ في الاتصال بالخادم';
  }
  return 'حدث خطأ غير متوقع';
}
