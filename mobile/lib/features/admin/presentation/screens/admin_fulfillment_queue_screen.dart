import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/admin_service.dart';
import '../widgets/admin_async_view.dart';
import 'admin_deliveries_screen.dart';
import 'admin_create_fax_screen.dart';

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
  final _govCtrl = TextEditingController();
  String _gov = '';

  @override
  void initState() { super.initState(); _load(); }

  @override
  void dispose() { _govCtrl.dispose(); super.dispose(); }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final r = await Future.wait([_service.deliveriesPendingAssignment(), _service.availableTrips(governorate: _gov.isEmpty ? null : _gov)]);
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

  /// فتح شاشة إنشاء فاكس مع تعبئة مسبقة من الطلب
  Future<void> _createFaxForOrder(Map<String, dynamic> o) async {
    final result = await Navigator.push<bool>(
      context,
      MaterialPageRoute(
        builder: (_) => AdminCreateFaxScreen(
          initialOrderId: o['id']?.toString(),
          initialFactoryId: o['source_id']?.toString() ?? o['factory_id']?.toString(),
          initialQuantity: double.tryParse(o['quantity']?.toString() ?? '0'),
          initialGovernorate: o['governorate']?.toString(),
          initialArea: o['area']?.toString(),
        ),
      ),
    );
    if (result == true) {
      _snack('تم إنشاء الفاكس — جاري التحديث', AppColors.success);
      await _load();
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
                      const SizedBox(height: 8),
                      Row(children: [
                        Expanded(child: ElevatedButton.icon(
                          onPressed: _busy ? null : () => _createFaxForOrder(o),
                          icon: const Icon(Icons.add_box, size: 18),
                          label: const Text('إنشاء فاكس للطلب'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.info,
                            foregroundColor: Colors.white,
                          ),
                        )),
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

  Color _scoreColor(num score) {
    if (score >= 100) return AppColors.success;
    if (score >= 90) return AppColors.info;
    if (score >= 80) return AppColors.accent;
    return AppColors.warning;
  }

  Widget _tripsTab() {
    return Column(children: [
      // المحافظة تُفعّل الترتيب بالملاءمة (match_score) كما يفعل التكليف التلقائي
      Padding(
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
        child: TextField(
          controller: _govCtrl,
          textInputAction: TextInputAction.search,
          onSubmitted: (v) { _gov = v.trim(); _load(); },
          decoration: InputDecoration(
            hintText: 'المحافظة — لترتيب الرحلات حسب الملاءمة',
            prefixIcon: const Icon(Icons.place_outlined),
            suffixIcon: _gov.isEmpty
                ? IconButton(
                    icon: const Icon(Icons.search),
                    onPressed: () { _gov = _govCtrl.text.trim(); _load(); })
                : IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: () { _govCtrl.clear(); _gov = ''; _load(); }),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
          ),
        ),
      ),
      Expanded(
        child: AdminAsyncView(
          loading: _loading, error: _error, isEmpty: _trips.isEmpty,
          emptyText: 'لا توجد رحلات نشطة', onRetry: _load,
          builder: () => RefreshIndicator(
            onRefresh: _load,
            child: ListView.builder(
              padding: const EdgeInsets.all(12),
              itemCount: _trips.length,
              itemBuilder: (_, i) {
                final t = _trips[i];
                final score = num.tryParse((t['match_score'] ?? '').toString());
                final reason = (t['match_reason'] ?? '').toString();
                return Card(
                  child: ListTile(
                    title: Text('فاكس ${t['fax_number'] ?? 'بانتظار الإصدار'} • ${t['driver_name'] ?? '—'}',
                        style: const TextStyle(fontWeight: FontWeight.bold)),
                    subtitle: Text('${t['factory_name'] ?? ''} — ${t['plate_number'] ?? ''}\n'
                        '${t['delivery_governorate'] ?? ''}  |  المتبقي: ${t['remaining'] ?? 0} من ${t['capacity'] ?? 0}'
                        '  |  وجهات: ${t['destinations_count'] ?? 0}'
                        '${reason.isEmpty ? '' : '\n$reason'}'),
                    isThreeLine: true,
                    trailing: score == null
                        ? null
                        : Column(
                            mainAxisSize: MainAxisSize.min,
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                decoration: BoxDecoration(
                                  color: _scoreColor(score),
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: Text('$score',
                                    style: const TextStyle(
                                        color: Colors.white, fontWeight: FontWeight.bold)),
                              ),
                              const SizedBox(height: 2),
                              const Text('ملاءمة', style: TextStyle(fontSize: 10)),
                            ],
                          ),
                  ),
                );
              },
            ),
          ),
        ),
      ),
    ]);
  }
}
