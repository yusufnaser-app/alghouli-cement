import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/order_service.dart';
import 'order_details_screen.dart';

class OrdersListScreen extends StatefulWidget {
  const OrdersListScreen({super.key});

  @override
  State<OrdersListScreen> createState() => _OrdersListScreenState();
}

class _OrdersListScreenState extends State<OrdersListScreen> {
  final _service = OrderService();
  List<Map<String, dynamic>> _orders = [];
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
      final list = await _service.myOrders();
      setState(() => _orders = list);
    } catch (e) {
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      setState(() => _loading = false);
    }
  }

  String _statusAr(String s) {
    const map = {
      'PENDING_PAYMENT': 'بانتظار الدفع',
      'RECEIPT_UPLOADED': 'تم رفع الإيصال',
      'PENDING_PAYMENT_REVIEW': 'بانتظار المراجعة',
      'PAYMENT_APPROVED': 'تم اعتماد الدفع',
      'PREPARING': 'جاري التجهيز',
      'DRIVER_ASSIGNED': 'تم تعيين السائق',
      'LOADED': 'تم التحميل',
      'IN_TRANSIT': 'في الطريق',
      'DELIVERED': 'تم التسليم',
      'COMPLETED': 'مكتمل',
      'CANCELLED': 'ملغي',
      'PAYMENT_REJECTED': 'مرفوض',
    };
    return map[s] ?? s;
  }

  Color _statusColor(String s) {
    if (s == 'PENDING_PAYMENT' || s == 'PENDING_PAYMENT_REVIEW' ||
        s == 'RECEIPT_UPLOADED') return AppColors.statusPending;
    if (s == 'PAYMENT_APPROVED' || s == 'PREPARING' ||
        s == 'DRIVER_ASSIGNED' || s == 'LOADED') return AppColors.statusApproved;
    if (s == 'IN_TRANSIT') return AppColors.statusInTransit;
    if (s == 'DELIVERED' || s == 'COMPLETED') return AppColors.statusCompleted;
    if (s == 'CANCELLED') return AppColors.statusCancelled;
    if (s == 'PAYMENT_REJECTED') return AppColors.statusRejected;
    return AppColors.textSecondary;
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
        title: const Text('طلباتي'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : _orders.isEmpty
                  ? const Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.receipt_long,
                              size: 80, color: AppColors.textSecondary),
                          SizedBox(height: 16),
                          Text('لا توجد طلبات',
                              style: TextStyle(
                                  fontSize: 18,
                                  color: AppColors.textSecondary)),
                        ],
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _orders.length,
                        itemBuilder: (context, i) {
                          final o = _orders[i];
                          final status = o['status'] ?? '';
                          return InkWell(
                            onTap: () async {
                              await Navigator.push(
                                context,
                                MaterialPageRoute(
                                  builder: (_) => OrderDetailsScreen(
                                    orderId: o['id'],
                                  ),
                                ),
                              );
                              _load();
                            },
                            borderRadius: BorderRadius.circular(12),
                            child: Container(
                              margin: const EdgeInsets.only(bottom: 12),
                              padding: const EdgeInsets.all(16),
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(
                                    color: _statusColor(status).withOpacity(0.3)),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    mainAxisAlignment:
                                        MainAxisAlignment.spaceBetween,
                                    children: [
                                      Text(o['order_number'] ?? '',
                                          style: const TextStyle(
                                              fontWeight: FontWeight.bold)),
                                      Container(
                                        padding: const EdgeInsets.symmetric(
                                            horizontal: 10, vertical: 4),
                                        decoration: BoxDecoration(
                                          color: _statusColor(status),
                                          borderRadius:
                                              BorderRadius.circular(20),
                                        ),
                                        child: Text(
                                          _statusAr(status),
                                          style: const TextStyle(
                                              color: Colors.white,
                                              fontSize: 11,
                                              fontWeight: FontWeight.bold),
                                        ),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 8),
                                  Text(
                                    o['created_at']
                                            ?.toString()
                                            .substring(0, 10) ??
                                        '',
                                    style: const TextStyle(
                                        fontSize: 12,
                                        color: AppColors.textSecondary),
                                  ),
                                  const Divider(height: 20),
                                  Row(
                                    mainAxisAlignment:
                                        MainAxisAlignment.spaceBetween,
                                    children: [
                                      const Text('الإجمالي',
                                          style: TextStyle(
                                              fontSize: 12,
                                              color: AppColors.textSecondary)),
                                      Text('${_fmt(o['total_amount'])} ريال',
                                          style: const TextStyle(
                                              fontWeight: FontWeight.bold,
                                              color: AppColors.primary)),
                                    ],
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
}
