import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/admin_service.dart';
import '../widgets/admin_async_view.dart';
import 'admin_deliveries_screen.dart';

/// قائمة التكليف: طلبات معتمدة بانتظار تكليف + الرحلات النشطة وكمياتها المتبقية
class AdminFulfillmentQueueScreen extends StatefulWidget {
  const AdminFulfillmentQueueScreen({super.key});
  @override
  State<AdminFulfillmentQueueScreen> createState() => _QState();
}

class _QState extends State<AdminFulfillmentQueueScreen> {
  final _service = AdminService();
  List<Map<String, dynamic>> _orders = [];
  List<Map<String, dynamic>> _trips = [];
  bool _loading = true, _busy = false;
  String? _error;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final r = await Future.wait([_service.deliveriesPendingAssignment(), _service.availableTrips()]);
      if (mounted) setState(() { _orders = r[0]; _trips = r[1]; _loading = false; });
    } catch (e) {
      if (mounted) setState(() { _error = e.toString().replaceFirst('Exception: ', ''); _loading = false; });
    }
  }

  void _snack(String m, Color c) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m), backgroundColor: c));

  Future<void> _autoOne(Map<String, dynamic> o) async {
    setState(() => _busy = true);
    try {
      final r = await _service.autoAssignOrder(o['id'].toString());
      if (!mounted) return;
      if (r['assigned'] == true) {
        _snack('تم التكليف على الفاكس ${r['fax_number'] ?? ''}', AppColors.success);
      } else {
        _snack('لم يُكلَّف: ${r['reason'] ?? 'لا توجد رحلة مناسبة'}', AppColors.warning);
      }
      await _load();
    } catch (e) {
      if (mounted) _snack(e.toString().replaceFirst('Exception: ', ''), AppColors.danger);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _autoAll() async {
    setState(() => _busy = true);
    try {
      final r = await _service.autoAssignAll();
      if (!mounted) return;
      _snack('كُلِّف ${r['assigned'] ?? 0} من ${r['total'] ?? 0} — متبقٍ ${r['skipped'] ?? 0}، فشل ${r['failed'] ?? 0}', AppColors.success);
      await _load();
    } catch (e) {
      if (mounted) _snack(e.toString().replaceFirst('Exception: ', ''), AppColors.danger);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: TextDirection.rtl,
      child: DefaultTabController(
        length: 2,
        child: Scaffold(
          appBar: AppBar(
            title: const Text('قائمة التكليف'),
            actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: _load)],
            bottom: const TabBar(tabs: [Tab(text: 'بانتظار التكليف'), Tab(text: 'الرحلات النشطة')]),
          ),
          body: TabBarView(children: [_ordersTab(), _tripsTab()]),
        ),
      ),
    );
  }

  Widget _ordersTab() {
    return AdminAsyncView(
      loading: _loading, error: _error, isEmpty: _orders.isEmpty,
      emptyText: 'لا توجد طلبات بانتظار التكليف', onRetry: _load,
      builder: () => Column(children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              style: ElevatedButton.styleFrom(backgroundColor: AppColors.brandRed, foregroundColor: Colors.white),
              onPressed: _busy ? null : _autoAll,
              icon: const Icon(Icons.auto_mode),
              label: const Text('تكليف الكل تلقائيًا'),
            ),
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: _load,
            child: ListView.builder(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
              itemCount: _orders.length,
              itemBuilder: (_, i) {
                final o = _orders[i];
                return Card(
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('${o['order_number'] ?? '—'}  •  ${o['customer_name'] ?? ''}',
                          style: const TextStyle(fontWeight: FontWeight.bold)),
                      Text('${o['factory_name'] ?? ''} — ${o['quantity'] ?? ''} ${o['unit'] ?? ''}'),
                      Text('${o['governorate'] ?? ''} ${o['area'] ?? ''}',
                          style: const TextStyle(color: AppColors.textSecondary)),
                      const SizedBox(height: 8),
                      Row(children: [
                        Expanded(child: OutlinedButton(
                          onPressed: _busy ? null : () => _autoOne(o),
                          child: const Text('تكليف تلقائي'))),
                        const SizedBox(width: 8),
                        Expanded(child: OutlinedButton(
                          onPressed: _busy ? null : () async {
                            await Navigator.push(context,
                                MaterialPageRoute(builder: (_) => const AdminDeliveriesScreen()));
                            _load();
                          },
                          child: const Text('تكليف يدوي'))),
                      ]),
                    ]),
                  ),
                );
              },
            ),
          ),
        ),
      ]),
    );
  }

  Widget _tripsTab() {
    return AdminAsyncView(
      loading: _loading, error: _error, isEmpty: _trips.isEmpty,
      emptyText: 'لا توجد رحلات نشطة', onRetry: _load,
      builder: () => RefreshIndicator(
        onRefresh: _load,
        child: ListView.builder(
          padding: const EdgeInsets.all(12),
          itemCount: _trips.length,
          itemBuilder: (_, i) {
            final t = _trips[i];
            return Card(
              child: ListTile(
                title: Text('فاكس ${t['fax_number'] ?? 'بانتظار الإصدار'} • ${t['driver_name'] ?? '—'}',
                    style: const TextStyle(fontWeight: FontWeight.bold)),
                subtitle: Text('${t['factory_name'] ?? ''} — ${t['plate_number'] ?? ''}\n'
                    '${t['delivery_governorate'] ?? ''}  |  المتبقي: ${t['remaining'] ?? 0} من ${t['capacity'] ?? 0}'
                    '  |  وجهات: ${t['destinations_count'] ?? 0}'),
                isThreeLine: true,
              ),
            );
          },
        ),
      ),
    );
  }
}
