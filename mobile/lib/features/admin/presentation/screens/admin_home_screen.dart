import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/storage/local_storage.dart';
import '../../data/admin_service.dart';
import '../widgets/admin_icon_tile.dart';
import 'admin_pending_orders_screen.dart';
import 'admin_pending_payments_screen.dart';
import 'admin_faxes_screen.dart';
import 'admin_bulk_fax_screen.dart';
import 'admin_create_fax_screen.dart';
import 'admin_customers_screen.dart';
import 'admin_drivers_screen.dart';
import 'admin_users_screen.dart';
import 'admin_settings_screen.dart';
import 'admin_vehicles_screen.dart';
import 'admin_products_screen.dart';
import 'admin_sources_screen.dart';
import 'admin_analytics_screen.dart';
import 'admin_operations_screen.dart';
import 'admin_reports_screen.dart';
import 'admin_statement_lookup_screen.dart';
import 'admin_integrity_screen.dart';

class AdminHomeScreen extends StatefulWidget {
  const AdminHomeScreen({super.key});

  @override
  State<AdminHomeScreen> createState() => _AdminHomeScreenState();
}

class _AdminHomeScreenState extends State<AdminHomeScreen> {
  final _service = AdminService();
  Map<String, dynamic>? _dash;
  List<Map<String, dynamic>> _pendingPricing = [];
  List<Map<String, dynamic>> _pendingPayments = [];
  List<Map<String, dynamic>> _pendingFaxes = [];
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
      final results = await Future.wait([
        _service.dashboard(),
        _service.pendingPricing(),
        _service.pendingPayments(),
        _service.faxes(),
      ]);
      if (mounted) {
        setState(() {
          _dash = results[0] as Map<String, dynamic>;
          _pendingPricing = results[1] as List<Map<String, dynamic>>;
          _pendingPayments = results[2] as List<Map<String, dynamic>>;
          _pendingFaxes = results[3] as List<Map<String, dynamic>>;
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
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

  Future<void> _open(Widget screen) async {
    await Navigator.push(context, MaterialPageRoute(builder: (_) => screen));
    _load();
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
              ? _errorView()
              : RefreshIndicator(onRefresh: _load, child: _content()),
    );
  }

  Widget _errorView() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, color: AppColors.danger, size: 60),
            const SizedBox(height: 16),
            Text(_error!, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            ElevatedButton(onPressed: _load, child: const Text('إعادة')),
          ],
        ),
      ),
    );
  }

  Widget _content() {
    final today = _dash?['today'] as Map? ?? {};
    final month = _dash?['month'] as Map? ?? {};

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // شريط الإحصائيات
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [AppColors.primary, AppColors.primary.withOpacity(0.7)],
              begin: Alignment.topRight,
              end: Alignment.bottomLeft,
            ),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Row(
            children: [
              Expanded(child: _statBlock('اليوم', '${today['orders'] ?? 0}', '${today['sales'] ?? 0}')),
              Container(width: 1, height: 50, color: Colors.white.withOpacity(0.3)),
              Expanded(child: _statBlock('هذا الشهر', '${month['orders'] ?? 0}', '${month['sales'] ?? 0}')),
            ],
          ),
        ),
        const SizedBox(height: 20),

        // شبكة الأيقونات 3×4
        GridView.count(
          crossAxisCount: 3,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisSpacing: 12,
          mainAxisSpacing: 12,
          childAspectRatio: 0.95,
          children: [
            AdminIconTile(
              icon: Icons.price_change,
              label: 'تسعير',
              badge: _pendingPricing.length,
              color: AppColors.warning,
              onTap: () => _open(const AdminPendingOrdersScreen()),
            ),
            AdminIconTile(
              icon: Icons.payments,
              label: 'دفعات',
              badge: _pendingPayments.length,
              color: AppColors.success,
              onTap: () => _open(const AdminPendingPaymentsScreen()),
            ),
            AdminIconTile(
              icon: Icons.description,
              label: 'فاكسات',
              badge: _pendingFaxes.length,
              color: AppColors.info,
              onTap: () => _open(const AdminFaxesScreen()),
            ),
            AdminIconTile(
              icon: Icons.add_box,
              label: 'فاكس جديد',
              color: AppColors.accent,
              onTap: () => _open(const AdminCreateFaxScreen()),
            ),
            AdminIconTile(
              icon: Icons.playlist_add,
              label: 'فاكسات جماعية',
              color: AppColors.primary,
              onTap: () => _open(const AdminBulkFaxScreen()),
            ),
            AdminIconTile(
              icon: Icons.people,
              label: 'تجار',
              color: AppColors.primary,
              onTap: () => _open(const AdminCustomersScreen()),
            ),
            AdminIconTile(
              icon: Icons.local_shipping,
              label: 'سائقون',
              color: AppColors.info,
              onTap: () => _open(const AdminDriversScreen()),
            ),
            AdminIconTile(
              icon: Icons.manage_accounts,
              label: 'مستخدمون',
              color: AppColors.accent,
              onTap: () => _open(const AdminUsersScreen()),
            ),
            AdminIconTile(
              icon: Icons.account_balance_wallet,
              label: 'كشوفات',
              color: AppColors.success,
              onTap: () => _open(const AdminStatementLookupScreen()),
            ),
            AdminIconTile(
              icon: Icons.verified,
              label: 'نزاهة',
              color: AppColors.primary,
              onTap: () => _open(const AdminIntegrityScreen()),
            ),
            AdminIconTile(
              icon: Icons.bar_chart,
              label: 'تقارير',
              color: AppColors.warning,
              onTap: () => _open(const AdminReportsScreen()),
            ),
            AdminIconTile(
              icon: Icons.hub,
              label: 'مركز العمليات',
              color: AppColors.danger,
              onTap: () => _open(const AdminOperationsScreen()),
            ),
            AdminIconTile(
              icon: Icons.analytics,
              label: 'تحليلات',
              color: AppColors.primary,
              onTap: () => _open(const AdminAnalyticsScreen()),
            ),
            AdminIconTile(
              icon: Icons.factory,
              label: 'مصانع',
              color: AppColors.accent,
              onTap: () => _open(const AdminSourcesScreen()),
            ),
            AdminIconTile(
              icon: Icons.inventory_2,
              label: 'منتجات',
              color: AppColors.success,
              onTap: () => _open(const AdminProductsScreen()),
            ),
            AdminIconTile(
              icon: Icons.local_shipping,
              label: 'مركبات',
              color: AppColors.info,
              onTap: () => _open(const AdminVehiclesScreen()),
            ),
            AdminIconTile(
              icon: Icons.settings,
              label: 'إعدادات',
              color: AppColors.textSecondary,
              onTap: () => _open(const AdminSettingsScreen()),
            ),
          ],
        ),
      ],
    );
  }

  Widget _statBlock(String label, String count, String amount) {
    return Column(
      children: [
        Text(label, style: const TextStyle(color: Colors.white70, fontSize: 12)),
        const SizedBox(height: 4),
        Text(count, style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
        Text('طلب • $amount ر.ي', style: const TextStyle(color: Colors.white70, fontSize: 11)),
      ],
    );
  }
}
