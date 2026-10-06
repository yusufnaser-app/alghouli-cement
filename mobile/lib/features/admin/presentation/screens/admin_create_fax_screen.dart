import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/admin_service.dart';

class AdminCreateFaxScreen extends StatefulWidget {
  /// معرّف طلب اختياري — يُملأ تلقائيًا عند الفتح من قائمة التكليف
  final String? initialOrderId;
  /// معرّف مصنع مبدئي
  final String? initialFactoryId;
  /// كمية مبدئية
  final double? initialQuantity;
  /// محافظة مبدئية (من الطلب)
  final String? initialGovernorate;
  /// منطقة مبدئية (من الطلب)
  final String? initialArea;

  const AdminCreateFaxScreen({
    super.key,
    this.initialOrderId,
    this.initialFactoryId,
    this.initialQuantity,
    this.initialGovernorate,
    this.initialArea,
  });

  @override
  State<AdminCreateFaxScreen> createState() => _State();
}

class _State extends State<AdminCreateFaxScreen> {
  final _service = AdminService();
  final _qtyCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();
  final _orderCtrl = TextEditingController();
  final _governorateCtrl = TextEditingController();
  final _areaCtrl = TextEditingController();

  List<Map<String, dynamic>> _sources = [];
  List<Map<String, dynamic>> _drivers = [];
  List<Map<String, dynamic>> _vehicles = [];

  String? _sourceId;
  String? _driverId;
  String? _vehicleId;

  bool _loading = true;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    // ✅ ملء القيم المبدئية من الطلب
    if (widget.initialOrderId != null) _orderCtrl.text = widget.initialOrderId!;
    if (widget.initialQuantity != null) {
      _qtyCtrl.text = widget.initialQuantity!.toStringAsFixed(0);
    }
    if (widget.initialGovernorate != null) {
      _governorateCtrl.text = widget.initialGovernorate!;
    }
    if (widget.initialArea != null) _areaCtrl.text = widget.initialArea!;
    _sourceId = widget.initialFactoryId;
  }

  @override
  void dispose() {
    _governorateCtrl.dispose();
    _areaCtrl.dispose();
    _qtyCtrl.dispose();
    _notesCtrl.dispose();
    _orderCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadLookups() async {
    try {
      final results = await Future.wait([
        _service.sources(),
        _service.drivers(),
        _service.vehicles(),
      ]);
      if (mounted) {
        setState(() {
          _sources = results[0];
          _drivers = results[1];
          _vehicles = results[2];
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  Future<void> _submit() async {
    if (_sourceId == null || _driverId == null || _vehicleId == null) {
      setState(() => _error = 'اختر المصنع والسائق والقاطرة');
      return;
    }
    final qty = double.tryParse(_qtyCtrl.text.trim());
    if (qty == null || qty <= 0) {
      setState(() => _error = 'أدخل كمية صحيحة');
      return;
    }

    setState(() { _saving = true; _error = null; });
    try {
      await _service.createFax(
        factoryId: _sourceId!,
        driverId: _driverId!,
        vehicleId: _vehicleId!,
        quantity: qty,
        orderId: _orderCtrl.text.trim().isEmpty ? null : _orderCtrl.text.trim(),
        notes: _notesCtrl.text.trim().isEmpty ? null : _notesCtrl.text.trim(),
        deliveryGovernorate: _governorateCtrl.text.trim().isEmpty ? null : _governorateCtrl.text.trim(),
        deliveryArea: _areaCtrl.text.trim().isEmpty ? null : _areaCtrl.text.trim(),
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('✅ تم إنشاء الفاكس'), backgroundColor: AppColors.success),
        );
        Navigator.pop(context, true);
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
      appBar: AppBar(title: const Text('إنشاء فاكس جديد')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (_error != null)
                    Container(
                      padding: const EdgeInsets.all(12),
                      margin: const EdgeInsets.only(bottom: 12),
                      decoration: BoxDecoration(
                        color: AppColors.danger.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(_error!, style: const TextStyle(color: AppColors.danger)),
                    ),
                  _lbl('المصنع'),
                  DropdownButtonFormField<String>(
                    value: _sourceId,
                    decoration: const InputDecoration(prefixIcon: Icon(Icons.factory)),
                    items: _sources.map((s) => DropdownMenuItem(
                      value: s['id'].toString(),
                      child: Text(s['name_ar']?.toString() ?? s['name']?.toString() ?? '—'),
                    )).toList(),
                    onChanged: (v) => setState(() => _sourceId = v),
                  ),
                  const SizedBox(height: 16),

                  _lbl('السائق'),
                  DropdownButtonFormField<String>(
                    value: _driverId,
                    decoration: const InputDecoration(prefixIcon: Icon(Icons.person)),
                    items: _drivers.map((d) => DropdownMenuItem(
                      value: d['id'].toString(),
                      child: Text(d['full_name']?.toString() ?? d['name']?.toString() ?? '—'),
                    )).toList(),
                    onChanged: (v) => setState(() => _driverId = v),
                  ),
                  const SizedBox(height: 16),

                  _lbl('القاطرة'),
                  DropdownButtonFormField<String>(
                    value: _vehicleId,
                    decoration: const InputDecoration(prefixIcon: Icon(Icons.local_shipping)),
                    items: _vehicles.map((v) => DropdownMenuItem(
                      value: v['id'].toString(),
                      child: Text(v['plate_number']?.toString() ?? '—'),
                    )).toList(),
                    onChanged: (v) => setState(() => _vehicleId = v),
                  ),
                  const SizedBox(height: 16),

                  _lbl('الكمية (كيس)'),
                  TextField(
                    controller: _qtyCtrl,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      prefixIcon: Icon(Icons.inventory_2),
                      hintText: '1500',
                    ),
                  ),
                  const SizedBox(height: 16),

                  _lbl('معرّف الطلب (اختياري)'),
                  TextField(
                    controller: _orderCtrl,
                    decoration: const InputDecoration(
                      prefixIcon: Icon(Icons.receipt),
                      hintText: 'UUID',
                    ),
                  ),
                  const SizedBox(height: 16),

                  _lbl('المحافظة (لمطابقة الطلبات تلقائيًا)'),
              TextField(
                controller: _governorateCtrl,
                decoration: const InputDecoration(
                  prefixIcon: Icon(Icons.location_city),
                  hintText: 'مثال: صنعاء',
                ),
              ),
              const SizedBox(height: 16),

              _lbl('المنطقة'),
              TextField(
                controller: _areaCtrl,
                decoration: const InputDecoration(
                  prefixIcon: Icon(Icons.place),
                  hintText: 'مثال: بني الحارث',
                ),
              ),
              const SizedBox(height: 16),

              _lbl('ملاحظات'),
                  TextField(
                    controller: _notesCtrl,
                    maxLines: 3,
                    decoration: const InputDecoration(
                      prefixIcon: Icon(Icons.note),
                      hintText: 'ملاحظات إضافية',
                    ),
                  ),
                  const SizedBox(height: 24),

                  ElevatedButton.icon(
                    onPressed: _saving ? null : _submit,
                    icon: _saving
                        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Icon(Icons.save),
                    label: const Text('إنشاء الفاكس'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      foregroundColor: Colors.white,
                      minimumSize: const Size(double.infinity, 54),
                    ),
                  ),
                ],
              ),
            ),
    );
  }

  Widget _lbl(String t) => Padding(
    padding: const EdgeInsets.only(bottom: 6),
    child: Text(t, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
  );
}
