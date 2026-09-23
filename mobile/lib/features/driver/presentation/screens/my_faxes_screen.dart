import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/driver_service.dart';

class MyFaxesScreen extends StatefulWidget {
  const MyFaxesScreen({super.key});

  @override
  State<MyFaxesScreen> createState() => _MyFaxesScreenState();
}

class _MyFaxesScreenState extends State<MyFaxesScreen> {
  final _service = DriverService();
  List<Map<String, dynamic>> _items = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final list = await _service.myFaxes();
      setState(() => _items = list);
    } catch (_) {}
    setState(() => _loading = false);
  }

  String _statusAr(String s) {
    return {
      'REQUESTED': 'بانتظار الاعتماد',
      'APPROVED': 'معتمد',
      'ISSUED': 'صادر — توجه للمصنع',
      'USED': 'تم التحميل',
      'CANCELLED': 'ملغي',
      'EXPIRED': 'منتهي',
    }[s] ?? s;
  }

  Color _statusColor(String s) {
    if (s == 'REQUESTED') return AppColors.statusPending;
    if (s == 'APPROVED') return AppColors.info;
    if (s == 'ISSUED') return AppColors.accent;
    if (s == 'USED') return AppColors.success;
    if (s == 'CANCELLED') return AppColors.textSecondary;
    return AppColors.textSecondary;
  }

  IconData _statusIcon(String s) {
    if (s == 'REQUESTED') return Icons.hourglass_top;
    if (s == 'APPROVED') return Icons.check_circle_outline;
    if (s == 'ISSUED') return Icons.description;
    if (s == 'USED') return Icons.done_all;
    if (s == 'CANCELLED') return Icons.cancel;
    return Icons.help_outline;
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
        title: const Text('فاكساتي'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _items.isEmpty
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.receipt_long,
                          size: 80, color: AppColors.textSecondary.withOpacity(0.5)),
                      const SizedBox(height: 16),
                      const Text('لا توجد فاكسات',
                          style: TextStyle(
                              fontSize: 16, color: AppColors.textSecondary)),
                      const SizedBox(height: 8),
                      const Text('اضغط على "طلب فاكس" للبدء',
                          style: TextStyle(
                              fontSize: 12, color: AppColors.textSecondary)),
                    ],
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: _items.length,
                    itemBuilder: (context, i) {
                      final f = _items[i];
                      final status = f['status'] ?? '';
                      final color = _statusColor(status);
                      return Container(
                        margin: const EdgeInsets.only(bottom: 12),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: color.withOpacity(0.4), width: 2),
                        ),
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              // رأس البطاقة
                              Row(
                                children: [
                                  Container(
                                    width: 40,
                                    height: 40,
                                    decoration: BoxDecoration(
                                      color: color.withOpacity(0.15),
                                      borderRadius: BorderRadius.circular(10),
                                    ),
                                    child: Icon(_statusIcon(status), color: color, size: 20),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(f['factory_name'] ?? '—',
                                            style: const TextStyle(
                                                fontSize: 15,
                                                fontWeight: FontWeight.bold)),
                                        Text(
                                          '${f['plate_number'] ?? ''} • ${_fmt(f['requested_quantity'])} كيس',
                                          style: const TextStyle(
                                              fontSize: 12,
                                              color: AppColors.textSecondary),
                                        ),
                                      ],
                                    ),
                                  ),
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 10, vertical: 4),
                                    decoration: BoxDecoration(
                                      color: color.withOpacity(0.15),
                                      borderRadius: BorderRadius.circular(12),
                                    ),
                                    child: Text(
                                      _statusAr(status),
                                      style: TextStyle(
                                          fontSize: 10,
                                          fontWeight: FontWeight.bold,
                                          color: color),
                                    ),
                                  ),
                                ],
                              ),
                              const Divider(height: 20),

                              // تفاصيل
                              if (f['fax_number'] != null)
                                _row(Icons.description, 'رقم الفاكس',
                                    f['fax_number'].toString()),
                              if (f['route'] != null)
                                _row(Icons.route, 'خط السير', f['route'].toString()),
                              _row(
                                Icons.calendar_today,
                                'تاريخ الطلب',
                                f['requested_at']?.toString().substring(0, 10) ?? '—',
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                ),
    );
  }

  Widget _row(IconData icon, String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Icon(icon, size: 14, color: AppColors.textSecondary),
          const SizedBox(width: 6),
          Text('$label: ',
              style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
          Expanded(
            child: Text(value,
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }
}
