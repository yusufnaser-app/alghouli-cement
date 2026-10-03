import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/admin_service.dart';

class AdminVehiclesScreen extends StatefulWidget {
  const AdminVehiclesScreen({super.key});
  @override
  State<AdminVehiclesScreen> createState() => _S();
}

class _S extends State<AdminVehiclesScreen> {
  final _svc = AdminService();
  List<Map<String, dynamic>> _list = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final l = await _svc.vehicles();
      if (mounted) setState(() { _list = l; _loading = false; });
    } catch (e) {
      if (mounted) setState(() { _error = e.toString().replaceFirst('Exception: ', ''); _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('المركبات'), actions: [
        IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
      ]),
      body: _loading ? const Center(child: CircularProgressIndicator())
        : _error != null ? Center(child: Text(_error!))
        : _list.isEmpty ? const Center(child: Text('لا توجد مركبات'))
        : ListView.builder(padding: const EdgeInsets.all(12), itemCount: _list.length,
            itemBuilder: (_, i) {
              final v = _list[i];
              return Card(margin: const EdgeInsets.only(bottom: 8), child: ListTile(
                leading: CircleAvatar(backgroundColor: AppColors.info.withOpacity(0.1),
                  child: const Icon(Icons.local_shipping, color: AppColors.info)),
                title: Text(v['plate_number']?.toString() ?? '—', style: const TextStyle(fontWeight: FontWeight.bold)),
                subtitle: Text('${v['vehicle_type'] ?? ""} • ${v['capacity_tons'] ?? 0} طن'),
                trailing: Chip(label: Text(v['operating_status']?.toString() ?? '—',
                  style: const TextStyle(fontSize: 10, color: Colors.white)),
                  backgroundColor: AppColors.primary),
              ));
            }),
    );
  }
}
