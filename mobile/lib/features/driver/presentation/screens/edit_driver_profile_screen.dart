import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/widgets/primary_button.dart';
import '../../data/driver_service.dart';

class EditDriverProfileScreen extends StatefulWidget {
  final Map<String, dynamic> currentData;

  const EditDriverProfileScreen({super.key, required this.currentData});

  @override
  State<EditDriverProfileScreen> createState() =>
      _EditDriverProfileScreenState();
}

class _EditDriverProfileScreenState extends State<EditDriverProfileScreen> {
  final _service = DriverService();
  late TextEditingController _nameCtrl;
  late TextEditingController _nationalIdCtrl;
  late TextEditingController _addressCtrl;
  late TextEditingController _licenseCtrl;

  DateTime? _licenseExpiry;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _nameCtrl = TextEditingController(text: widget.currentData['full_name'] ?? '');
    _nationalIdCtrl =
        TextEditingController(text: widget.currentData['national_id'] ?? '');
    _addressCtrl =
        TextEditingController(text: widget.currentData['address'] ?? '');
    _licenseCtrl =
        TextEditingController(text: widget.currentData['license_number'] ?? '');

    final exp = widget.currentData['license_expiry'];
    if (exp != null) {
      try {
        _licenseExpiry = DateTime.parse(exp.toString());
      } catch (_) {}
    }
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _nationalIdCtrl.dispose();
    _addressCtrl.dispose();
    _licenseCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _licenseExpiry ?? DateTime.now(),
      firstDate: DateTime(2000),
      lastDate: DateTime(2040),
    );
    if (picked != null) setState(() => _licenseExpiry = picked);
  }

  Future<void> _save() async {
    if (_nameCtrl.text.trim().length < 3) {
      setState(() => _error = 'الاسم قصير جدًا');
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      final dateStr = _licenseExpiry != null
          ? '${_licenseExpiry!.year}-${_licenseExpiry!.month.toString().padLeft(2, '0')}-${_licenseExpiry!.day.toString().padLeft(2, '0')}'
          : null;

      await _service.updateMyProfile({
        'fullName': _nameCtrl.text.trim(),
        'nationalId': _nationalIdCtrl.text.trim(),
        'address': _addressCtrl.text.trim(),
        'licenseNumber': _licenseCtrl.text.trim(),
        if (dateStr != null) 'licenseExpiry': dateStr,
      });

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('✅ تم حفظ البيانات'),
          backgroundColor: AppColors.success,
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
      appBar: AppBar(title: const Text('تعديل البيانات')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
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

            const Text('الاسم الكامل *',
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
            const SizedBox(height: 6),
            TextField(
              controller: _nameCtrl,
              decoration: const InputDecoration(
                hintText: 'سالم أحمد',
                prefixIcon: Icon(Icons.person_outline),
              ),
            ),
            const SizedBox(height: 14),

            const Text('رقم الهوية',
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
            const SizedBox(height: 6),
            TextField(
              controller: _nationalIdCtrl,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                hintText: '01234567',
                prefixIcon: Icon(Icons.badge_outlined),
              ),
            ),
            const SizedBox(height: 14),

            const Text('العنوان',
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
            const SizedBox(height: 6),
            TextField(
              controller: _addressCtrl,
              maxLines: 2,
              decoration: const InputDecoration(
                hintText: 'صنعاء - السبعين',
                prefixIcon: Icon(Icons.location_on_outlined),
              ),
            ),
            const SizedBox(height: 14),

            const Text('رقم رخصة القيادة',
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
            const SizedBox(height: 6),
            TextField(
              controller: _licenseCtrl,
              decoration: const InputDecoration(
                hintText: 'DL-123456',
                prefixIcon: Icon(Icons.card_membership),
              ),
            ),
            const SizedBox(height: 14),

            const Text('تاريخ انتهاء الرخصة',
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
            const SizedBox(height: 6),
            InkWell(
              onTap: _pickDate,
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppColors.divider),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.calendar_today,
                        color: AppColors.primary),
                    const SizedBox(width: 12),
                    Text(
                      _licenseExpiry != null
                          ? '${_licenseExpiry!.year}-${_licenseExpiry!.month.toString().padLeft(2, '0')}-${_licenseExpiry!.day.toString().padLeft(2, '0')}'
                          : 'لم يُحدّد',
                      style: const TextStyle(fontSize: 14),
                    ),
                    const Spacer(),
                    const Icon(Icons.arrow_drop_down),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 32),

            PrimaryButton(
              text: 'حفظ البيانات',
              icon: Icons.save,
              isLoading: _saving,
              onPressed: _save,
            ),
          ],
        ),
      ),
    );
  }
}
