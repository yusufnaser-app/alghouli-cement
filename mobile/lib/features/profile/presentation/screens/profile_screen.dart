import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/storage/local_storage.dart';
import '../../../addresses/presentation/screens/addresses_screen.dart';
import '../../../auth/presentation/screens/login_screen.dart';
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
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('إلغاء'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('خروج',
                style: TextStyle(color: AppColors.danger)),
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
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('أحمد محمد',
                        style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.bold,
                            color: Colors.white)),
                    SizedBox(height: 4),
                    Text('عميل فردي',
                        style:
                            TextStyle(fontSize: 12, color: Colors.white70)),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          _item(Icons.receipt_long, 'طلباتي', () {
            Navigator.push(context,
                MaterialPageRoute(builder: (_) => const OrdersListScreen()));
          }),
          _item(Icons.receipt, 'الفواتير', () {
            Navigator.push(context,
                MaterialPageRoute(builder: (_) => const InvoicesScreen()));
          }),
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
          const Divider(height: 32),
          _item(Icons.phone, 'تواصل معنا', () {}),
          _item(Icons.info_outline, 'عن التطبيق', () {}),
          const Divider(height: 32),
          _item(Icons.logout, 'تسجيل الخروج', _logout,
              color: AppColors.danger),
        ],
      ),
    );
  }

  Widget _item(IconData icon, String label, VoidCallback onTap,
      {Color? color}) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: Icon(icon, color: color ?? AppColors.primary),
        title: Text(label, style: TextStyle(color: color)),
        trailing: const Icon(Icons.arrow_forward_ios, size: 14),
        onTap: onTap,
      ),
    );
  }
}
