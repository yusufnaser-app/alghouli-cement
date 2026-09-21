import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/widgets/primary_button.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('حساب جديد'),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 16),
              const Text(
                'مرحبًا بك في مؤسسة الغولي',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.bold,
                  color: AppColors.primary,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'أنشئ حسابك في دقيقة واحدة',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 14, color: AppColors.textSecondary),
              ),
              const SizedBox(height: 32),
              const Text('الاسم الكامل', style: TextStyle(fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              const TextField(
                decoration: InputDecoration(
                  hintText: 'أحمد محمد',
                  prefixIcon: Icon(Icons.person_outline),
                ),
              ),
              const SizedBox(height: 16),
              const Text('رقم الهاتف', style: TextStyle(fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              const TextField(
                keyboardType: TextInputType.phone,
                decoration: InputDecoration(
                  hintText: '967771234567',
                  prefixIcon: Icon(Icons.phone_android),
                ),
              ),
              const SizedBox(height: 16),
              const Text('نوع الحساب', style: TextStyle(fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              const TextField(
                decoration: InputDecoration(
                  hintText: 'فرد / تاجر / موزع / مقاول',
                  prefixIcon: Icon(Icons.badge_outlined),
                ),
              ),
              const SizedBox(height: 16),
              const Text('المحافظة', style: TextStyle(fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              const TextField(
                decoration: InputDecoration(
                  hintText: 'صنعاء',
                  prefixIcon: Icon(Icons.location_city),
                ),
              ),
              const SizedBox(height: 16),
              const Text('المنطقة', style: TextStyle(fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              const TextField(
                decoration: InputDecoration(
                  hintText: 'السبعين',
                  prefixIcon: Icon(Icons.location_on_outlined),
                ),
              ),
              const SizedBox(height: 32),
              PrimaryButton(
                text: 'إنشاء الحساب',
                icon: Icons.person_add,
                onPressed: () {},
              ),
            ],
          ),
        ),
      ),
    );
  }
}
