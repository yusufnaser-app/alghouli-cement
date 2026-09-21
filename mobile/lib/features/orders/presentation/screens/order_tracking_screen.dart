import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/order_service.dart';

class OrderTrackingScreen extends StatefulWidget {
  final String orderId;
  const OrderTrackingScreen({super.key, required this.orderId});

  @override
  State<OrderTrackingScreen> createState() => _OrderTrackingScreenState();
}

class _OrderTrackingScreenState extends State<OrderTrackingScreen> {
  final _service = OrderService();
  Map<String, dynamic>? _order;
  bool _loading = true;

  static const _steps = [
    {'status': 'PENDING_PAYMENT', 'label': 'بانتظار الدفع', 'icon': Icons.payment},
    {'status': 'PENDING_PAYMENT_REVIEW', 'label': 'مراجعة الدفع', 'icon': Icons.hourglass_top},
    {'status': 'PAYMENT_APPROVED', 'label': 'تم اعتماد الدفع', 'icon': Icons.check_circle},
    {'status': 'PREPARING', 'label': 'جاري التجهيز', 'icon': Icons.inventory},
    {'status': 'DRIVER_ASSIGNED', 'label': 'تعيين السائق', 'icon': Icons.person},
    {'status': 'LOADED', 'label': 'تم التحميل', 'icon': Icons.download_done},
    {'status': 'IN_TRANSIT', 'label': 'في الطريق', 'icon': Icons.local_shipping},
    {'status': 'DELIVERED', 'label': 'تم التسليم', 'icon': Icons.home},
  ];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final o = await _service.orderDetails(widget.orderId);
      setState(() => _order = o);
    } catch (_) {}
    setState(() => _loading = false);
  }

  int get _currentIndex {
    final status = _order?['status'] ?? '';
    final idx = _steps.indexWhere((s) => s['status'] == status);
    return idx >= 0 ? idx : 0;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('تتبع الطلب'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _order == null
              ? const Center(child: Text('تعذر تحميل الطلب'))
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: AppColors.primary,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Column(
                        children: [
                          const Icon(Icons.local_shipping,
                              size: 60, color: Colors.white),
                          const SizedBox(height: 12),
                          Text(_order!['order_number'] ?? '',
                              style: const TextStyle(
                                  fontSize: 20,
                                  fontWeight: FontWeight.bold,
                                  color: Colors.white)),
                        ],
                      ),
                    ),
                    const SizedBox(height: 24),
                    ...List.generate(_steps.length, (i) {
                      final step = _steps[i];
                      final isDone = i <= _currentIndex;
                      final isCurrent = i == _currentIndex;
                      return _timelineItem(
                        step['label'] as String,
                        step['icon'] as IconData,
                        isDone,
                        isCurrent,
                        i == _steps.length - 1,
                      );
                    }),
                  ],
                ),
    );
  }

  Widget _timelineItem(String label, IconData icon, bool isDone,
      bool isCurrent, bool isLast) {
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Column(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: isDone ? AppColors.primary : Colors.grey.shade300,
                  shape: BoxShape.circle,
                  border: isCurrent
                      ? Border.all(color: AppColors.secondary, width: 3)
                      : null,
                ),
                child: Icon(icon,
                    color: Colors.white,
                    size: isCurrent ? 24 : 20),
              ),
              if (!isLast)
                Expanded(
                  child: Container(
                    width: 3,
                    color: isDone ? AppColors.primary : Colors.grey.shade300,
                  ),
                ),
            ],
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(top: 10, bottom: 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label,
                      style: TextStyle(
                        fontWeight:
                            isCurrent ? FontWeight.bold : FontWeight.normal,
                        fontSize: 16,
                        color: isDone
                            ? AppColors.textPrimary
                            : AppColors.textSecondary,
                      )),
                  if (isCurrent)
                    const Padding(
                      padding: EdgeInsets.only(top: 4),
                      child: Text('الحالة الحالية',
                          style: TextStyle(
                              fontSize: 12,
                              color: AppColors.secondary,
                              fontWeight: FontWeight.bold)),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
