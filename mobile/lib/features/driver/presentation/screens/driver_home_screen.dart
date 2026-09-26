import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/storage/local_storage.dart';
import '../../../auth/presentation/screens/login_screen.dart';
import '../../data/driver_service.dart';
import 'request_fax_screen.dart';
import 'my_faxes_screen.dart';
import 'my_wallet_screen.dart';
import 'driver_profile_screen.dart';
import 'my_trips_screen.dart';
import 'my_vehicles_screen.dart';
import 'notifications_screen.dart';

class DriverHomeScreen extends StatefulWidget {
  const DriverHomeScreen({super.key});

  @override
  State<DriverHomeScreen> createState() => _DriverHomeScreenState();
}

class _DriverHomeScreenState extends State<DriverHomeScreen> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final screens = [
      _DashboardTab(onNavigate: (i) => setState(() => _index = i)),
      const MyFaxesScreen(),
      const MyTripsScreen(),
      const MyWalletScreen(),
      const DriverProfileScreen(),
    ];

    return Scaffold(
      body: IndexedStack(index: _index, children: screens),
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.05),
              blurRadius: 12,
              offset: const Offset(0, -4),
            ),
          ],
        ),
        child: BottomNavigationBar(
          currentIndex: _index,
          onTap: (i) => setState(() => _index = i),
          type: BottomNavigationBarType.fixed,
          backgroundColor: Colors.white,
          selectedItemColor: AppColors.primary,
          unselectedItemColor: AppColors.textSecondary,
          selectedFontSize: 11,
          unselectedFontSize: 10,
          selectedLabelStyle: const TextStyle(fontWeight: FontWeight.bold),
          elevation: 0,
          items: const [
            BottomNavigationBarItem(
              icon: Icon(Icons.home_outlined),
              activeIcon: Icon(Icons.home, color: AppColors.primary),
              label: 'الرئيسية',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.receipt_long_outlined),
              activeIcon: Icon(Icons.receipt_long, color: AppColors.primary),
              label: 'فاكساتي',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.local_shipping_outlined),
              activeIcon: Icon(Icons.local_shipping, color: AppColors.primary),
              label: 'رحلاتي',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.account_balance_wallet_outlined),
              activeIcon:
                  Icon(Icons.account_balance_wallet, color: AppColors.primary),
              label: 'مستحقاتي',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.person_outline),
              activeIcon: Icon(Icons.person, color: AppColors.primary),
              label: 'حسابي',
            ),
          ],
        ),
      ),
    );
  }
}

// ====================== Dashboard ======================
class _DashboardTab extends StatefulWidget {
  final Function(int) onNavigate;
  const _DashboardTab({required this.onNavigate});

  @override
  State<_DashboardTab> createState() => _DashboardTabState();
}

