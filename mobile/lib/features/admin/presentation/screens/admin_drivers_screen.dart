import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/admin_service.dart';

class AdminDriversScreen extends StatefulWidget {
  const AdminDriversScreen({super.key});
  @override
  State<AdminDriversScreen> createState() => _S();
}

class _S extends State<AdminDriversScreen> {
  final _svc = AdminService();
  List<Map<String, dynamic>> _list = [];
  bool _loading = true;
  String? _err;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() { _loading = true; _err = null; });
    try {
      final l = await _svc.drivers();
      if (mounted) setState(() { _list = l; _loading = false; });
    } catch (e) {
      if (mounted) setState(() { _err = e.toString(); _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('السائقون'), actions: [
        IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
      ]),
      body: _loading ? const Center(child: CircularProgressIndicator())
        : _err != null ? Center(child: Text(_err!))
        : _list.isEmpty ? const Center(child: Text('لا يوجد سائقون'))
        : ListView.builder(
            padding: const EdgeInsets.all(12),
            itemCount: _list.length,
            itemBuilder: (_, i) {
              final d = _list[i];
              return Card(margin: const EdgeInsets.only(bottom: 8), child: ListTile(
                leading: CircleAvatar(backgroundColor: AppColors.info.withOpacity(0.1),
                  child: const Icon(Icons.person, color: AppColors.info)),
                title: Text(d['full_name']?.toString() ?? '—'),
                subtitle: Text(d['phone']?.toString() ?? '—'),
                trailing: Text('${d['current_balance'] ?? 0} ر.ي',
                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
              ));
            },
          ),
    );
  }
}
