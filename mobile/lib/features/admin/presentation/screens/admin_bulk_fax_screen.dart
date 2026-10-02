import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/admin_service.dart';

class AdminBulkFaxScreen extends StatefulWidget {
  const AdminBulkFaxScreen({super.key});
  @override
  State<AdminBulkFaxScreen> createState() => _S();
}

class _RowItem {
  Map<String, dynamic>? suggestion;
  final qtyCtrl = TextEditingController();
  Map<String, dynamic>? factory; // {id, name_ar}
  void dispose() => qtyCtrl.dispose();
}

class _S extends State<AdminBulkFaxScreen> {
  final _svc = AdminService();
  List<Map<String, dynamic>> _suggestions = [];
  List<Map<String, dynamic>> _factories = [];
  final List<_RowItem> _rows = [ _RowItem() ];
  bool _loading = true;
  bool _saving = false;
  String? _error;

  @override
  void initState() { super.initState(); _load(); }

  @override
  void dispose() {
    for (final r in _rows) { r.dispose(); }
    super.dispose();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final results = await Future.wait([
        _svc.bulkFaxSuggestions(),
        _svc.sources(),
      ]);
      if (mounted) setState(() {
        _suggestions = results[0] as List<Map<String, dynamic>>;
        _factories = results[1] as List<Map<String, dynamic>>;
        _loading = false;
      });
    } catch (e) {
      if (mounted) setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  void _addRow() => setState(() => _rows.add(_RowItem()));
  void _removeRow(int i) {
    if (_rows.length <= 1) return;
    setState(() { _rows[i].dispose(); _rows.removeAt(i); });
  }

  Future<void> _submit() async {
    final items = <Map<String, dynamic>>[];
    for (int i = 0; i < _rows.length; i++) {
      final r = _rows[i];
      if (r.suggestion == null) {
        setState(() => _error = 'الصف ${i+1}: اختر السائق');
        return;
      }
      if (r.factory == null) {
        setState(() => _error = 'الصف ${i+1}: اختر المصنع');
        return;
      }
      if (r.suggestion!['vehicle_id'] == null) {
        setState(() => _error = 'الصف ${i+1}: لا توجد قاطرة مرتبطة بالسائق');
        return;
      }
      final qty = double.tryParse(r.qtyCtrl.text.trim());
      if (qty == null || qty <= 0) {
        setState(() => _error = 'الصف ${i+1}: كمية غير صحيحة');
        return;
      }
      items.add({
        'driverId': r.suggestion!['driver_id'],
        'driverName': r.suggestion!['full_name'],
        'vehicleId': r.suggestion!['vehicle_id'],
        'factoryId': r.factory!['id'],
        'quantity': qty,
      });
    }
    if (items.isEmpty) { setState(() => _error = 'أضف صفًا واحدًا على الأقل'); return; }

    setState(() { _saving = true; _error = null; });
    try {
      final result = await _svc.createBulkFaxes(items);
      if (mounted) {
        final created = (result['created'] as List?)?.length ?? 0;
        final failed = (result['failed'] as List?)?.length ?? 0;
        await showDialog(
          context: context,
          builder: (_) => AlertDialog(
            title: const Text('نتيجة الإنشاء'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('✅ تم إنشاء: $created فاكس', style: const TextStyle(color: AppColors.success)),
                if (failed > 0)
                  Text('❌ فشل: $failed', style: const TextStyle(color: AppColors.danger)),
                if (failed > 0) ...[
                  const SizedBox(height: 8),
                  ...(result['failed'] as List).take(5).map((f) =>
                    Text('• ${f['driverName']}: ${f['reason']}', style: const TextStyle(fontSize: 12))),
                ],
              ],
            ),
            actions: [
              TextButton(
                onPressed: () { Navigator.pop(context); Navigator.pop(context, true); },
                child: const Text('تم'),
              ),
            ],
          ),
        );
      }
    } catch (e) {
      if (mounted) setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _saving = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('إنشاء فاكسات جماعية'),
        actions: [IconButton(icon: const Icon(Icons.add), onPressed: _loading ? null : _addRow)],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _suggestions.isEmpty
              ? const Center(child: Text('لا يوجد سائقون متاحون الآن'))
              : Column(
                  children: [
                    if (_error != null)
                      Container(
                        width: double.infinity,
                        margin: const EdgeInsets.all(12),
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: AppColors.danger.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(_error!, style: const TextStyle(color: AppColors.danger)),
                      ),
                    Expanded(
                      child: ListView.builder(
                        padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                        itemCount: _rows.length,
                        itemBuilder: (_, i) => _rowCard(i),
                      ),
                    ),
                    SafeArea(
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: ElevatedButton.icon(
                          onPressed: _saving ? null : _submit,
                          icon: _saving
                              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                              : const Icon(Icons.playlist_add_check),
                          label: Text('إنشاء الكل (${_rows.length})'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.success,
                            foregroundColor: Colors.white,
                            minimumSize: const Size(double.infinity, 54),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
    );
  }

  Widget _rowCard(int i) {
    final r = _rows[i];
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(backgroundColor: AppColors.primary, child: Text('${i+1}', style: const TextStyle(color: Colors.white))),
                const SizedBox(width: 8),
                const Expanded(child: Text('سائق', style: TextStyle(fontWeight: FontWeight.bold))),
                if (_rows.length > 1)
                  IconButton(icon: const Icon(Icons.delete_outline, color: AppColors.danger), onPressed: () => _removeRow(i)),
              ],
            ),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              value: r.suggestion?['driver_id']?.toString(),
              decoration: const InputDecoration(labelText: 'السائق', prefixIcon: Icon(Icons.person)),
              items: _suggestions.map((s) => DropdownMenuItem(
                value: s['driver_id'].toString(),
                child: Text('${s['full_name']} • ${s['plate_number'] ?? "بدون قاطرة"}'),
              )).toList(),
              onChanged: (v) {
                final s = _suggestions.firstWhere((x) => x['driver_id'].toString() == v);
                setState(() {
                  r.suggestion = s;
                  if (s['last_quantity'] != null && r.qtyCtrl.text.isEmpty) {
                    r.qtyCtrl.text = s['last_quantity'].toString().split('.').first;
                  }
                  if (s['last_factory_id'] != null) {
                    final f = _factories.firstWhere((x) => x['id'].toString() == s['last_factory_id'].toString(),
                        orElse: () => {});
                    if (f.isNotEmpty) r.factory = f;
                  }
                });
              },
            ),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              value: r.factory?['id']?.toString(),
              decoration: const InputDecoration(labelText: 'المصنع', prefixIcon: Icon(Icons.factory)),
              items: _factories.map((f) => DropdownMenuItem(
                value: f['id'].toString(),
                child: Text(f['name_ar']?.toString() ?? '—'),
              )).toList(),
              onChanged: (v) {
                final f = _factories.firstWhere((x) => x['id'].toString() == v);
                setState(() => r.factory = f);
              },
            ),
            const SizedBox(height: 8),
            TextField(
              controller: r.qtyCtrl,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'الكمية (كيس)',
                prefixIcon: Icon(Icons.inventory_2),
                hintText: '1500',
              ),
            ),
            if (r.suggestion != null) Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                'قاطرة: ${r.suggestion!['plate_number'] ?? "—"} • رحلات: ${r.suggestion!['trips_count'] ?? 0}',
                style: const TextStyle(fontSize: 11, color: AppColors.textSecondary),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
