import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/wallet_service.dart';

class WalletScreen extends StatefulWidget {
  const WalletScreen({super.key});

  @override
  State<WalletScreen> createState() => _WalletScreenState();
}

class _WalletScreenState extends State<WalletScreen> {
  final _service = WalletService();
  CustomerSummary? _summary;
  List<Map<String, dynamic>> _ledger = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final summary = await _service.getSummary();
      final ledger = await _service.getLedger();
      setState(() {
        _summary = summary;
        _ledger = ledger;
      });
    } catch (e) {
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      setState(() => _loading = false);
    }
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
        title: const Text('محفظتي'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.error_outline,
                            size: 60, color: AppColors.danger),
                        const SizedBox(height: 16),
                        Text(_error!,
                            textAlign: TextAlign.center,
                            style: const TextStyle(color: AppColors.danger)),
                        const SizedBox(height: 16),
                        ElevatedButton(
                          onPressed: _load,
                          child: const Text('إعادة المحاولة'),
                        ),
                      ],
                    ),
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      // بطاقة الرصيد الرئيسية
                      Container(
                        padding: const EdgeInsets.all(24),
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(
                            colors: [AppColors.primary, AppColors.primaryLight],
                            begin: Alignment.topRight,
                            end: Alignment.bottomLeft,
                          ),
                          borderRadius: BorderRadius.circular(20),
                          boxShadow: [
                            BoxShadow(
                              color: AppColors.primary.withOpacity(0.3),
                              blurRadius: 20,
                              offset: const Offset(0, 8),
                            ),
                          ],
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Row(
                              children: [
                                Icon(Icons.account_balance_wallet,
                                    color: Colors.white, size: 28),
                                SizedBox(width: 8),
                                Text('رصيد الحساب',
                                    style: TextStyle(
                                        color: Colors.white70, fontSize: 14)),
                              ],
                            ),
                            const SizedBox(height: 16),
                            Text(
                              '${_fmt(_summary?.currentBalance ?? 0)} ر.ي',
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 32,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              (_summary?.currentBalance ?? 0) > 0
                                  ? 'مبلغ مستحق عليك'
                                  : 'لا توجد مستحقات',
                              style: const TextStyle(
                                  color: Colors.white70, fontSize: 12),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),

                      // إحصائيات
                      Row(
                        children: [
                          Expanded(
                            child: _statCard(
                              'الحد الائتماني',
                              '${_fmt(_summary?.creditLimit ?? 0)}',
                              Icons.credit_card,
                              AppColors.accent,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: _statCard(
                              'المتاح',
                              '${_fmt(_summary?.availableCredit ?? 0)}',
                              Icons.check_circle,
                              AppColors.success,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: _statCard(
                              'إجمالي المشتريات',
                              '${_fmt(_summary?.totalPurchases ?? 0)}',
                              Icons.shopping_cart,
                              AppColors.secondary,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: _statCard(
                              'إجمالي المدفوعات',
                              '${_fmt(_summary?.totalPayments ?? 0)}',
                              Icons.payments,
                              AppColors.info,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 24),

                      // كشف الحساب
                      const Text('كشف الحساب',
                          style: TextStyle(
                              fontSize: 16, fontWeight: FontWeight.bold)),
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
                                  style: TextStyle(
                                      color: AppColors.textSecondary)),
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
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.divider),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color, size: 22),
          const SizedBox(height: 8),
          Text(label,
              style: const TextStyle(
                  fontSize: 11, color: AppColors.textSecondary)),
          const SizedBox(height: 4),
          Text(value,
              style: const TextStyle(
                  fontSize: 14, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _ledgerRow(Map<String, dynamic> t) {
    final type = t['transaction_type'] ?? '';
    final debit = double.tryParse(t['debit']?.toString() ?? '0') ?? 0;
    final credit = double.tryParse(t['credit']?.toString() ?? '0') ?? 0;
    final isDebit = debit > 0;

    String typeLabel = '';
    IconData icon = Icons.receipt;
    Color color = AppColors.primary;

    if (type == 'purchase') {
      typeLabel = 'طلب';
      icon = Icons.shopping_cart;
      color = AppColors.warning;
    } else if (type == 'payment') {
      typeLabel = 'دفعة';
      icon = Icons.payments;
      color = AppColors.success;
    } else if (type == 'cancellation') {
      typeLabel = 'إلغاء';
      icon = Icons.cancel;
      color = AppColors.textSecondary;
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.divider),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: color.withOpacity(0.15),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: color, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(typeLabel,
                    style: const TextStyle(
                        fontWeight: FontWeight.bold, fontSize: 13)),
                if (t['description'] != null)
                  Text(t['description'].toString(),
                      style: const TextStyle(
                          fontSize: 11, color: AppColors.textSecondary),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis),
                if (t['created_at'] != null)
                  Text(t['created_at'].toString().substring(0, 10),
                      style: const TextStyle(
                          fontSize: 10, color: AppColors.textSecondary)),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                isDebit ? '+${_fmt(debit)}' : '-${_fmt(credit)}',
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 15,
                  color: isDebit ? AppColors.danger : AppColors.success,
                ),
              ),
              Text('الرصيد: ${_fmt(t['balance_after'])}',
                  style: const TextStyle(
                      fontSize: 10, color: AppColors.textSecondary)),
            ],
          ),
        ],
      ),
    );
  }
}
