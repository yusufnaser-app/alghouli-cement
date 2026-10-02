import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/admin_service.dart';

class AdminPendingOrdersScreen extends StatefulWidget {
  const AdminPendingOrdersScreen({super.key});

  @override
  State<AdminPendingOrdersScreen> createState() => _State();
}

class _State extends State<AdminPendingOrdersScreen> {
  final _service = AdminService();
  List<Map<String, dynamic>> _orders = [];
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
      final list = await _service.pendingPricing();
      if (mounted) setState(() { _orders = list; _loading = false; });
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
      appBar: AppBar(
        title: const Text('الطلبات بانتظار التسعير'),
        actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: _load)],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : _orders.isEmpty
                  ? const Center(child: Text('لا توجد طلبات معلقة'))
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.builder(
                        padding: const EdgeInsets.all(12),
                        itemCount: _orders.length,
                        itemBuilder: (_, i) {
                          final o = _orders[i];
                          return Card(
                            margin: const EdgeInsets.only(bottom: 10),
                            child: ListTile(
                              title: Text(o['order_number']?.toString() ?? '—',
                                  style: const TextStyle(fontWeight: FontWeight.bold)),
                              subtitle: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('العميل: ${o['customer_name'] ?? '—'}'),
                                  Text('التاريخ: ${(o['created_at'] ?? '').toString().split('T').first}'),
                                ],
                              ),
                              trailing: const Icon(Icons.price_change, color: AppColors.primary),
                              onTap: () async {
                                // TODO: شاشة تسعير كاملة
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(content: Text('شاشة التسعير ستُضاف قريبًا')),
                                );
                              },
                            ),
                          );
                        },
                      ),
                    ),
    );
  }
}

class AdminAllOrdersScreen extends StatelessWidget {
  const AdminAllOrdersScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('كل الطلبات')),
      body: const Center(child: Text('قائمة الطلبات — ستُضاف')),
    );
  }
}
