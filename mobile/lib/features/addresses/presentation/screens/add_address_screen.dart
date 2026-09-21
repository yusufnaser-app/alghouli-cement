import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/widgets/primary_button.dart';
import '../../data/address_service.dart';

class AddAddressScreen extends StatefulWidget {
  const AddAddressScreen({super.key});

  @override
  State<AddAddressScreen> createState() => _AddAddressScreenState();
}

class _AddAddressScreenState extends State<AddAddressScreen> {
  final _labelController = TextEditingController(text: 'المنزل');
  final _areaController = TextEditingController();
  final _addressController = TextEditingController();
  final _altPhoneController = TextEditingController();
  final _service = AddressService();

  String _governorate = 'صنعاء';
  bool _isDefault = false;
  bool _loading = false;
  String? _error;

  final _governorates = [
    'صنعاء', 'عمران', 'الحديدة', 'تعز', 'حضرم��وت',
    'عدن', 'إب', 'ذمار', 'حجة', 'صعدة',
  ];

  @override
  void dispose() {
    _labelController.dispose();
    _areaController.dispose();
    _addressController.dispose();
    _altPhoneController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_areaController.text.trim().isEmpty ||
        _addressController.text.trim().isEmpty) {
      setState(() => _error = 'يرجى إدخال المنطقة والعنوان');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final address = await _service.add(
        label: _labelController.text.trim(),
        governorate: _governorate,
        area: _areaController.text.trim(),
        addressText: _addressController.text.trim(),
        altPhone: _altPhoneController.text.trim().isEmpty
            ? null
            : _altPhoneController.text.trim(),
        isDefault: _isDefault,
      );
      if (!mounted) return;
      Navigator.pop(context, address);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('عنوان جديد')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (_error != null) ...[
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppColors.danger.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(_error!,
                      style: const TextStyle(color: AppColors.danger)),
                ),
                const SizedBox(height: 16),
              ],
              _lbl('التسمية'),
              TextField(
                controller: _labelController,
                decoration: const InputDecoration(
                  hintText: 'المنزل / العمل',
                  prefixIcon: Icon(Icons.label_outline),
                ),
              ),
              const SizedBox(height: 16),
              _lbl('المحافظة'),
              DropdownButtonFormField<String>(
                value: _governorate,
                decoration: const InputDecoration(
                  prefixIcon: Icon(Icons.location_city),
                ),
                items: _governorates
                    .map((g) => DropdownMenuItem(value: g, child: Text(g)))
                    .toList(),
                onChanged: (v) => setState(() => _governorate = v!),
              ),
              const SizedBox(height: 16),
              _lbl('المنطقة'),
              TextField(
                controller: _areaController,
                decoration: const InputDecoration(
                  hintText: 'السبعين',
                  prefixIcon: Icon(Icons.location_on_outlined),
                ),
              ),
              const SizedBox(height: 16),
              _lbl('العنوان التفصيلي'),
              TextField(
                controller: _addressController,
                maxLines: 2,
                decoration: const InputDecoration(
                  hintText: 'شارع تعز - جوار جامع النور',
                  prefixIcon: Icon(Icons.home_outlined),
                ),
              ),
              const SizedBox(height: 16),
              _lbl('رقم هاتف بديل (اختياري)'),
              TextField(
                controller: _altPhoneController,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(
                  hintText: '967771234567',
                  prefixIcon: Icon(Icons.phone_outlined),
                ),
              ),
              const SizedBox(height: 16),
              CheckboxListTile(
                value: _isDefault,
                onChanged: (v) => setState(() => _isDefault = v ?? false),
                title: const Text('تعيين كعنوان افتراضي'),
                activeColor: AppColors.primary,
                contentPadding: EdgeInsets.zero,
              ),
              const SizedBox(height: 16),
              PrimaryButton(
                text: 'حفظ العنوان',
                icon: Icons.save,
                isLoading: _loading,
                onPressed: _save,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _lbl(String t) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(t,
            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
      );
}
