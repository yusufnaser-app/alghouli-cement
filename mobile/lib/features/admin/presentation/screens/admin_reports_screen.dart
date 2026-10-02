import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/admin_service.dart';

class AdminReportsScreen extends StatefulWidget {
  const AdminReportsScreen({super.key});
  @override
  State<AdminReportsScreen> createState() => _S();
}

class _S extends State<AdminReportsScreen> {
  final _svc = AdminService();
  Map<String, dynamic>? _summary;
  List<Map<String, dynamic>> _daily = [];
  List<Map<String, dynamic>> _bySource = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final results = await Future.wait([
        _svc.reportsSummary(),
        _svc.reportsDaily(),
        _svc.reportsBySource(),
      ]);
      if (mounted) setState(() {
        _summary = results[0] as Map<String, dynamic>;
        _daily = results[1] as List<Map<String, dynamic>>;
        _bySource = results[2] as List<Map<String, dynamic>>;
        _loading = false;
      });
    } catch (e) {
      if (mounted) setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('التقارير'), actions: [
        IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
      ]),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.all(12),
                    children: [
                      _sectionTitle('ملخص المبيعات'),
                      _summaryGrid(),
                      const SizedBox(height: 20),
                      _sectionTitle('المبيعات حسب المصنع'),
                      ..._bySource.take(10).map((s) => Card(
                        child: ListTile(
                          title: Text(s['source_name']?.toString() ?? s['name_ar']?.toString() ?? '—'),
                          trailing: Text('${s['total_amount'] ?? s['sales'] ?? 0} ر.ي',
                              style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.primary)),
                        ),
                      )),
                      const SizedBox(height: 20),
                      _sectionTitle('المبيعات اليومية'),
                      ..._daily.take(14).map((d) => Card(
                        child: ListTile(
                          title: Text(d['day']?.toString() ?? d['date']?.toString() ?? '—'),
                          subtitle: Text('عدد الطلبات: ${d['orders'] ?? 0}'),
                          trailing: Text('${d['total'] ?? d['sales'] ?? 0} ر.ي',
                              style: const TextStyle(fontWeight: FontWeight.bold)),
                        ),
                      )),
                    ],
                  ),
                ),
    );
  }

  Widget _sectionTitle(String t) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 8),
    child: Text(t, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppColors.primary)),
  );

  Widget _summaryGrid() {
    final s = _summary ?? {};
    final keys = ['total_orders','total_sales','total_paid','total_remaining','pending_orders','delivered_orders'];
    final labels = {
      'total_orders': 'إجمالي الطلبات',
      'total_sales': 'إجمالي المبيعات',
      'total_paid': 'المدفوع',
      'total_remaining': 'المتبقي',
      'pending_orders': 'طلبات معلقة',
      'delivered_orders': 'طلبات مُسلَّمة',
    };
    final found = keys.where((k) => s.containsKey(k)).toList();
    if (found.isEmpty) return const Text('لا توجد بيانات');

    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisSpacing: 10,
      mainAxisSpacing: 10,
      childAspectRatio: 1.6,
      children: found.map((k) {
        final v = s[k];
        return Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.divider),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(labels[k]!, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
              const SizedBox(height: 4),
              Text(v?.toString() ?? '0',
                  style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: AppColors.primary)),
            ],
          ),
        );
      }).toList(),
    );
  }
}