class _DashboardTabState extends State<_DashboardTab> {
  final _service = DriverService();
  Map<String, dynamic>? _profile;
  Map<String, dynamic>? _currentTrip;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final p = await _service.myProfile();
      final t = await _service.currentTrip();
      setState(() {
        _profile = p;
        _currentTrip = t;
      });
    } catch (_) {}
    setState(() => _loading = false);
  }

  Future<void> _openRequestFax() async {
    final r = await Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const RequestFaxScreen()),
    );
    if (r == true && mounted) widget.onNavigate(1);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _load,
          child: SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            child: Column(
              children: [
                // === الهيدر الأزرق ===
                _buildHeader(),

                const SizedBox(height: 16),

                // === بطاقات الإجراءات ===
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: _buildActionGrid(),
                ),

                const SizedBox(height: 16),

                // === بانر ===
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: _buildBanner(),
                ),

                const SizedBox(height: 20),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildHeader() {
    final name = _profile?['full_name'] ?? 'مرحبًا';
    final plate = (_profile?['vehicles'] as List?)?.isNotEmpty == true
        ? _profile!['vehicles'][0]['plate_number'] ?? '—'
        : '—';
    final isActive = _profile?['approval_status'] == 'active';

    return Container(
      width: double.infinity,
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [AppColors.primary, AppColors.primaryLight],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.only(
          bottomLeft: Radius.circular(28),
          bottomRight: Radius.circular(28),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        child: Column(
          children: [
            // الشعار
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(Icons.business,
                      color: AppColors.brandRed, size: 24),
                ),
                const SizedBox(width: 10),
                const Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('مؤسسة الغولي للأسمنت',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                        )),
                    Text('معاً نصل إلى وجهتك',
                        style: TextStyle(color: Colors.white70, fontSize: 10)),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 20),

            // بطاقة السائق
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.15),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: Colors.white.withOpacity(0.2)),
              ),
              child: Row(
                children: [
                  // الصورة الرمزية
                  Container(
                    width: 60,
                    height: 60,
                    decoration: BoxDecoration(
                      color: Colors.white,
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white, width: 3),
                    ),
                    child: const Icon(Icons.person,
                        size: 34, color: AppColors.primary),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(name,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                            )),
                        const SizedBox(height: 4),
                        const Text('سائق',
                            style: TextStyle(
                                color: Colors.white70, fontSize: 12)),
                        const SizedBox(height: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: isActive
                                ? AppColors.success
                                : AppColors.warning,
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                isActive
                                    ? Icons.check_circle
                                    : Icons.hourglass_top,
                                color: Colors.white,
                                size: 12,
                              ),
                              const SizedBox(width: 4),
                              Text(
                                isActive ? 'متاح' : 'بانتظار الاعتماد',
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 10,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),

            // القاطرة
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  const Icon(Icons.local_shipping,
                      color: AppColors.primary, size: 20),
                  const SizedBox(width: 10),
                  const Text('القاطرة',
                      style: TextStyle(
                          fontSize: 13,
                          color: AppColors.textSecondary)),
                  const Spacer(),
                  Text(plate,
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.bold,
                        color: AppColors.primary,
                      )),
                ],
              ),
            ),

            // === الرحلة الحالية ===
            if (_currentTrip != null) ...[
              const SizedBox(height: 12),
              _buildCurrentTripCard(_currentTrip!),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildCurrentTripCard(Map<String, dynamic> t) {
    final status = t['status'] ?? '';
    final statusAr = {
      'REQUESTED': 'بانتظار الاعتماد',
      'APPROVED': 'معتمد',
      'ISSUED': 'تم إصدار الفاكس — توجه للمصنع',
      'USED': 'تم التحميل',
    }[status] ?? status;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.secondary, width: 2),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: AppColors.secondary.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(Icons.local_shipping,
                    color: AppColors.secondary, size: 18),
              ),
              const SizedBox(width: 8),
              const Text('رحلتك الحالية',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.bold,
                    color: AppColors.secondary,
                  )),
            ],
          ),
          const Divider(height: 16),
          Row(
            children: [
              const Icon(Icons.factory,
                  size: 14, color: AppColors.textSecondary),
              const SizedBox(width: 4),
              Expanded(
                child: Text(t['factory_name'] ?? '—',
                    style: const TextStyle(
                        fontSize: 12, fontWeight: FontWeight.w600)),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Row(
            children: [
              const Icon(Icons.inventory_2,
                  size: 14, color: AppColors.textSecondary),
              const SizedBox(width: 4),
              Text('${t['requested_quantity']} كيس',
                  style: const TextStyle(fontSize: 12)),
            ],
          ),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: AppColors.lightBlue,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(statusAr,
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                  color: AppColors.primary,
                )),
          ),
        ],
      ),
    );
  }

  Widget _buildActionGrid() {
    final actions = [
      _ActionItem(
        icon: Icons.request_page,
        title: 'طلب فاكس',
        color: AppColors.accent,
        onTap: _openRequestFax,
      ),
      _ActionItem(
        icon: Icons.today,
        title: 'رحلاتي اليوم',
        color: AppColors.primary,
        onTap: () => widget.onNavigate(2),
      ),
      _ActionItem(
        icon: Icons.download,
        title: 'التحميلات',
        color: AppColors.success,
        onTap: () => widget.onNavigate(1),
      ),
      _ActionItem(
        icon: Icons.account_balance_wallet,
        title: 'مستحقاتي',
        color: AppColors.secondary,
        onTap: () => widget.onNavigate(3),
      ),
      _ActionItem(
        icon: Icons.garage,
        title: 'القاطرات',
        color: AppColors.info,
        onTap: () {
          Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => const MyVehiclesScreen()),
          );
        },
      ),
      _ActionItem(
        icon: Icons.history,
        title: 'سجل الرحلات',
        color: AppColors.warning,
        onTap: () => widget.onNavigate(2),
      ),
      _ActionItem(
        icon: Icons.notifications,
        title: 'الإشعارات',
        color: AppColors.brandRed,
        onTap: () => Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const NotificationsScreen()),
        ),
      ),
    ];

    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3,
        mainAxisSpacing: 12,
        crossAxisSpacing: 12,
        childAspectRatio: 1.0,
      ),
      itemCount: actions.length,
      itemBuilder: (_, i) {
        final a = actions[i];
        return InkWell(
          onTap: a.onTap,
          borderRadius: BorderRadius.circular(14),
          child: Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppColors.divider),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.03),
                  blurRadius: 8,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: a.color.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(a.icon, color: a.color, size: 24),
                ),
                const SizedBox(height: 8),
                Text(a.title,
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                      color: AppColors.textPrimary,
                    ),
                    textAlign: TextAlign.center,
                    maxLines: 2),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildBanner() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [AppColors.primaryDark, AppColors.primary],
          begin: Alignment.centerRight,
          end: Alignment.centerLeft,
        ),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.15),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(Icons.shield, color: Colors.white, size: 28),
          ),
          const SizedBox(width: 14),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('معاً نصل إلى وجهتك',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 14,
                      fontWeight: FontWeight.bold,
                    )),
                SizedBox(height: 4),
                Text('السلامة دائمًا هدفنا',
                    style: TextStyle(color: Colors.white70, fontSize: 11)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ActionItem {
  final IconData icon;
  final String title;
  final Color color;
  final VoidCallback onTap;

  _ActionItem({
    required this.icon,
    required this.title,
    required this.color,
    required this.onTap,
  });
}
