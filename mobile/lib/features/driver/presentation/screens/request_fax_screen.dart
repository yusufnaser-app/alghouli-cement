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
  List<Map<String, dynamic>> _myVehicles = [];
  Map<String, dynamic>? _profile;
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
      final factories = await _service.factories();
      final vehicles = await _service.vehicles();
      final profile = await _service.myProfile();
      setState(() {
        _factories = factories;
        _myVehicles = vehicles;
        _profile = profile;
        if (_myVehicles.isNotEmpty) {
          _vehicleId = _myVehicles.first['id'];
        }
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
      setState(() => _error = 'لا توجد قاطرة مرتبطة بحسابك');
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
                            'اختر المصنع وأدخل الكمية. سيصلك إشعار بعد اعتماد الفاكس.',
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

                  // بيانات السائق (ثابتة)
                  _infoSection(),
                  const SizedBox(height: 20),

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

  Widget _infoSection() {
    final name = _profile?['full_name'] ?? '—';
    final phone = _profile?['phone'] ?? '—';
    final plate = _myVehicles.isNotEmpty
        ? _myVehicles.first['plate_number'] ?? '—'
        : 'لا توجد قاطرة';

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.divider),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('بياناتك',
              style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                  color: AppColors.primary)),
          const Divider(height: 20),
          _infoRow(Icons.person, 'الاسم', name),
          const SizedBox(height: 10),
          _infoRow(Icons.phone, 'الهاتف', phone),
          const SizedBox(height: 10),
          _infoRow(
            Icons.local_shipping,
            'القاطرة',
            plate,
            color: _myVehicles.isNotEmpty ? AppColors.success : AppColors.danger,
          ),
        ],
      ),
    );
  }

  Widget _infoRow(IconData icon, String label, String value, {Color? color}) {
    return Row(
      children: [
        Icon(icon, size: 16, color: AppColors.textSecondary),
        const SizedBox(width: 10),
        SizedBox(
          width: 80,
          child: Text(label,
              style: const TextStyle(
                  fontSize: 13, color: AppColors.textSecondary)),
        ),
        Expanded(
          child: Text(value,
              style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: color)),
        ),
      ],
    );
  }
}
