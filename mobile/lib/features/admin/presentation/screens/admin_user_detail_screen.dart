import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/admin_service.dart';

class AdminUserDetailScreen extends StatefulWidget {
  final String userId;
  final String userName;
  const AdminUserDetailScreen({super.key, required this.userId, required this.userName});
  @override
  State<AdminUserDetailScreen> createState() => _S();
}

class _S extends State<AdminUserDetailScreen> {
  final _svc = AdminService();
  Map<String, dynamic>? _data;
  bool _loading = true;
  String? _error;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final d = await _svc.userDetails(widget.userId);
      if (mounted) setState(() { _data = d; _loading = false; });
    } catch (e) {
      if (mounted) setState(() { _error = e.toString(); _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.userName), actions: [
        IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
      ]),
      body: _loading ? const Center(child: CircularProgressIndicator())
        : _error != null ? Center(child: Text(_error!))
        : ListView(padding: const EdgeInsets.all(12), children: [
            _userCard(),
            const SizedBox(height: 16),
            _sectionTitle('سجل التدقيق'),
            ..._auditLog(),
          ]),
    );
  }

  Widget _userCard() {
    final u = _data!['user'] as Map;
    final roles = (u['roles'] as List?)?.cast<String>() ?? [];
    return Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(u['full_name']?.toString() ?? '—', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
        const SizedBox(height: 4),
        Text(u['phone']?.toString() ?? '—', style: const TextStyle(color: AppColors.textSecondary)),
        const Divider(),
        _row('النوع', u['user_type']?.toString() ?? '—'),
        _row('الحالة', u['status']?.toString() ?? '—'),
        _row('حالة الحساب', u['account_status']?.toString() ?? '—'),
        _row('آخر دخول', (u['last_login_at'] ?? '—').toString().split('T').first),
        const SizedBox(height: 8),
        Wrap(spacing: 4, children: roles.map((r) => Chip(label: Text(r))).toList()),
      ],
    )));
  }

  Widget _row(String l, String v) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 4),
    child: Row(children: [
      Expanded(child: Text(l, style: const TextStyle(color: AppColors.textSecondary, fontSize: 13))),
      Expanded(child: Text(v, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13))),
    ]),
  );

  Widget _sectionTitle(String t) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 8),
    child: Text(t, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppColors.primary)),
  );

  List<Widget> _auditLog() {
    final logs = (_data!['audit_log'] as List?) ?? [];
    if (logs.isEmpty) return [const Text('لا يوجد سجل')];
    return logs.map((l) {
      final action = l['action']?.toString() ?? '—';
      final color = action.contains('CREATE') ? AppColors.success
        : action.contains('DELETE') || action.contains('DISABLE') ? AppColors.danger
        : AppColors.info;
      return Card(child: ListTile(
        leading: CircleAvatar(backgroundColor: color.withOpacity(0.1), child: Icon(Icons.history, color: color, size: 18)),
        title: Text(action, style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: color)),
        subtitle: Text((l['created_at'] ?? '').toString().split('.').first.replaceAll('T', ' '), style: const TextStyle(fontSize: 11)),
      ));
    }).toList();
  }
}
