import 'package:dio/dio.dart';
import '../../../core/network/api_client.dart';

class NotificationService {
  final _client = ApiClient();

  Future<List<Map<String, dynamic>>> list({bool unreadOnly = false}) async {
    try {
      final res = await _client.get('/notifications',
          query: unreadOnly ? {'unreadOnly': 'true'} : null);
      final list = (res.data['data'] as List?) ?? [];
      return list.cast<Map<String, dynamic>>();
    } on DioException catch (e) {
      throw Exception(handleApiError(e));
    }
  }

  Future<int> unreadCount() async {
    try {
      final res = await _client.get('/notifications/unread-count');
      return res.data['data']['count'] as int? ?? 0;
    } catch (_) {
      return 0;
    }
  }

  Future<void> markRead(String id) async {
    try {
      await _client.patch('/notifications/$id/read');
    } catch (_) {}
  }

  Future<void> markAllRead() async {
    try {
      await _client.patch('/notifications/read-all');
    } catch (_) {}
  }

  Future<void> remove(String id) async {
    try {
      await _client.delete('/notifications/$id');
    } catch (_) {}
  }
}
