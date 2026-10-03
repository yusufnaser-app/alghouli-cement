import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/admin_service.dart';

class AdminSourcesScreen extends StatefulWidget {
  const AdminSourcesScreen({super.key});
  @override
  State<AdminSourcesScreen> createState() => _S();
}

class _S extends State<AdminSourcesScreen> {
  final _svc = AdminService();
  List<Map<String, dynamic>> _list = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final l = await _svc.sources();
      if (mounted) setState(() { _list = l; _loading = false; });
    } catch (e) {
      if (mounted) setState(() { _error = e.toString(); _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('المصانع'), actions: [
        IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
      ]),
      body: _loading ? const Center(child: CircularProgressIndicator())
        : _error != null ? Center(child: Text(_error!))
        : _list.isEmpty ? const Center(child: Text('لا توجد مصانع'))
        : ListView.builder(padding: const EdgeInsets.all(12), itemCount: _list.length,
            itemBuilder: (_, i) {
              final s = _list[i];
              return Card(margin: const EdgeInsets.only(bottom: 8), child: ListTile(
                leading: CircleAvatar(backgroundColor: AppColors.primary.withOpacity(0.1),
                  child: const Icon(Icons.factory, color: AppColors.primary)),
                title: Text(s['name_ar']?.toString() ?? '—', style: const TextStyle(fontWeight: FontWeight.bold)),
                subtitle: Text('${s['code'] ?? ""} • ${s['status'] ?? ""}'),
              ));
            }),
    );
  }
}
