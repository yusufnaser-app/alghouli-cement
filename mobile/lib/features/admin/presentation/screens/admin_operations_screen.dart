import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/admin_service.dart';

class AdminOperationsScreen extends StatefulWidget {
  const AdminOperationsScreen({super.key});
  @override
  State<AdminOperationsScreen> createState() => _S();
}

class _S extends State<AdminOperationsScreen> {
  final _svc = AdminService();
  Map<String, dynamic>? _data;
  bool _loading = true;
  String? _err;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() { _loading = true; _err = null; });
    try {
      final d = await _svc.operationsCenter();
      if (mounted) setState(() { _data = d; _loading = false; });
    } catch (e) {
      if (mounted) setState(() { _err = e.toString(); _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('مركز العمليات'), actions: [
        IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
      ]),
      body: _loading ? const Center(child: CircularProgressIndicator())
        : _err != null ? Center(child: Text(_err!))
        : ListView(padding: const EdgeInsets.all(16), children: [
            if (_data is Map)
              ..._data!.entries.map((e) => Card(
                child: ListTile(
                  title: Text(e.key.toString()),
                  trailing: Text(e.value.toString(),
                    style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.primary)),
                ),
              )),
          ]),
    );
  }
}
