import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/storage/local_storage.dart';
import '../../../auth/presentation/screens/login_screen.dart';

class DriverHomeScreen extends StatefulWidget {
  const DriverHomeScreen({super.key});

  @override
  State<DriverHomeScreen> createState() => _DriverHomeScreenState();
}

class _DriverHomeScreenState extends State<DriverHomeScreen> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final screens = const [
      _DriverDashboardTab(),
      _PlaceholderTab(icon: Icons.receipt_long, title: 'فاكساتي'),
      _PlaceholderTab(icon: Icons.account_balance_wallet, title: 'مستحقاتي'),
      _PlaceholderTab(icon: Icons.person, title: 'حسابي'),
    ];

    return Scaffold(
      body: IndexedStack(index: _index, children: screens),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _index,
        onTap: (i) => setState(() => _index = i),
        type: BottomNavigationBarType.fixed,
        selectedItemColor: AppColors.primary,
        unselectedItemColor: AppColors.textSecondary,
        items: const [
          BottomNavigationBarItem(
            icon: Icon(Icons.home_outlined),
            activeIcon: Icon(Icons.home),
            label: 'الرئيسية',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.receipt_long_outlined),
            activeIcon: Icon(Icons.receipt_long),
            label: 'فاكساتي',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.account_balance_wallet_outlined),
            activeIcon: Icon(Icons.account_balance_wallet),
            label: 'مستحقاتي',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.person_outline),
            activeIcon: Icon(Icons.person),
            label: 'حسابي',
          ),
        ],
      ),
    );
  }
}

class _DriverDashboardTab extends StatelessWidget {
  const _DriverDashboardTab();

  Future<void> _logout(BuildContext context) async {
    final c = await showDialog<bool>(
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
            child: const Text('خروج', style: TextStyle(color: AppColors.danger)),
          ),
        ],
      ),
    );
    if (c != true) return;
    await LocalStorage.clearAll();
    if (!context.mounted) return;
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (r) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('لوحة السائق'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () => _logout(context),
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [AppColors.primary, AppColors.primaryLight],
                  begin: Alignment.topRight,
                  end: Alignment.bottomLeft,
                ),
                borderRadius: BorderRadius.circular(16),
              ),
              child: const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(Icons.local_shipping, color: Colors.white, size: 28),
                      SizedBox(width: 8),
                      Text('مرحبًا بك',
                          style: TextStyle(color: Colors.white70, fontSize: 14)),
                    ],
                  ),
                  SizedBox(height: 8),
                  Text('لوحة السائق',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 24,
                        fontWeight: FontWeight.bold,
                      )),
                  SizedBox(height: 4),
                  Text('اختر الخدمة للبدء',
                      style: TextStyle(color: Colors.white70, fontSize: 12)),
                ],
              ),
            ),
            const SizedBox(height: 20),

            // زر طلب فاكس
            _bigButton(
              icon: Icons.request_page,
              title: 'طلب فاكس تحميل',
              subtitle: 'اطلب فاكس من المصنع',
              color: AppColors.success,
              onTap: () {},
            ),
            const SizedBox(height: 12),
            _bigButton(
              icon: Icons.list_alt,
              title: 'فاكساتي',
              subtitle: 'قائمة طلبات الفاكس',
              color: AppColors.info,
              onTap: () {},
            ),
            const SizedBox(height: 12),
            _bigButton(
              icon: Icons.account_balance_wallet,
              title: 'مستحقاتي',
              subtitle: 'رصيدك من النقل',
              color: AppColors.secondary,
              onTap: () {},
            ),
            const SizedBox(height: 12),
            _bigButton(
              icon: Icons.location_on,
              title: 'الرحلات المسندة',
              subtitle: 'الرحلات الجارية',
              color: AppColors.accent,
              onTap: () {},
            ),
          ],
        ),
      ),
    );
  }

  Widget _bigButton({
    required IconData icon,
    required String title,
    required String subtitle,
    required Color color,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.divider),
        ),
        child: Row(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: color.withOpacity(0.15),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, color: color, size: 24),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      style: const TextStyle(
                          fontSize: 15, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 2),
                  Text(subtitle,
                      style: const TextStyle(
                          fontSize: 12, color: AppColors.textSecondary)),
                ],
              ),
            ),
            const Icon(Icons.arrow_forward_ios,
                size: 14, color: AppColors.textSecondary),
          ],
        ),
      ),
    );
  }
}

class _PlaceholderTab extends StatelessWidget {
  final IconData icon;
  final String title;
  const _PlaceholderTab({required this.icon, required this.title});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 80, color: AppColors.textSecondary),
            const SizedBox(height: 16),
            Text('قيد الإنشاء',
                style: const TextStyle(
                    fontSize: 18, color: AppColors.textSecondary)),
          ],
        ),
      ),
    );
  }
}
