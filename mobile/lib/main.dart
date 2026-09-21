import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/presentation/screens/splash_screen.dart';

void main() {
  runApp(const ProviderScope(child: AlghouliApp()));
}

class AlghouliApp extends StatelessWidget {
  const AlghouliApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'مؤسسة الغولي',
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
