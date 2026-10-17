import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';

/// تنسيق التاريخ YYYY-MM-DD كما يتوقعه الخادم.
String formatDateYmd(DateTime d) =>
    '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// تقرير فاكسات المصنع (قراءة فقط). الحساب كله في الخادم.
class FactoryReportService {
  final _client = ApiClient();

  Future<Map<String, dynamic>> report({
    required String factoryId,
    required DateTime from,
    required DateTime to,
  }) async {
    try {
      final res = await _client.dio.get(
        '/faxes/reports/factory',
        queryParameters: {'factoryId': factoryId, 'from': formatDateYmd(from), 'to': formatDateYmd(to)},
      );
      return (res.data['data'] as Map).cast<String, dynamic>();
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }
}
