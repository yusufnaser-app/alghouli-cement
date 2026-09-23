import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/widgets/primary_button.dart';
import '../../data/trader_service.dart';

class RequestFaxForDriverScreen extends StatefulWidget {
  final Map<String, dynamic>? initialDriver;

  const RequestFaxForDriverScreen({super.key, this.initialDriver});

  @override
  State<RequestFaxForDriverScreen> createState() =>
      _RequestFaxForDriverScreenState();
}

class _RequestFaxForDriverScreenState extends State<RequestFaxForDriverScreen> {
  final _service = TraderService();
  final _qtyController = TextEditingController();
  final _notesController = TextEditingController();

  List<Map<String, dynamic>> _drivers = [];
  List<Map<String, dynamic>> _vehicles = [];
  List<Map<String, dynamic>> _factories = [];

  String? _driverId;
  String? _vehicleId;
  String? _factoryId;
  bool _loading = true;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _driverId = widget.initialDriver?['id'];
    _load();
  }

  @override
  void dispose() {
    _qtyController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final client = _service;
      final results = await Future.wait([
        client.listDrivers(),
        client.listVehicles(),
        _loadFactories(),
      ]);
      setState(() {
        _drivers = results[0];
        _vehicles = results[1];
        _factories = results[2];
      });
    } catch (e) {
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<List<Map<String, dynamic>>> _loadFactories() async {
    try {
      final r = await _service.factories();
      return r;
    } catch (_) {
      return [];
    }
  }

  Future<void> _submit() async {
    if (_driverId == null) {
      setState(() => _error = 'يرجى اختيار السائق');
      return;
    }
    if (_factoryId == null) {
      setState(() => _error = 'يرجى اختيار المصنع');
      return;
    }
    if (_vehicleId == null) {
      setState(() => _error = 'يرجى اختيار القاطرة');
      return;
    }
    final qty = double.tryParse(_qtyController.text.trim());
    if (qty == null || qty <= 0) {
      setState(() => _error = 'يرجى إدخال كمية صحيحة');
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      await _service.requestFaxForDriver(
        driverId: _driverId!,
        factoryId: _factoryId!,
        vehicleId: _vehicleId!,
        quantity: qty,
        notes: _notesController.text.trim(),
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('✅ تم إرسال طلب الفاكس — سيصلك إشعار عند الاعتماد'),
          backgroundColor: AppColors.success,
          duration: Duration(seconds: 4),
        ),
      );
      Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  // قاطرات السائق المختار فقط
  List<Map<String, dynamic>> get _filteredVehicles {
    if (_driverId == null) return _vehicles;
    final filtered = _vehicles.where((v) {
      final currentDriver = v['current_driver_id'];
      final driverName = v['driver_name'];
      return currentDriver == _driverId ||
          driverName == _drivers.firstWhere(
            (d) => d['id'] == _driverId,
            orElse: () => {'full_name': ''},
          )['full_name'];
    }).toList();
    return filtered.isEmpty ? _vehicles : filtered;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('طلب فاكس لسائقي')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: AppColors.info.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: AppColors.info.withOpacity(0.3)),
                    ),
                    child: const Row(
                      children: [
                        Icon(Icons.info_outline, color: AppColors.info),
                        SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            'اختر السائق والقاطرة والمصنع. سيستلم السائق إشعار SMS بعد اعتماد الفاكس.',
                            style: TextStyle(fontSize: 12),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),

                  if (_error != null) ...[
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppColors.danger.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.error_outline,
                              color: AppColors.danger),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(_error!,
                                style: const TextStyle(
                                    color: AppColors.danger)),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                  ],

                  // السائق
                  const Text('السائق *',
                      style: TextStyle(
                          fontWeight: FontWeight.bold, fontSize: 14)),
                  const SizedBox(height: 8),
                  _drivers.isEmpty
                      ? _emptyHint('لا يوجد سائقون — أضف سائقيك أولًا')
                      : DropdownButtonFormField<String>(
                          value: _driverId,
                          decoration: const InputDecoration(
                            prefixIcon: Icon(Icons.person),
                            hintText: 'اختر سائقًا',
                          ),
                          items: _drivers.map((d) {
                            return DropdownMenuItem<String>(
                              value: d['id'] as String,
                              child: Text(
                                  '${d['full_name'] ?? ''} — ${d['phone'] ?? ''}'),
                            );
                          }).toList(),
                          onChanged: (v) => setState(() {
                            _driverId = v;
                            _vehicleId = null;
                          }),
                        ),
                  const SizedBox(height: 16),

                  // القاطرة
                  const Text('القاطرة *',
                      style: TextStyle(
                          fontWeight: FontWeight.bold, fontSize: 14)),
                  const SizedBox(height: 8),
                  _filteredVehicles.isEmpty
                      ? _emptyHint('لا توجد قاطرات متاحة')
                      : DropdownButtonFormField<String>(
                          value: _vehicleId,
                          decoration: const InputDecoration(
                            prefixIcon: Icon(Icons.local_shipping),
                            hintText: 'اختر قاطرة',
                          ),
                          items: _filteredVehicles.map((v) {
                            return DropdownMenuItem<String>(
                              value: v['id'] as String,
                              child: Text(
                                  '${v['plate_number']} — ${v['vehicle_type']}'),
                            );
                          }).toList(),
                          onChanged: (v) => setState(() => _vehicleId = v),
                        ),
                  const SizedBox(height: 16),

                  // المصنع
                  const Text('المصنع *',
                      style: TextStyle(
                          fontWeight: FontWeight.bold, fontSize: 14)),
                  const SizedBox(height: 8),
                  _factories.isEmpty
                      ? _emptyHint('لا توجد مصانع متاحة')
                      : DropdownButtonFormField<String>(
                          value: _factoryId,
                          decoration: const InputDecoration(
                            prefixIcon: Icon(Icons.factory),
                            hintText: 'اختر مصنعًا',
                          ),
                          items: _factories.map((f) {
                            return DropdownMenuItem<String>(
                              value: f['id'] as String,
                              child: Text(f['name_ar'] ?? ''),
                            );
                          }).toList(),
                          onChanged: (v) => setState(() => _factoryId = v),
                        ),
                  const SizedBox(height: 16),

                  // الكمية
                  const Text('الكمية (بالكيس) *',
                      style: TextStyle(
                          fontWeight: FontWeight.bold, fontSize: 14)),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _qtyController,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      prefixIcon: Icon(Icons.inventory_2),
                      hintText: 'مثال: 500',
                    ),
                  ),
                  const SizedBox(height: 16),

                  // ملاحظات
                  const Text('ملاحظات (اختياري)',
                      style: TextStyle(
                          fontWeight: FontWeight.bold, fontSize: 14)),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _notesController,
                    maxLines: 2,
                    decoration: const InputDecoration(
                      prefixIcon: Icon(Icons.note),
                      hintText: 'أي تعليمات إضافية للسائق',
                    ),
                  ),
                  const SizedBox(height: 32),

                  PrimaryButton(
                    text: 'إرسال طلب الفاكس',
                    icon: Icons.send,
                    isLoading: _saving,
                    onPressed: _submit,
                  ),
                ],
              ),
            ),
    );
  }

  Widget _emptyHint(String text) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.warning.withOpacity(0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.warning.withOpacity(0.4)),
      ),
      child: Row(
        children: [
          const Icon(Icons.warning_amber, color: AppColors.warning, size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: Text(text, style: const TextStyle(fontSize: 12)),
          ),
        ],
      ),
    );
  }
}
