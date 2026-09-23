import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/driver_service.dart';

class MyWalletScreen extends StatefulWidget {
  const MyWalletScreen({super.key});

  @override
  State<MyWalletScreen> createState() => _MyWalletScreenState();
}

class _MyWalletScreenState extends State<MyWalletScreen> {
  final _service = DriverService();
  Map<String, dynamic>? _summary;
  List<Map<String, dynamic>> _ledger = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final results = await Future.wait([
        _service.mySummary(),
        _service.myLedger(),
      ]);
      setState(() {
        _summary = results[0] as Map<String, dynamic>;
        _ledger = results[1] as List<Map<String, dynamic>>;
      });
    } catch (_) {}
    setState(() => _loading = false);
  }

  String _fmt(dynamic n) {
    final v = double.tryParse(n.toString()) ?? 0;
    return v.toStringAsFixed(0).replaceAllMapped(
          RegExp(r'(\d)(?=(\d{3})+(?!\d))'),
          (m) => '${m[1]},',
        );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('مستحقاتي'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  // الرصيد الرئيسي
                  Container(
                    padding: const EdgeInsets.all(24),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [AppColors.primary, AppColors.primaryLight],
                        begin: Alignment.topRight,
                        end: Alignment.bottomLeft,
                      ),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Row(
                          children: [
                            Icon(Icons.account_balance_wallet,
                                color: Colors.white, size: 26),
                            SizedBox(width: 8),
                            Text('رصيدك الحالي',
                                style: TextStyle(color: Colors.white70, fontSize: 14)),
                          ],
                        ),
                        const SizedBox(height: 12),
                        Text(
                          '${_fmt(_summary?['current_balance'] ?? 0)} ر.ي',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 32,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 4),
                        const Text('مستحقات نقل',
                            style: TextStyle(color: Colors.white70, fontSize: 12)),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),

                  // إحصائيات
                  Row(
                    children: [
                      Expanded(
                        child: _statCard(
                          'إجمالي المستحقات',
                          _fmt(_summary?['total_dues'] ?? 0),
                          Icons.trending_up,
                          AppColors.success,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: _statCard(
                          'إجمالي المدفوع',
                          _fmt(_summary?['total_paid'] ?? 0),
                          Icons.payments,
                          AppColors.info,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: _statCard(
                          'السلف',
                          _fmt(_summary?['total_advances'] ?? 0),
                          Icons.money,
                          AppColors.warning,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: _statCard(
                          'الخصومات',
                          _fmt(_summary?['total_deductions'] ?? 0),
                          Icons.remove_circle_outline,
                          AppColors.danger,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),

                  // سجل العمليات
                  const Text('سجل العمليات',
                      style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 12),
                  if (_ledger.isEmpty)
                    Container(
                      padding: const EdgeInsets.all(32),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Column(
                        children: [
                          Icon(Icons.receipt_long,
                              size: 60, color: AppColors.textSecondary),
                          SizedBox(height: 12),
                          Text('لا توجد عمليات',
                              style: TextStyle(color: AppColors.textSecondary)),
                        ],
                      ),
                    )
                  else
                    ..._ledger.map((t) => _ledgerRow(t)),
                ],
              ),
            ),
    );
  }

  Widget _statCard(String label, String value, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.divider),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color, size: 20),
          const SizedBox(height: 6),
          Text(label,
              style: const TextStyle(fontSize: 10, color: AppColors.textSecondary)),
          const SizedBox(height: 2),
          Text(value,
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _ledgerRow(Map<String, dynamic> t) {
    final type = t['transaction_type'] ?? '';
    final debit = double.tryParse(t['debit']?.toString() ?? '0') ?? 0;
    final credit = double.tryParse(t['credit']?.toString() ?? '0') ?? 0;

    String label = type;
    IconData icon = Icons.receipt;
    Color color = AppColors.primary;

    if (type == 'transport_due') {
      label = 'مستحق نقل';
      icon = Icons.local_shipping;
      color = AppColors.success;
    } else if (type == 'payment') {
      label = 'دفعة';
      icon = Icons.payments;
      color = AppColors.info;
    } else if (type == 'advance') {
      label = 'سلفة';
      icon = Icons.money;
      color = AppColors.warning;
    } else if (type == 'deduction') {
      label = 'خصم';
      icon = Icons.remove_circle;
      color = AppColors.danger;
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.divider),
      ),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: color.withOpacity(0.15),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: color, size: 18),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label,
                    style: const TextStyle(
                        fontSize: 13, fontWeight: FontWeight.bold)),
                if (t['description'] != null)
                  Text(t['description'].toString(),
                      style: const TextStyle(
                          fontSize: 11, color: AppColors.textSecondary),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis),
                Text(t['created_at']?.toString().substring(0, 10) ?? '',
                    style: const TextStyle(
                        fontSize: 10, color: AppColors.textSecondary)),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                debit > 0 ? '+${_fmt(debit)}' : '-${_fmt(credit)}',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                  color: debit > 0 ? AppColors.success : AppColors.danger,
                ),
              ),
              Text('رصيد: ${_fmt(t['balance_after'])}',
                  style: const TextStyle(
                      fontSize: 10, color: AppColors.textSecondary)),
            ],
          ),
        ],
      ),
    );
  }
}
