import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/driver_service.dart';
import 'fax_details_screen.dart';

class MyFaxesScreen extends StatefulWidget {
  const MyFaxesScreen({super.key});

  @override
  State<MyFaxesScreen> createState() => _MyFaxesScreenState();
}

class _MyFaxesScreenState extends State<MyFaxesScreen> {
  final _service = DriverService();
  List<Map<String, dynamic>> _items = [];
  bool _loading = true;
  String _filter = 'all';

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

  List<Map<String, dynamic>> get _filtered {
    if (_filter == 'all') return _items;
    if (_filter == 'active') {
      return _items
          .where((f) =>
              ['REQUESTED', 'APPROVED', 'ISSUED', 'USED'].contains(f['status']))
          .toList();
    }
    if (_filter == 'done') {
      return _items.where((f) => f['status'] == 'USED').toList();
    }
    return _items;
  }

  Future<void> _openDetails(Map<String, dynamic> f) async {
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => FaxDetailsScreen(faxId: f['id'], initialData: f),
      ),
    );
    _load();
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

  // الخطوات لحساب المرحلة الحالية
  int _currentStep(String status) {
    switch (status) {
      case 'REQUESTED': return 0;
      case 'APPROVED': return 1;
      case 'ISSUED': return 2;
      case 'USED': return 3;
      default: return -1;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('فاكساتي'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                // فلاتر
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  color: Colors.white,
                  child: Row(
                    children: [
                      _filterChip('الكل', 'all'),
                      const SizedBox(width: 8),
                      _filterChip('النشطة', 'active'),
                      const SizedBox(width: 8),
                      _filterChip('المكتملة', 'done'),
                    ],
                  ),
                ),
                Expanded(
                  child: _filtered.isEmpty
                      ? _emptyState()
                      : RefreshIndicator(
                          onRefresh: _load,
                          child: ListView.builder(
                            padding: const EdgeInsets.all(16),
                            itemCount: _filtered.length,
                            itemBuilder: (_, i) => _faxCard(_filtered[i]),
                          ),
                        ),
                ),
              ],
            ),
    );
  }

  Widget _filterChip(String label, String value) {
    final selected = _filter == value;
    return InkWell(
      onTap: () => setState(() => _filter = value),
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: selected ? AppColors.primary : AppColors.lightGray,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.bold,
            color: selected ? Colors.white : AppColors.textSecondary,
          ),
        ),
      ),
    );
  }

  Widget _emptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.receipt_long,
              size: 80, color: AppColors.textSecondary.withOpacity(0.4)),
          const SizedBox(height: 16),
          const Text('لا توجد فاكسات',
              style: TextStyle(fontSize: 16, color: AppColors.textSecondary)),
          const SizedBox(height: 8),
          const Text('اضغط على "طلب فاكس" للبدء',
              style: TextStyle(fontSize: 12, color: AppColors.textSecondary)),
        ],
      ),
    );
  }

  Widget _faxCard(Map<String, dynamic> f) {
    final status = f['status'] ?? '';
    final color = _statusColor(status);
    final step = _currentStep(status);

    return InkWell(
      onTap: () => _openDetails(f),
      borderRadius: BorderRadius.circular(16),
      child: Container(
        margin: const EdgeInsets.only(bottom: 14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.divider),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.03),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // ===== الرأس =====
              Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: color.withOpacity(0.15),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(_statusIcon(status), color: color, size: 22),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(f['factory_name'] ?? '—',
                            style: const TextStyle(
                                fontSize: 15, fontWeight: FontWeight.bold)),
                        const SizedBox(height: 2),
                        Row(
                          children: [
                            const Icon(Icons.local_shipping,
                                size: 12, color: AppColors.textSecondary),
                            const SizedBox(width: 4),
                            Text(
                              '${f['plate_number'] ?? ''} • ${_fmt(f['requested_quantity'])} كيس',
                              style: const TextStyle(
                                  fontSize: 11,
                                  color: AppColors.textSecondary),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: color.withOpacity(0.12),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(_statusAr(status),
                        style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                            color: color)),
                  ),
                ],
              ),

              const SizedBox(height: 16),

              // ===== خطوات الرحلة (Timeline أفقي) =====
              if (step >= 0) _buildTimeline(step),

              const SizedBox(height: 12),
              const Divider(height: 1),

              // ===== التفاصيل =====
              const SizedBox(height: 12),
              Row(
                children: [
                  if (f['fax_number'] != null) ...[
                    Expanded(
                      child: _infoItem(
                        Icons.description,
                        'رقم الفاكس',
                        f['fax_number'].toString(),
                        AppColors.primary,
                      ),
                    ),
                  ],
                  if (f['route'] != null) ...[
                    Expanded(
                      child: _infoItem(
                        Icons.route,
                        'خط السير',
                        f['route'].toString(),
                        AppColors.accent,
                      ),
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: _infoItem(
                      Icons.calendar_today,
                      'التاريخ',
                      f['requested_at']?.toString().substring(0, 10) ?? '—',
                      AppColors.textSecondary,
                    ),
                  ),
                  if (f['transport_total'] != null)
                    Expanded(
                      child: _infoItem(
                        Icons.payments,
                        'مستحق النقل',
                        '${_fmt(f['transport_total'])} ر.ي',
                        AppColors.success,
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildTimeline(int currentStep) {
    final steps = [
      _Step('فاكس', Icons.description),
      _Step('تحميل', Icons.download),
      _Step('في الطريق', Icons.local_shipping),
      _Step('تسليم', Icons.check_circle),
    ];

    return Row(
      children: List.generate(steps.length * 2 - 1, (i) {
        if (i.isOdd) {
          final stepIndex = i ~/ 2;
          final passed = stepIndex < currentStep;
          return Expanded(
            child: Container(
              height: 2,
              color: passed ? AppColors.success : AppColors.divider,
            ),
          );
        }
        final idx = i ~/ 2;
        final done = idx <= currentStep;
        final step = steps[idx];
        return Column(
          children: [
            Container(
              width: 28,
              height: 28,
              decoration: BoxDecoration(
                color: done ? AppColors.success : Colors.white,
                shape: BoxShape.circle,
                border: Border.all(
                  color: done ? AppColors.success : AppColors.divider,
                  width: 2,
                ),
              ),
              child: Icon(
                step.icon,
                size: 14,
                color: done ? Colors.white : AppColors.textSecondary,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              step.label,
              style: TextStyle(
                fontSize: 9,
                fontWeight: done ? FontWeight.bold : FontWeight.normal,
                color: done ? AppColors.success : AppColors.textSecondary,
              ),
            ),
          ],
        );
      }),
    );
  }

  Widget _infoItem(IconData icon, String label, String value, Color color) {
    return Row(
      children: [
        Icon(icon, size: 14, color: color),
        const SizedBox(width: 4),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label,
                style: const TextStyle(
                    fontSize: 9, color: AppColors.textSecondary)),
            Text(value,
                style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    color: AppColors.textPrimary),
                maxLines: 1,
                overflow: TextOverflow.ellipsis),
          ],
        ),
      ],
    );
  }
}

class _Step {
  final String label;
  final IconData icon;
  _Step(this.label, this.icon);
}
