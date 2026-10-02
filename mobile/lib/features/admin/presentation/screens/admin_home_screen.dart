import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/storage/local_storage.dart';
import '../../data/admin_service.dart';
import 'admin_pending_orders_screen.dart';
import 'admin_pending_payments_screen.dart';
import '../widgets/admin_stat_card.dart';

class AdminHomeScreen extends StatefulWidget {
  const AdminHomeScreen({super.key});

  @override
  State<AdminHomeScreen> createState() => _AdminHomeScreenState();
}

class _AdminHomeScreenState extends State<AdminHomeScreen> {
  final _service = AdminService();
  Map<String, dynamic>? _dash;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final d = await _service.dashboard();
      if (mounted) setState(() { _dash = d; _loading = false; });
    } catch (e) {
      if (mounted) setState(() { _error = e.toString().replaceFirst('Exception: ', ''); _loading = false; });
    }
  }

  Future<void> _logout() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('تسجيل الخروج'),
        content: const Text('هل تريد الخروج؟'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('إلغاء')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('خروج')),
        ],
      ),
    );
    if (ok == true) {
      await LocalStorage.clearAll();
      if (mounted) Navigator.of(context).pushNamedAndRemoveUntil('/login', (_) => false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('لوحة الإدارة'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
          IconButton(icon: const Icon(Icons.logout), onPressed: _logout),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.error_outline, color: AppColors.danger, size: 60),
                      const SizedBox(height: 16),
                      Text(_error!, textAlign: TextAlign.center),
                      const SizedBox(height: 16),
                      ElevatedButton(onPressed: _load, child: const Text('إعادة المحاولة')),
                    ],
                  ),
                ))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: _content(),
                ),
    );
  }

  Widget _content() {
    final d = _dash ?? {};
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // بطاقات الإحصائيات
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisSpacing: 12,
          mainAxisSpacing: 12,
          childAspectRatio: 1.4,
          children: [
            AdminStatCard(
              icon: Icons.receipt_long,
              label: 'طلبات معلقة',
              value: '${d['pending_orders'] ?? d['orders_pending_pricing'] ?? 0}',
              color: AppColors.warning,
            ),
            AdminStatCard(
              icon: Icons.payments,
              label: 'دفعات معلقة',
              value: '${d['pending_payments'] ?? 0}',
              color: AppColors.info,
            ),
            AdminStatCard(
              icon: Icons.check_circle,
              label: 'طلبات مكتملة',
              value: '${d['completed_orders'] ?? 0}',
              color: AppColors.success,
            ),
            AdminStatCard(
              icon: Icons.people,
              label: 'تجار',
              value: '${d['total_customers'] ?? d['customers_count'] ?? 0}',
              color: AppColors.primary,
            ),
            AdminStatCard(
              icon: Icons.local_shipping,
              label: 'سائقون',
              value: '${d['total_drivers'] ?? d['drivers_count'] ?? 0}',
              color: AppColors.accent,
            ),
            AdminStatCard(
              icon: Icons.factory,
              label: 'فاكسات معلقة',
              value: '${d['pending_faxes'] ?? 0}',
              color: AppColors.textSecondary,
            ),
          ],
        ),
        const SizedBox(height: 24),

        // أزرار التنقل
        _section('إدارة الطلبات', [
          _tile(
            icon: Icons.price_change,
            title: 'الطلبات بانتظار التسعير',
            subtitle: 'سعّر الطلبات الجديدة',
            onTap: () => Navigator.push(context, MaterialPageRoute(
              builder: (_) => const AdminPendingOrdersScreen())),
          ),
          _tile(
            icon: Icons.receipt,
            title: 'كل الطلبات',
            subtitle: 'عرض وتصفية',
            onTap: () => Navigator.push(context, MaterialPageRoute(
              builder: (_) => const AdminAllOrdersScreen())),
          ),
        ]),
        const SizedBox(height: 16),

        _section('المالية', [
          _tile(
            icon: Icons.payments,
            title: 'الدفعات بانتظار الاعتماد',
            subtitle: 'اعتماد أو رفض الدفعات',
            onTap: () => Navigator.push(context, MaterialPageRoute(
              builder: (_) => const AdminPendingPaymentsScreen())),
          ),
        ]),
        const SizedBox(height: 16),

        _section('العمليات', [
          _tile(
            icon: Icons.verified_user,
            title: 'فحص النزاهة المحاسبية',
            subtitle: 'كشف الأخطاء والمخالفات',
            onTap: () => Navigator.pushNamed(context, '/accounting/integrity'),
          ),
        ]),
      ],
    );
  }

  Widget _section(String title, List<Widget> children) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
          child: Text(title,
              style: const TextStyle(
                fontSize: 16, fontWeight: FontWeight.bold, color: AppColors.primary)),
        ),
        Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.divider),
          ),
          child: Column(children: children),
        ),
      ],
    );
  }

  Widget _tile({
    required IconData icon,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return ListTile(
      leading: CircleAvatar(
        backgroundColor: AppColors.primary.withOpacity(0.1),
        child: Icon(icon, color: AppColors.primary),
      ),
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.bold)),
      subtitle: Text(subtitle, style: const TextStyle(fontSize: 12)),
      trailing: const Icon(Icons.chevron_left),
      onTap: onTap,
    );
  }
}
