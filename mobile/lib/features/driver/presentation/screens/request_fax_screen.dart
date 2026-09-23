import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/widgets/primary_button.dart';
import '../../data/driver_service.dart';

class RequestFaxScreen extends StatefulWidget {
  const RequestFaxScreen({super.key});

  @override
  State<RequestFaxScreen> createState() => _RequestFaxScreenState();
}

class _RequestFaxScreenState extends State<RequestFaxScreen> {
  final _service = DriverService();
  final _qtyController = TextEditingController();
  final _notesController = TextEditingController();

  List<Map<String, dynamic>> _factories = [];
  List<Map<String, dynamic>> _vehicles = [];
  String? _factoryId;
  String? _vehicleId;
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
      final results = await Future.wait([
        _service.factories(),
        _service.vehicles(),
      ]);
      setState(() {
        _factories = results[0];
        _vehicles = results[1];
      });
    } catch (e) {
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _submit() async {
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
      await _service.requestFax(
        factoryId: _factoryId!,
        vehicleId: _vehicleId!,
        quantity: qty,
        notes: _notesController.text.trim(),
      );

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('✅ تم إرسال طلب الفاكس — سيصلك إشعار بعد الاعتماد'),
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('طلب فاكس تحميل')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // شريط معلومات
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
                            'اختر المصنع والكمية والقاطرة. سيصلك إشعار بعد اعتماد الفاكس.',
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
                          const Icon(Icons.error_outline, color: AppColors.danger),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(_error!,
                                style: const TextStyle(color: AppColors.danger)),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                  ],

                  // المصنع
                  const Text('المصنع *',
                      style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                  const SizedBox(height: 8),
                  DropdownButtonFormField<String>(
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
                      style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
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

                  // القاطرة
                  const Text('القاطرة *',
                      style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                  const SizedBox(height: 8),
                  DropdownButtonFormField<String>(
                    value: _vehicleId,
                    decoration: const InputDecoration(
                      prefixIcon: Icon(Icons.local_shipping),
                      hintText: 'اختر قاطرة',
                    ),
                    items: _vehicles.map((v) {
                      return DropdownMenuItem<String>(
                        value: v['id'] as String,
                        child: Text('${v['plate_number']} — ${v['vehicle_type']}'),
                      );
                    }).toList(),
                    onChanged: (v) => setState(() => _vehicleId = v),
                  ),
                  const SizedBox(height: 16),

                  // ملاحظات
                  const Text('ملاحظات (اختياري)',
                      style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _notesController,
                    maxLines: 2,
                    decoration: const InputDecoration(
                      prefixIcon: Icon(Icons.note),
                      hintText: 'أي ملاحظة للموظف',
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
}
