import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import '../network/api_client.dart';
import '../storage/local_storage.dart';

@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  try {
    await Firebase.initializeApp();
  } catch (e) {
    debugPrint('BG Firebase error: $e');
  }
}

class NotificationService {
  static final NotificationService _instance = NotificationService._();
  factory NotificationService() => _instance;
  NotificationService._();

  final _client = ApiClient();
  String? _initError;

  Future<void> init() async {
    try {
      debugPrint('🔵 Starting Firebase init...');
      await Firebase.initializeApp();
      debugPrint('✅ Firebase initialized');

      FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);

      final settings = await FirebaseMessaging.instance.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );
      debugPrint('📱 Permission: ${settings.authorizationStatus}');

      final token = await FirebaseMessaging.instance.getToken();
      debugPrint('🎫 Token: $token');

      if (token != null) {
        await _sendTokenToServer(token);
      }

      FirebaseMessaging.instance.onTokenRefresh.listen((newToken) {
        debugPrint('🔄 Token refreshed');
        _sendTokenToServer(newToken);
      });

      FirebaseMessaging.onMessage.listen((RemoteMessage message) {
        debugPrint('📬 Foreground: ${message.notification?.title}');
      });

      FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
        debugPrint('👆 Clicked: ${message.data}');
      });

      _initError = null;
    } catch (e) {
      _initError = e.toString();
      debugPrint('❌ Firebase init ERROR: $e');
    }
  }

  Future<Map<String, String>> getTokenDebug() async {
    try {
      if (_initError != null) {
        return {'status': 'init_error', 'token': _initError!};
      }
      final token = await FirebaseMessaging.instance.getToken();
      return {
        'status': token == null ? 'null' : 'ok',
        'token': token ?? 'NULL',
      };
    } catch (e) {
      return {'status': 'error', 'token': e.toString()};
    }
  }

  Future<void> sendTokenAfterLogin() async {
    try {
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null) {
        await _sendTokenToServer(token);
      }
    } catch (e) {
      debugPrint('sendTokenAfterLogin error: $e');
    }
  }

  Future<void> _sendTokenToServer(String token) async {
    try {
      final authToken = await LocalStorage.getToken();
      if (authToken == null || authToken.isEmpty) {
        debugPrint('⚠️ No auth token yet');
        return;
      }

      await _client.post('/notifications/register-token', data: {
        'fcmToken': token,
      });
      debugPrint('✅ Token sent to server');
    } catch (e) {
      debugPrint('⚠️ Failed to send token: $e');
    }
  }
}
