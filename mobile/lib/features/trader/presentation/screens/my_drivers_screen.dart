import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/widgets/primary_button.dart';
import '../../data/trader_service.dart';
import 'request_fax_for_driver_screen.dart';

class MyDriversScreen extends StatefulWidget {
  const MyDriversScreen({super.key});

  @override
  State<MyDriversScreen> createState() => _MyDriversScreenState();
}

class _MyDriversScreenState extends State<MyDriversScreen> {
  final _service = TraderService();
  List<Map<String, dynamic>> _drivers = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final list = await _service.listDrivers();
      setState(() => _drivers = list);
    } catch (e) {
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _openAddDriver() async {
    final result = await Navigator.push<Map<String, dynamic>>(
      context,
      MaterialPageRoute(builder: (_) => const AddDriverScreen()),
    );
    if (result != null && mounted) {
      _showCredentials(result);
      _load();
    }
  }

  Future<void> _requestFaxForDriver(Map<String, dynamic> driver) async {
    final r = await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => RequestFaxForDriverScreen(initialDriver: driver),
      ),
    );
    if (r == true) _load();
  }

  void _showCredentials(Map<String, dynamic> data) {
    final creds = data['credentials'] as Map<String, dynamic>?;
    if (creds == null) return;
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Row(
          children: [
            Icon(Icons.check_circle, color: AppColors.success),
            SizedBox(width: 8),
            Text('تم إضافة السائق'),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('بيانات الدخول للسائق:',
                style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 12),
            _credRow('الهاتف', creds['phone']?.toString() ?? ''),
            const SizedBox(height: 8),
            _credRow('كلمة المرور', creds['password']?.toString() ?? ''),
            const SizedBox(height: 12),
            const Text('احتفظ بهذه البيانات وأرسلها للسائق',
                style: TextStyle(fontSize: 11, color: AppColors.textSecondary)),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('تم'),
          ),
        ],
      ),
    );
  }

  Widget _credRow(String label, String value) {
    return Row(
      children: [
        SizedBox(
          width: 90,
          child: Text('$label:',
              style: const TextStyle(fontSize: 13, color: AppColors.textSecondary)),
        ),
        Expanded(
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: AppColors.primary.withOpacity(0.08),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Row(
              children: [
                Expanded(
                  child: SelectableText(value,
                      style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.bold,
                          fontFamily: 'monospace')),
                ),
                IconButton(
                  icon: const Icon(Icons.copy, size: 16),
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                  onPressed: () {
                    Clipboard.setData(ClipboardData(text: value));
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text('تم نسخ $label'),
                        duration: const Duration(seconds: 1),
                      ),
                    );
                  },
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Future<void> _removeDriver(Map<String, dynamic> d) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('حذف السائق؟'),
        content: Text('${d['full_name']} — ${d['phone']}'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('إلغاء'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('حذف', style: TextStyle(color: AppColors.danger)),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await _service.removeDriver(d['id']);
      if (!mounted) return;
      _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(e.toString().replaceFirst('Exception: ', '')),
          backgroundColor: AppColors.danger,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('سائقوني'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.error_outline,
                            size: 60, color: AppColors.danger),
                        const SizedBox(height: 16),
                        Text(_error!,
                            textAlign: TextAlign.center,
                            style: const TextStyle(color: AppColors.danger)),
                        const SizedBox(height: 16),
                        ElevatedButton(
                          onPressed: _load,
                          child: const Text('إعادة المحاولة'),
                        ),
                      ],
                    ),
                  ),
                )
              : _drivers.isEmpty
                  ? Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.person_add,
                              size: 80,
                              color: AppColors.textSecondary.withOpacity(0.5)),
                          const SizedBox(height: 16),
                          const Text('لا يوجد سائقون',
                              style: TextStyle(
                                  fontSize: 16, color: AppColors.textSecondary)),
                        ],
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _drivers.length,
                        itemBuilder: (context, i) {
                          final d = _drivers[i];
                          return Container(
                            margin: const EdgeInsets.only(bottom: 12),
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(color: AppColors.divider),
                            ),
                            child: Column(
                              children: [
                                Row(
                                  children: [
                                    Container(
                                      width: 48,
                                      height: 48,
                                      decoration: BoxDecoration(
                                        color: AppColors.primary.withOpacity(0.12),
                                        borderRadius: BorderRadius.circular(12),
                                      ),
                                      child: const Icon(Icons.person,
                                          color: AppColors.primary, size: 26),
                                    ),
                                    const SizedBox(width: 14),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Text(d['full_name'] ?? '',
                                              style: const TextStyle(
                                                  fontSize: 15,
                                                  fontWeight: FontWeight.bold)),
                                          const SizedBox(height: 4),
                                          Row(
                                            children: [
                                              const Icon(Icons.phone,
                                                  size: 12,
                                                  color: AppColors.textSecondary),
                                              const SizedBox(width: 4),
                                              Text(d['phone'] ?? '',
                                                  style: const TextStyle(
                                                      fontSize: 12,
                                                      color: AppColors.textSecondary)),
                                            ],
                                          ),
                                          const SizedBox(height: 6),
                                          Row(
                                            children: [
                                              _miniChip(
                                                Icons.local_shipping,
                                                '${d['vehicles_count'] ?? 0} قاطرة',
                                                AppColors.info,
                                              ),
                                              const SizedBox(width: 6),
                                              _miniChip(
                                                Icons.receipt_long,
                                                '${d['trips_count'] ?? 0} رحلة',
                                                AppColors.secondary,
                                              ),
                                            ],
                                          ),
                                        ],
                                      ),
                                    ),
                                    IconButton(
                                      icon: const Icon(Icons.delete_outline,
                                          color: AppColors.danger),
                                      onPressed: () => _removeDriver(d),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 12),
                                const Divider(height: 1),
                                const SizedBox(height: 12),
                                SizedBox(
                                  width: double.infinity,
                                  child: ElevatedButton.icon(
                                    onPressed: () => _requestFaxForDriver(d),
                                    icon: const Icon(Icons.request_page, size: 18),
                                    label: const Text('طلب فاكس له'),
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: AppColors.success,
                                      foregroundColor: Colors.white,
                                      minimumSize: const Size(0, 42),
                                      shape: RoundedRectangleBorder(
                                        borderRadius: BorderRadius.circular(10),
                                      ),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          );
                        },
                      ),
                    ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _openAddDriver,
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add),
        label: const Text('إضافة سائق'),
      ),
    );
  }

  Widget _miniChip(IconData icon, String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 11, color: color),
          const SizedBox(width: 3),
          Text(label,
              style: TextStyle(
                  fontSize: 10, color: color, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

// === شاشة إضافة سائق ===
class AddDriverScreen extends StatefulWidget {
  const AddDriverScreen({super.key});

  @override
  State<AddDriverScreen> createState() => _AddDriverScreenState();
}

class _AddDriverScreenState extends State<AddDriverScreen> {
  final _service = TraderService();
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _passwordController = TextEditingController();
  final _plateController = TextEditingController();
  final _capacityController = TextEditingController();

  String _vehicleType = 'truck_10t';
  bool _addVehicle = false;
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _passwordController.dispose();
    _plateController.dispose();
    _capacityController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final name = _nameController.text.trim();
    final phone = _phoneController.text.trim();

    if (name.length < 3) {
      setState(() => _error = 'الاسم قصير جدًا');
      return;
    }
    if (!RegExp(r'^967[0-9]{9}$').hasMatch(phone)) {
      setState(() => _error = 'رقم الهاتف بصيغة 967XXXXXXXXX');
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      final result = await _service.addDriver(
        fullName: name,
        phone: phone,
        password: _passwordController.text.trim().isEmpty
            ? null
            : _passwordController.text.trim(),
        vehiclePlate: _addVehicle ? _plateController.text.trim() : null,
        vehicleType: _addVehicle ? _vehicleType : null,
        capacityTons: _addVehicle && _capacityController.text.isNotEmpty
            ? double.tryParse(_capacityController.text.trim())
            : null,
      );
      if (!mounted) return;
      Navigator.pop(context, result);
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
      appBar: AppBar(title: const Text('إضافة سائق')),
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
            const Text('بيانات السائق',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            const SizedBox(height: 12),
            const Text('الاسم الكامل *',
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
            const SizedBox(height: 6),
            TextField(
              controller: _nameController,
              decoration: const InputDecoration(
                hintText: 'محمد أحمد',
                prefixIcon: Icon(Icons.person_outline),
              ),
            ),
            const SizedBox(height: 14),
            const Text('رقم الهاتف *',
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
            const SizedBox(height: 6),
            TextField(
              controller: _phoneController,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(
                hintText: '967771234567',
                prefixIcon: Icon(Icons.phone_android),
              ),
            ),
            const SizedBox(height: 14),
            const Text('كلمة المرور (اختياري)',
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
            const SizedBox(height: 6),
            TextField(
              controller: _passwordController,
              decoration: const InputDecoration(
                hintText: 'اتركها فارغة للتوليد التلقائي',
                prefixIcon: Icon(Icons.lock_outline),
              ),
            ),
            const SizedBox(height: 24),
            const Divider(),
            const SizedBox(height: 16),
            SwitchListTile(
              value: _addVehicle,
              onChanged: (v) => setState(() => _addVehicle = v),
              title: const Text('إضافة قاطرة مع السائق',
                  style: TextStyle(fontWeight: FontWeight.bold)),
              activeColor: AppColors.primary,
              contentPadding: EdgeInsets.zero,
            ),
            if (_addVehicle) ...[
              const SizedBox(height: 12),
              const Text('رقم القاطرة',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
              const SizedBox(height: 6),
              TextField(
                controller: _plateController,
                decoration: const InputDecoration(
                  hintText: 'ABC-1234',
                  prefixIcon: Icon(Icons.confirmation_number),
                ),
              ),
              const SizedBox(height: 14),
              const Text('نوع القاطرة',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
              const SizedBox(height: 6),
              DropdownButtonFormField<String>(
                value: _vehicleType,
                decoration: const InputDecoration(
                  prefixIcon: Icon(Icons.local_shipping),
                ),
                items: const [
                  DropdownMenuItem(value: 'truck_10t', child: Text('شاحنة 10 طن')),
                  DropdownMenuItem(value: 'truck_20t', child: Text('شاحنة 20 طن')),
                  DropdownMenuItem(value: 'tanker', child: Text('صهريج سائب')),
                  DropdownMenuItem(value: 'pickup', child: Text('بيك أب')),
                ],
                onChanged: (v) => setState(() => _vehicleType = v!),
              ),
              const SizedBox(height: 14),
              const Text('الحمولة (طن)',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
              const SizedBox(height: 6),
              TextField(
                controller: _capacityController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  hintText: '10',
                  prefixIcon: Icon(Icons.scale),
                ),
              ),
            ],
            const SizedBox(height: 32),
            PrimaryButton(
              text: 'إضافة السائق',
              icon: Icons.person_add,
              isLoading: _saving,
              onPressed: _save,
            ),
          ],
        ),
      ),
    );
  }
}
