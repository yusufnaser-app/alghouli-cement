import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/admin_service.dart';

class AdminSettingsScreen extends StatefulWidget {
  const AdminSettingsScreen({super.key});
  @override
  State<AdminSettingsScreen> createState() => _S();
}

class _S extends State<AdminSettingsScreen> {
  final _svc = AdminService();
  List<Map<String, dynamic>> _settings = [];
  final Map<String, TextEditingController> _ctrls = {};
  bool _loading = true;
  bool _saving = false;
  String? _error;

  @override
  void initState() { super.initState(); _load(); }

  @override
  void dispose() {
    for (final c in _ctrls.values) { c.dispose(); }
    super.dispose();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final list = await _svc.settingsList();
      if (mounted) setState(() {
        _settings = list;
        for (final s in list) {
          final k = s['key'].toString();
          _ctrls.putIfAbsent(k, () => TextEditingController(text: s['value']?.toString() ?? ''));
        }
        _loading = false;
      });
    } catch (e) {
      if (mounted) setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  Future<void> _save() async {
    setState(() { _saving = true; _error = null; });
    try {
      final items = _settings.map((s) => {
        'key': s['key'],
        'value': _ctrls[s['key'].toString()]!.text,
        'groupName': s['group_name'] ?? 'general',
      }).toList();
      await _svc.updateSettings(items);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('✅ تم الحفظ'), backgroundColor: AppColors.success),
        );
        setState(() => _saving = false);
      }
    } catch (e) {
      if (mounted) setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _saving = false;
      });
    }
  }

  Map<String, List<Map<String, dynamic>>> _grouped() {
    final m = <String, List<Map<String, dynamic>>>{};
    for (final s in _settings) {
      final g = (s['group_name'] ?? 'general').toString();
      m.putIfAbsent(g, () => []).add(s);
    }
    return m;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('الإعدادات'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
          if (!_loading && _settings.isNotEmpty)
            IconButton(icon: const Icon(Icons.save), onPressed: _saving ? null : _save),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : _settings.isEmpty
                  ? const Center(child: Text('لا توجد إعدادات'))
                  : ListView(
                      padding: const EdgeInsets.all(12),
                      children: _grouped().entries.expand((e) => [
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          child: Text(e.key, style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.primary)),
                        ),
                        ...e.value.map((s) => Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: TextField(
                            controller: _ctrls[s['key'].toString()],
                            decoration: InputDecoration(
                              labelText: s['key'].toString(),
                              border: const OutlineInputBorder(),
                            ),
                          ),
                        )),
                        const SizedBox(height: 12),
                      ]).toList(),
                    ),
    );
  }
}
