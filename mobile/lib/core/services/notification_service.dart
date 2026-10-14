import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
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

/// القناة نفسها التي يرسل إليها الخادم (android.notification.channelId = alghouli_default).
/// يجب إنشاؤها على الهاتف، وإلا يخفي أندرويد الإشعار أو يكتمه.
const String kNotificationChannelId = 'alghouli_default';
const String kNotificationChannelName = 'تنبيهات الغولي';

class NotificationService {
  static final NotificationService _instance = NotificationService._();
  factory NotificationService() => _instance;
  NotificationService._();

  final _client = ApiClient();
  final _local = FlutterLocalNotificationsPlugin();
  String? _initError;

  Future<void> init() async {
    try {
      debugPrint('🔵 Starting Firebase init...');
      await Firebase.initializeApp();
      debugPrint('✅ Firebase initialized');

      FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);
      await _initLocalNotifications();

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
        _showForeground(message);
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

  /// إنشاء القناة وتهيئة العرض المحلي (يُستدعى مرة واحدة عند التشغيل).
  Future<void> _initLocalNotifications() async {
    try {
      await _local.initialize(
        const InitializationSettings(android: AndroidInitializationSettings('@mipmap/ic_launcher')),
      );
      final android = _local.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
      await android?.createNotificationChannel(const AndroidNotificationChannel(
        kNotificationChannelId,
        kNotificationChannelName,
        description: 'إشعارات الفواكس والطلبات والدفعات',
        importance: Importance.max,
        playSound: true,
        enableVibration: true,
      ));
    } catch (e) {
      debugPrint('⚠️ Local notifications init failed: $e');
    }
  }

  /// يعرض تنبيهًا بصوت أثناء فتح التطبيق (أندرويد لا يعرض إشعار النظام في هذه الحالة).
  Future<void> _showForeground(RemoteMessage message) async {
    final n = message.notification;
    if (n == null) return;
    try {
      await _local.show(
        message.hashCode,
        n.title,
        n.body,
        const NotificationDetails(
          android: AndroidNotificationDetails(
            kNotificationChannelId,
            kNotificationChannelName,
            importance: Importance.max,
            priority: Priority.high,
            playSound: true,
            enableVibration: true,
            icon: '@mipmap/ic_launcher',
          ),
        ),
      );
    } catch (e) {
      debugPrint('⚠️ Show foreground notification failed: $e');
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
