import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/widgets/primary_button.dart';
import '../../data/trader_service.dart';

class MyVehiclesScreen extends StatefulWidget {
  const MyVehiclesScreen({super.key});

  @override
  State<MyVehiclesScreen> createState() => _MyVehiclesScreenState();
}

class _MyVehiclesScreenState extends State<MyVehiclesScreen> {
  final _service = TraderService();
  List<Map<String, dynamic>> _vehicles = [];
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
      final results = await Future.wait([
        _service.listVehicles(),
        _service.listDrivers(),
      ]);
      setState(() {
        _vehicles = results[0];
        _drivers = results[1];
      });
    } catch (e) {
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _openAddVehicle() async {
    final r = await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => AddVehicleScreen(drivers: _drivers),
      ),
    );
    if (r == true) _load();
  }

  Future<void> _removeVehicle(Map<String, dynamic> v) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('حذف القاطرة؟'),
        content: Text(v['plate_number'] ?? ''),
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
      await _service.removeVehicle(v['id']);
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

  String _vehicleTypeAr(String? t) {
    return {
      'truck_10t': 'شاحنة 10 طن',
      'truck_20t': 'شاحنة 20 طن',
      'tanker': 'صهريج سائب',
      'pickup': 'بيك أب',
    }[t] ?? (t ?? '—');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('قاطراتي'),
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
              : _vehicles.isEmpty
                  ? Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.local_shipping,
                              size: 80,
                              color: AppColors.textSecondary.withOpacity(0.5)),
                          const SizedBox(height: 16),
                          const Text('لا توجد قاطرات',
                              style: TextStyle(
                                  fontSize: 16, color: AppColors.textSecondary)),
                          const SizedBox(height: 8),
                          const Text('أضف قاطراتك لاستخدامها في الطلبات',
                              style: TextStyle(
                                  fontSize: 12, color: AppColors.textSecondary)),
                        ],
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _vehicles.length,
                        itemBuilder: (context, i) {
                          final v = _vehicles[i];
                          return Container(
                            margin: const EdgeInsets.only(bottom: 12),
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(color: AppColors.divider),
                            ),
                            child: Row(
                              children: [
                                Container(
                                  width: 48,
                                  height: 48,
                                  decoration: BoxDecoration(
                                    color: AppColors.accent.withOpacity(0.12),
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  child: const Icon(Icons.local_shipping,
                                      color: AppColors.accent, size: 26),
                                ),
                                const SizedBox(width: 14),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(v['plate_number'] ?? '',
                                          style: const TextStyle(
                                              fontSize: 16,
                                              fontWeight: FontWeight.bold)),
                                      const SizedBox(height: 4),
                                      Text(_vehicleTypeAr(v['vehicle_type']),
                                          style: const TextStyle(
                                              fontSize: 12,
                                              color: AppColors.textSecondary)),
                                      const SizedBox(height: 4),
                                      Row(
                                        children: [
                                          _miniChip(
                                            Icons.scale,
                                            '${v['capacity_tons']} طن',
                                            AppColors.primary,
                                          ),
                                          if (v['driver_name'] != null) ...[
                                            const SizedBox(width: 6),
                                            _miniChip(
                                              Icons.person,
                                              v['driver_name'].toString(),
                                              AppColors.success,
                                            ),
                                          ],
                                        ],
                                      ),
                                    ],
                                  ),
                                ),
                                IconButton(
                                  icon: const Icon(Icons.delete_outline,
                                      color: AppColors.danger),
                                  onPressed: () => _removeVehicle(v),
                                ),
                              ],
                            ),
                          );
                        },
                      ),
                    ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _openAddVehicle,
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add),
        label: const Text('إضافة قاطرة'),
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

// === شاشة إضافة قاطرة ===
class AddVehicleScreen extends StatefulWidget {
  final List<Map<String, dynamic>> drivers;
  const AddVehicleScreen({super.key, required this.drivers});

  @override
  State<AddVehicleScreen> createState() => _AddVehicleScreenState();
}

class _AddVehicleScreenState extends State<AddVehicleScreen> {
  final _service = TraderService();
  final _plateController = TextEditingController();
  final _capacityController = TextEditingController();
  final _bagsController = TextEditingController();

  String _vehicleType = 'truck_10t';
  String? _driverId;
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _plateController.dispose();
    _capacityController.dispose();
    _bagsController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final plate = _plateController.text.trim();
    if (plate.length < 3) {
      setState(() => _error = 'رقم اللوحة قصير جدًا');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await _service.addVehicle(
        plateNumber: plate,
        vehicleType: _vehicleType,
        capacityTons: _capacityController.text.isNotEmpty
            ? double.tryParse(_capacityController.text.trim())
            : null,
        capacityBags: _bagsController.text.isNotEmpty
            ? int.tryParse(_bagsController.text.trim())
            : null,
        currentDriverId: _driverId,
      );
      if (!mounted) return;
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
      appBar: AppBar(title: const Text('إضافة قاطرة')),
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

            const Text('رقم اللوحة *',
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
            const SizedBox(height: 14),

            const Text('عدد الأكياس (اختياري)',
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
            const SizedBox(height: 6),
            TextField(
              controller: _bagsController,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                hintText: '200',
                prefixIcon: Icon(Icons.inventory_2),
              ),
            ),
            const SizedBox(height: 14),

            const Text('السائق الحالي (اختياري)',
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
            const SizedBox(height: 6),
            DropdownButtonFormField<String>(
              value: _driverId,
              decoration: const InputDecoration(
                prefixIcon: Icon(Icons.person),
              ),
              items: [
                const DropdownMenuItem(value: null, child: Text('بدون سائق')),
                ...widget.drivers.map((d) => DropdownMenuItem<String>(
                      value: d['id'] as String,
                      child: Text(d['full_name'] ?? ''),
                    )),
              ],
              onChanged: (v) => setState(() => _driverId = v),
            ),
            const SizedBox(height: 32),

            PrimaryButton(
              text: 'إضافة القاطرة',
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
