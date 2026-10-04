import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/admin_service.dart';

class AdminFaxDestinationsScreen extends StatefulWidget {
  final String faxId;
  final String faxNumber;
  final double loadedQuantity;

  const AdminFaxDestinationsScreen({
    super.key,
    required this.faxId,
    required this.faxNumber,
    required this.loadedQuantity,
  });

  @override
  State<AdminFaxDestinationsScreen> createState() => _S();
}

class _Row {
  String type; // trader | warehouse
  String? traderId;
  String? warehouseId;
  final TextEditingController qtyCtrl;
  final TextEditingController labelCtrl;

  _Row({this.type = 'trader'})
      : qtyCtrl = TextEditingController(),
        labelCtrl = TextEditingController();

  void dispose() {
    qtyCtrl.dispose();
    labelCtrl.dispose();
  }
}

class _S extends State<AdminFaxDestinationsScreen> {
  final _svc = AdminService();
  List<Map<String, dynamic>> _traders = [];
  List<Map<String, dynamic>> _warehouses = [];
  final List<_Row> _rows = [_Row()];
  bool _loading = true;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final r in _rows) { r.dispose(); }
    super.dispose();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final results = await Future.wait([
        _svc.tradersList(),
        _svc.warehouses(),
        _svc.faxDestinations(widget.faxId),
      ]);
      if (!mounted) return;
      setState(() {
        _traders = results[0];
        _warehouses = results[1];
        final existing = results[2];
        // إن كانت هناك وجهات محفوظة
        if (existing.isNotEmpty) {
          _rows.clear();
          for (final d in existing) {
            final r = _Row(type: d['destination_type']?.toString() ?? 'trader');
            r.traderId = d['trader_id']?.toString();
            r.warehouseId = d['warehouse_id']?.toString();
            r.qtyCtrl.text = (double.tryParse(d['quantity']?.toString() ?? '0') ?? 0).toStringAsFixed(0);
            r.labelCtrl.text = d['label']?.toString() ?? '';
            _rows.add(r);
          }
        }
        _loading = false;
      });
    } catch (e) {
      if (mounted) setState(() { _error = e.toString().replaceFirst('Exception: ', ''); _loading = false; });
    }
  }

  void _addRow() => setState(() => _rows.add(_Row()));
  void _removeRow(int i) {
    if (_rows.length <= 1) return;
    setState(() { _rows[i].dispose(); _rows.removeAt(i); });
  }

  double get _totalQty {
    double sum = 0;
    for (final r in _rows) {
      sum += double.tryParse(r.qtyCtrl.text.trim()) ?? 0;
    }
    return sum;
  }

  bool get _totalMatches => (_totalQty - widget.loadedQuantity).abs() < 0.01;

  Future<void> _submit() async {
    // تحقق
    for (int i = 0; i < _rows.length; i++) {
      final r = _rows[i];
      if (r.type == 'trader' && (r.traderId == null || r.traderId!.isEmpty)) {
        setState(() => _error = 'الصف ${i+1}: اختر التاجر');
        return;
      }
      if (r.type == 'warehouse' && (r.warehouseId == null || r.warehouseId!.isEmpty)) {
        setState(() => _error = 'الصف ${i+1}: اختر المستودع');
        return;
      }
      final qty = double.tryParse(r.qtyCtrl.text.trim());
      if (qty == null || qty <= 0) {
        setState(() => _error = 'الصف ${i+1}: كمية غير صحيحة');
        return;
      }
    }
    if (!_totalMatches) {
      setState(() => _error = 'المجموع ${_totalQty.toStringAsFixed(0)} ≠ ${widget.loadedQuantity.toStringAsFixed(0)}');
      return;
    }

    setState(() { _saving = true; _error = null; });
    try {
      final payload = <Map<String, dynamic>>[];
      for (final r in _rows) {
        final qty = double.parse(r.qtyCtrl.text.trim());
        final item = <String, dynamic>{
          'destinationType': r.type,
          'quantity': qty,
          'unit': 'bag',
        };
        if (r.type == 'trader') {
          item['traderId'] = r.traderId;
        } else {
          item['warehouseId'] = r.warehouseId;
        }
        if (r.labelCtrl.text.trim().isNotEmpty) {
          item['label'] = r.labelCtrl.text.trim();
        }
        payload.add(item);
      }
      await _svc.saveDestinations(widget.faxId, payload);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('✅ تم حفظ الوجهات'), backgroundColor: AppColors.success),
      );
      Navigator.pop(context, true);
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
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: Text('وجهات ${widget.faxNumber}'),
        actions: [
          IconButton(icon: const Icon(Icons.add_location_alt), onPressed: _loading ? null : _addRow),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null && _rows.isEmpty
              ? Center(child: Text(_error!))
              : Column(
                  children: [
                    // رأس — الكمية المحملة والمجموع
                    Container(
                      margin: const EdgeInsets.all(12),
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: AppColors.primary.withOpacity(0.08),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: AppColors.primary.withOpacity(0.3)),
                      ),
                      child: Row(
                        children: [
                          Expanded(child: _stat('الكمية المحملة', widget.loadedQuantity.toStringAsFixed(0))),
                          Container(width: 1, height: 40, color: AppColors.divider),
                          Expanded(child: _stat('المجموع', _totalQty.toStringAsFixed(0),
                            color: _totalMatches ? AppColors.success : AppColors.danger)),
                        ],
                      ),
                    ),

                    if (_error != null)
                      Container(
                        margin: const EdgeInsets.symmetric(horizontal: 12),
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: AppColors.danger.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(_error!, style: const TextStyle(color: AppColors.danger)),
                      ),

                    Expanded(
                      child: ListView.builder(
                        padding: const EdgeInsets.fromLTRB(12, 6, 12, 12),
                        itemCount: _rows.length,
                        itemBuilder: (_, i) => _rowCard(i),
                      ),
                    ),

                    SafeArea(
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: ElevatedButton.icon(
                          onPressed: _saving || !_totalMatches ? null : _submit,
                          icon: _saving
                              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                              : const Icon(Icons.save),
                          label: const Text('حفظ الوجهات'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.primary,
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

  Widget _stat(String label, String value, {Color? color}) {
    return Column(
      children: [
        Text(label, style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
        const SizedBox(height: 4),
        Text(value, style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: color ?? AppColors.primary)),
      ],
    );
  }

  Widget _rowCard(int i) {
    final r = _rows[i];
    final trader = r.traderId != null
        ? _traders.firstWhere((t) => t['id'].toString() == r.traderId, orElse: () => {})
        : null;
    final warehouse = r.warehouseId != null
        ? _warehouses.firstWhere((w) => w['id'].toString() == r.warehouseId, orElse: () => {})
        : null;

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
                const Expanded(child: Text('وجهة', style: TextStyle(fontWeight: FontWeight.bold))),
                if (_rows.length > 1)
                  IconButton(icon: const Icon(Icons.delete_outline, color: AppColors.danger), onPressed: () => _removeRow(i)),
              ],
            ),
            const SizedBox(height: 8),

            // نوع الوجهة
            Row(children: [
              Expanded(
                child: ChoiceChip(
                  label: const Text('تاجر'),
                  selected: r.type == 'trader',
                  onSelected: (_) => setState(() { r.type = 'trader'; r.warehouseId = null; }),
                  selectedColor: AppColors.primary,
                  labelStyle: TextStyle(color: r.type == 'trader' ? Colors.white : null),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: ChoiceChip(
                  label: const Text('مستودع'),
                  selected: r.type == 'warehouse',
                  onSelected: (_) => setState(() { r.type = 'warehouse'; r.traderId = null; }),
                  selectedColor: AppColors.info,
                  labelStyle: TextStyle(color: r.type == 'warehouse' ? Colors.white : null),
                ),
              ),
            ]),
            const SizedBox(height: 10),

            // اختيار
            if (r.type == 'trader')
              DropdownButtonFormField<String>(
                value: r.traderId,
                decoration: const InputDecoration(labelText: 'التاجر', prefixIcon: Icon(Icons.store)),
                items: _traders.map((t) => DropdownMenuItem(
                  value: t['id'].toString(),
                  child: Text('${t['full_name']} — ${t['phone'] ?? ''}'),
                )).toList(),
                onChanged: (v) => setState(() => r.traderId = v),
              )
            else
              DropdownButtonFormField<String>(
                value: r.warehouseId,
                decoration: const InputDecoration(labelText: 'المستودع', prefixIcon: Icon(Icons.warehouse)),
                items: _warehouses.map((w) => DropdownMenuItem(
                  value: w['id'].toString(),
                  child: Text('${w['name_ar']} (${w['code'] ?? ''})'),
                )).toList(),
                onChanged: (v) => setState(() => r.warehouseId = v),
              ),

            // معلومات مختصرة
            if (trader != null) ...[
              const SizedBox(height: 6),
              Text('المحافظة: ${trader['governorate'] ?? "—"} • ${trader['area'] ?? ""}',
                  style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
            ],
            if (warehouse != null) ...[
              const SizedBox(height: 6),
              Text('${warehouse['name_ar']} • ${warehouse['governorate'] ?? "—"}',
                  style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
            ],

            const SizedBox(height: 10),
            TextField(
              controller: r.qtyCtrl,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(
                labelText: 'الكمية',
                prefixIcon: Icon(Icons.inventory_2),
                suffixText: 'كيس',
              ),
            ),
          ],
        ),
      ),
    );
  }
}
