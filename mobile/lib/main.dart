import 'package:flutter/material.dart';
import 'core/services/notification_service.dart';
import 'core/theme/app_theme.dart';
import 'core/branding/branding_service.dart';
import 'features/auth/presentation/screens/splash_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // 1) حمّل الهوية من cache أولًا (سريع جدًا)
  await BrandingService.loadCached();

  // 2) الخدمات الأخرى
  await NotificationService().init();

  // 3) حمّل الهوية المحدّثة من الخادم في الخلفية
  // (لا ننتظرها — تُحدَّث عند الطلب التالي)
  BrandingService.fetchFromServer();

  runApp(const AlghouliApp());
}

class AlghouliApp extends StatelessWidget {
  const AlghouliApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: BrandingService.companyName,
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      builder: (context, child) {
        return Directionality(
          textDirection: TextDirection.rtl,
          child: child!,
        );
      },
      home: const SplashScreen(),
    );
  }
}
