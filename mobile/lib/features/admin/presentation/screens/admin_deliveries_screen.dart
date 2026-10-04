import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/admin_service.dart';
import '../widgets/admin_async_view.dart';

/// تعيين سائق وقاطرة المؤسسة للطلبات المدفوعة (توصيل المؤسسة فقط)
class AdminDeliveriesScreen extends StatefulWidget {
  const AdminDeliveriesScreen({super.key});
  @override
  State<AdminDeliveriesScreen> createState() => _DelState();
}

class _DelState extends State<AdminDeliveriesScreen> {
  final _service = AdminService();
  List<Map<String, dynamic>> _list = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final l = await _service.deliveriesPendingAssignment();
      if (mounted) setState(() { _list = l; _loading = false; });
    } catch (e) {
      if (mounted) setState(() { _error = e.toString().replaceFirst('Exception: ', ''); _loading = false; });
    }
  }

  Future<void> _assign(Map<String, dynamic> o) async {
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _AssignSheet(order: o),
    );
    if (ok == true) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('تم تعيين السائق'), backgroundColor: AppColors.success));
      }
      _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        appBar: AppBar(title: const Text('التوصيلات — تعيين سائق'),
            actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: _load)]),
        body: AdminAsyncView(
          loading: _loading, error: _error, isEmpty: _list.isEmpty,
          emptyText: 'لا توجد طلبات بانتظار تعيين سائق', onRetry: _load,
          builder: () => RefreshIndicator(
            onRefresh: _load,
            child: ListView.builder(
              padding: const EdgeInsets.all(12),
              itemCount: _list.length,
              itemBuilder: (_, i) {
                final o = _list[i];
                return Card(
                  child: ListTile(
                    title: Text('${o['order_number'] ?? '—'}  •  ${o['customer_name'] ?? ''}',
                        style: const TextStyle(fontWeight: FontWeight.bold)),
                    subtitle: Text('${o['quantity'] ?? ''} ${o['unit'] ?? ''} — ${o['product_name'] ?? ''}\n'
                        '${o['governorate'] ?? ''} ${o['area'] ?? ''} ${o['address_text'] ?? ''}\n'
                        'الإجمالي: ${o['total_amount'] ?? 0}'),
                    isThreeLine: true,
                    trailing: const Icon(Icons.local_shipping, color: AppColors.brandRed),
                    onTap: () => _assign(o),
                  ),
                );
              },
            ),
          ),
        ),
      ),
    );
  }
}

class _AssignSheet extends StatefulWidget {
  final Map<String, dynamic> order;
  const _AssignSheet({required this.order});
  @override
  State<_AssignSheet> createState() => _AssignState();
}

class _AssignState extends State<_AssignSheet> {
  final _service = AdminService();
  List<Map<String, dynamic>> _drivers = [];
  List<Map<String, dynamic>> _vehicles = [];
  String? _driverId, _vehicleId;
  bool _loading = true, _saving = false;
  String? _error;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final r = await Future.wait([_service.drivers(), _service.vehicles()]);
      if (mounted) setState(() { _drivers = r[0]; _vehicles = r[1]; _loading = false; });
    } catch (e) {
      if (mounted) setState(() { _error = e.toString().replaceFirst('Exception: ', ''); _loading = false; });
    }
  }

  Future<void> _save() async {
    if (_driverId == null || _vehicleId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('اختر السائق والقاطرة'), backgroundColor: AppColors.danger));
      return;
    }
    setState(() => _saving = true);
    try {
      await _service.assignDriver(widget.order['id'].toString(), _driverId!, _vehicleId!);
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        setState(() => _saving = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(e.toString().replaceFirst('Exception: ', '')), backgroundColor: AppColors.danger));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Padding(
        padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + MediaQuery.of(context).viewInsets.bottom),
        child: SizedBox(
          height: 330,
          child: AdminAsyncView(
            loading: _loading, error: _error, isEmpty: false, onRetry: _load,
            builder: () => Column(children: [
              Text('تعيين سائق للطلب ${widget.order['order_number'] ?? ''}',
                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'السائق'),
                items: [for (final d in _drivers)
                  DropdownMenuItem(value: d['id'].toString(), child: Text('${d['full_name'] ?? '—'}  ${d['phone'] ?? ''}'))],
                onChanged: (v) => setState(() => _driverId = v),
              ),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'القاطرة'),
                items: [for (final v in _vehicles)
                  DropdownMenuItem(value: v['id'].toString(), child: Text('${v['plate_number'] ?? '—'}'))],
                onChanged: (v) => setState(() => _vehicleId = v),
              ),
              const Spacer(),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(backgroundColor: AppColors.brandRed, foregroundColor: Colors.white),
                  onPressed: _saving ? null : _save,
                  child: _saving
                      ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Text('تعيين'),
                ),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}
