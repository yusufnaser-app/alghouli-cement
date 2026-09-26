import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import '../network/api_client.dart';
import '../storage/local_storage.dart';

@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  debugPrint('Background message: ${message.messageId}');
}

class NotificationService {
  static final NotificationService _instance = NotificationService._();
  factory NotificationService() => _instance;
  NotificationService._();

  final _client = ApiClient();

  Future<void> init() async {
    try {
      await Firebase.initializeApp();

      FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);

      final settings = await FirebaseMessaging.instance.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );

      if (settings.authorizationStatus == AuthorizationStatus.authorized) {
        debugPrint('✅ الإذن ممنوح');
      }

      // الحصول على التوكن
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null) {
        debugPrint('FCM Token: $token');
        await _sendTokenToServer(token);
      }

      // تحديث التوكن عند تغييره
      FirebaseMessaging.instance.onTokenRefresh.listen((newToken) {
        _sendTokenToServer(newToken);
      });

      // رسائل في المقدمة
      FirebaseMessaging.onMessage.listen((RemoteMessage message) {
        debugPrint('Foreground message: ${message.notification?.title}');
      });

      // عند فتح التطبيق من إشعار
      FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
        debugPrint('Notification clicked: ${message.data}');
      });
    } catch (e) {
      debugPrint('❌ خطأ في تهيئة الإشعارات: $e');
    }
  }

  Future<void> _sendTokenToServer(String token) async {
    try {
      final authToken = await LocalStorage.getToken();
      if (authToken == null || authToken.isEmpty) return;

      await _client.post('/notifications/register-token', data: {
        'fcmToken': token,
      });
      debugPrint('✅ تم إرسال التوكن للسيرفر');
    } catch (e) {
      debugPrint('⚠️ لم يُرسل التوكن: $e');
    }
  }
}
