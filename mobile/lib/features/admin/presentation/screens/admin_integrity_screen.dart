import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/admin_service.dart';

class AdminIntegrityScreen extends StatefulWidget {
  const AdminIntegrityScreen({super.key});
  @override
  State<AdminIntegrityScreen> createState() => _S();
}

class _S extends State<AdminIntegrityScreen> {
  final _svc = AdminService();
  Map<String, dynamic>? _data;
  bool _loading = true;
  String? _err;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() { _loading = true; _err = null; });
    try {
      final d = await _svc.integrityCheck();
      if (mounted) setState(() { _data = d; _loading = false; });
    } catch (e) {
      if (mounted) setState(() { _err = e.toString(); _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('فحص النزاهة'), actions: [
        IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
      ]),
      body: _loading ? const Center(child: CircularProgressIndicator())
        : _err != null ? Center(child: Text(_err!))
        : Padding(padding: const EdgeInsets.all(16), child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Card(color: _data?['ok'] == true ? AppColors.success : AppColors.danger,
                child: Padding(padding: const EdgeInsets.all(20), child: Column(children: [
                  Icon(_data?['ok'] == true ? Icons.verified : Icons.error,
                    color: Colors.white, size: 50),
                  const SizedBox(height: 8),
                  Text(_data?['ok'] == true ? 'النظام سليم' : 'يوجد مشاكل',
                    style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                ]))),
              const SizedBox(height: 16),
              if (_data?['counts'] != null) ...[
                const Text('الإحصائيات', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                const SizedBox(height: 8),
                ...(_data!['counts'] as Map).entries.map((e) =>
                  ListTile(title: Text(e.key.toString()), trailing: Text(e.value.toString()))),
              ],
            ],
          )),
    );
  }
}
