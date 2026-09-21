import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/constants/app_config.dart';

class ContactScreen extends StatelessWidget {
  const ContactScreen({super.key});

  void _copy(BuildContext context, String text, String label) {
    Clipboard.setData(ClipboardData(text: text));
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('تم نسخ $label'),
        backgroundColor: AppColors.success,
        duration: const Duration(seconds: 1),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('تواصل معنا')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: AppColors.primary,
              borderRadius: BorderRadius.circular(16),
            ),
            child: const Column(
              children: [
                Icon(Icons.business, size: 60, color: Colors.white),
                SizedBox(height: 12),
                Text(AppConfig.companyName,
                    style: TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.bold,
                        color: Colors.white)),
                SizedBox(height: 4),
                Text('لبيع وتسويق الأسمنت إلكترونيًا',
                    style:
                        TextStyle(fontSize: 12, color: Colors.white70)),
              ],
            ),
          ),
          const SizedBox(height: 24),
          _contactTile(
            icon: Icons.phone,
            label: 'الهاتف',
            value: AppConfig.companyPhone,
            color: AppColors.primary,
            onTap: () => _copy(context, AppConfig.companyPhone, 'رقم الهاتف'),
          ),
          _contactTile(
            icon: Icons.chat,
            label: 'واتساب',
            value: AppConfig.companyPhone,
            color: AppColors.success,
            onTap: () =>
                _copy(context, AppConfig.companyPhone, 'رقم الواتساب'),
          ),
          _contactTile(
            icon: Icons.email,
            label: 'البريد الإلكتروني',
            value: 'info@alghouli.com',
            color: AppColors.accent,
            onTap: () => _copy(context, 'info@alghouli.com', 'البريد'),
          ),
          _contactTile(
            icon: Icons.location_on,
            label: 'العنوان',
            value: 'اليمن - صنعاء',
            color: AppColors.secondary,
            onTap: () {},
          ),
          const SizedBox(height: 24),
          const Text('أوقات العمل',
              style:
                  TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Column(
              children: [
                _workRow('السبت - الخميس', '8:00 ص - 6:00 م'),
                Divider(height: 20),
                _workRow('الجمعة', 'مغلق'),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _contactTile({
    required IconData icon,
    required String label,
    required String value,
    required Color color,
    required VoidCallback onTap,
  }) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            color: color.withOpacity(0.15),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(icon, color: color),
        ),
        title: Text(label,
            style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
        subtitle: Text(value,
            style: const TextStyle(
                fontSize: 15, fontWeight: FontWeight.bold)),
        trailing: const Icon(Icons.copy, size: 18),
        onTap: onTap,
      ),
    );
  }
}

class _workRow extends StatelessWidget {
  final String day;
  final String hours;
  const _workRow(this.day, this.hours);

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(day, style: const TextStyle(fontWeight: FontWeight.bold)),
        Text(hours, style: const TextStyle(color: AppColors.textSecondary)),
      ],
    );
  }
}
