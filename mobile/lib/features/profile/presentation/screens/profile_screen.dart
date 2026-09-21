import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/storage/local_storage.dart';
import '../../../about/presentation/screens/about_screen.dart';
import '../../../addresses/presentation/screens/addresses_screen.dart';
import '../../../auth/presentation/screens/login_screen.dart';
import '../../../contact/presentation/screens/contact_screen.dart';
import '../../../invoices/presentation/screens/invoices_screen.dart';
import '../../../notifications/presentation/screens/notifications_screen.dart';
import '../../../orders/presentation/screens/orders_list_screen.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  Future<void> _logout() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('تسجيل الخروج؟'),
        content: const Text('هل تريد تسجيل الخروج من الحساب؟'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('إلغاء'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child:
                const Text('خروج', style: TextStyle(color: AppColors.danger)),
          ),
        ],
      ),
    );
    if (confirm != true) return;
    await LocalStorage.clearAll();
    if (!mounted) return;
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (route) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('حسابي')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: AppColors.primary,
              borderRadius: BorderRadius.circular(16),
            ),
            child: const Row(
              children: [
                CircleAvatar(
                  radius: 32,
                  backgroundColor: Colors.white,
                  child:
                      Icon(Icons.person, size: 40, color: AppColors.primary),
                ),
                SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('مرحبًا بك',
                          style: TextStyle(
                              fontSize: 16, color: Colors.white70)),
                      SizedBox(height: 4),
                      Text('مؤسسة الغولي',
                          style: TextStyle(
                              fontSize: 20,
                              fontWeight: FontWeight.bold,
                              color: Colors.white)),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          _sectionTitle('طلباتي'),
          _item(Icons.receipt_long, 'قائمة الطلبات', () {
            Navigator.push(context,
                MaterialPageRoute(builder: (_) => const OrdersListScreen()));
          }),
          _item(Icons.receipt, 'الفواتير', () {
            Navigator.push(context,
                MaterialPageRoute(builder: (_) => const InvoicesScreen()));
          }),
          const SizedBox(height: 12),
          _sectionTitle('حسابي'),
          _item(Icons.location_on, 'العناوين المحفوظة', () {
            Navigator.push(context,
                MaterialPageRoute(builder: (_) => const AddressesScreen()));
          }),
          _item(Icons.notifications, 'الإشعارات', () {
            Navigator.push(
                context,
                MaterialPageRoute(
                    builder: (_) => const NotificationsScreen()));
          }),
          const SizedBox(height: 12),
          _sectionTitle('المساعدة'),
          _item(Icons.phone, 'تواصل معنا', () {
            Navigator.push(context,
                MaterialPageRoute(builder: (_) => const ContactScreen()));
          }),
          _item(Icons.info_outline, 'عن التطبيق', () {
            Navigator.push(context,
                MaterialPageRoute(builder: (_) => const AboutScreen()));
          }),
          const SizedBox(height: 20),
          Card(
            color: AppColors.danger.withOpacity(0.05),
            child: ListTile(
              leading:
                  const Icon(Icons.logout, color: AppColors.danger),
              title: const Text('تسجيل الخروج',
                  style: TextStyle(
                      color: AppColors.danger,
                      fontWeight: FontWeight.bold)),
              onTap: _logout,
            ),
          ),
          const SizedBox(height: 20),
          const Center(
            child: Text('الإصدار 1.0.0',
                style: TextStyle(
                    fontSize: 11, color: AppColors.textSecondary)),
          ),
        ],
      ),
    );
  }

  Widget _sectionTitle(String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8, top: 8, right: 4),
      child: Text(text,
          style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.bold,
              color: AppColors.textSecondary)),
    );
  }

  Widget _item(IconData icon, String label, VoidCallback onTap) {
    return Card(
      margin: const EdgeInsets.only(bottom: 6),
      child: ListTile(
        leading: Icon(icon, color: AppColors.primary),
        title: Text(label),
        trailing: const Icon(Icons.arrow_forward_ios,
            size: 14, color: AppColors.textSecondary),
        onTap: onTap,
      ),
    );
  }
}
