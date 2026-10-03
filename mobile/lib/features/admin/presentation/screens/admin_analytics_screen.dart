import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/admin_service.dart';

class AdminAnalyticsScreen extends StatefulWidget {
  const AdminAnalyticsScreen({super.key});
  @override
  State<AdminAnalyticsScreen> createState() => _S();
}

class _S extends State<AdminAnalyticsScreen> {
  final _svc = AdminService();
  List<Map<String, dynamic>> _daily = [];
  Map<String, dynamic>? _summary;
  bool _loading = true;
  String? _error;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final results = await Future.wait([
        _svc.reportsDaily(),
        _svc.reportsSummary(),
      ]);
      if (mounted) setState(() {
        _daily = results[0] as List<Map<String, dynamic>>;
        _summary = results[1] as Map<String, dynamic>;
        _loading = false;
      });
    } catch (e) {
      if (mounted) setState(() { _error = e.toString(); _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('التحليلات'), actions: [
        IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
      ]),
      body: _loading ? const Center(child: CircularProgressIndicator())
        : _error != null ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(_error!)))
        : ListView(padding: const EdgeInsets.all(12), children: [
            _sectionTitle('ملخص'),
            _summaryGrid(),
            const SizedBox(height: 20),
            _sectionTitle('المبيعات اليومية (آخر ${_daily.length})'),
            if (_daily.isEmpty) const Center(child: Padding(padding: EdgeInsets.all(20), child: Text('لا توجد بيانات'))),
            if (_daily.isNotEmpty)
              SizedBox(height: 240, child: LineChart(LineChartData(
                gridData: const FlGridData(show: true, drawVerticalLine: false),
                titlesData: const FlTitlesData(show: false),
                borderData: FlBorderData(show: true),
                lineBarsData: [
                  LineChartBarData(
                    spots: List.generate(_daily.length, (i) {
                      final v = _daily[i];
                      final y = ((v['total'] ?? v['sales'] ?? v['total_amount'] ?? 0) as num).toDouble();
                      return FlSpot(i.toDouble(), y);
                    }),
                    isCurved: true,
                    color: AppColors.primary,
                    barWidth: 3,
                    dotData: const FlDotData(show: true),
                    belowBarData: BarAreaData(show: true, color: AppColors.primary.withOpacity(0.15)),
                  ),
                ],
              ))),
          ]),
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
      crossAxisCount: 2, shrinkWrap: true, physics: const NeverScrollableScrollPhysics(),
      crossAxisSpacing: 10, mainAxisSpacing: 10, childAspectRatio: 1.6,
      children: found.map((k) => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.divider)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [
          Text(labels[k]!, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
          const SizedBox(height: 4),
          Text(s[k]?.toString() ?? '0', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: AppColors.primary)),
        ]),
      )).toList(),
    );
  }
}
