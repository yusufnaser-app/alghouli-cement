import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/admin_service.dart';
import 'admin_user_edit_screen.dart';

class AdminUsersScreen extends StatefulWidget {
  const AdminUsersScreen({super.key});
  @override
  State<AdminUsersScreen> createState() => _S();
}

class _S extends State<AdminUsersScreen> {
  final _svc = AdminService();
  final _searchCtrl = TextEditingController();
  List<Map<String, dynamic>> _all = [];
  List<Map<String, dynamic>> _filtered = [];
  bool _loading = true;
  String? _error;
  String _typeFilter = 'ALL';
  String _statusFilter = 'ALL';

  @override
  void initState() {
    super.initState();
    _searchCtrl.addListener(_apply);
    _load();
  }

  @override
  void dispose() { _searchCtrl.dispose(); super.dispose(); }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final list = await _svc.adminUsers();
      if (mounted) setState(() { _all = list; _loading = false; _apply(); });
    } catch (e) {
      if (mounted) setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  void _apply() {
    final q = _searchCtrl.text.trim().toLowerCase();
    setState(() {
      _filtered = _all.where((u) {
        if (_typeFilter != 'ALL' && u['user_type'] != _typeFilter) return false;
        if (_statusFilter != 'ALL' && u['status'] != _statusFilter) return false;
        if (q.isEmpty) return true;
        final n = (u['full_name'] ?? '').toString().toLowerCase();
        final p = (u['phone'] ?? '').toString().toLowerCase();
        return n.contains(q) || p.contains(q);
      }).toList();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('المستخدمون'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
          IconButton(
            icon: const Icon(Icons.person_add),
            onPressed: () async {
              await Navigator.push(context, MaterialPageRoute(
                builder: (_) => const AdminUserEditScreen()));
              _load();
            },
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: TextField(
              controller: _searchCtrl,
              decoration: InputDecoration(
                hintText: 'بحث بالاسم أو الجوال',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _searchCtrl.text.isNotEmpty
                    ? IconButton(icon: const Icon(Icons.close), onPressed: () => _searchCtrl.clear())
                    : null,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
            ),
          ),
          // فلاتر النوع
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Row(children: [
              _chip('ALL', 'الكل'),
              _chip('staff', 'موظفون'),
              _chip('driver', 'سائقون'),
              _chip('customer', 'تجار'),
            ]),
          ),
          const SizedBox(height: 6),
          // فلاتر الحالة
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Row(children: [
              _chipStatus('ALL', 'الكل', AppColors.primary),
              _chipStatus('active', 'نشط', AppColors.success),
              _chipStatus('suspended', 'معلّق', AppColors.warning),
              _chipStatus('inactive', 'غير نشط', AppColors.textSecondary),
              _chipStatus('blocked', 'محظور', AppColors.danger),
            ]),
          ),
          const SizedBox(height: 6),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _error != null
                    ? Center(child: Text(_error!))
                    : _filtered.isEmpty
                        ? const Center(child: Text('لا توجد نتائج'))
                        : RefreshIndicator(
                            onRefresh: _load,
                            child: ListView.builder(
                              padding: const EdgeInsets.all(12),
                              itemCount: _filtered.length,
                              itemBuilder: (_, i) => _userCard(_filtered[i]),
                            ),
                          ),
          ),
        ],
      ),
    );
  }

  Widget _chip(String value, String label) {
    final selected = _typeFilter == value;
    return Padding(
      padding: const EdgeInsets.only(left: 6),
      child: FilterChip(
        label: Text(label, style: TextStyle(color: selected ? Colors.white : null, fontSize: 12)),
        selected: selected,
        onSelected: (_) { setState(() => _typeFilter = value); _apply(); },
        selectedColor: AppColors.primary,
        checkmarkColor: Colors.white,
      ),
    );
  }

  Widget _chipStatus(String value, String label, Color color) {
    final selected = _statusFilter == value;
    return Padding(
      padding: const EdgeInsets.only(left: 6),
      child: FilterChip(
        label: Text(label, style: TextStyle(color: selected ? Colors.white : null, fontSize: 11)),
        selected: selected,
        onSelected: (_) { setState(() => _statusFilter = value); _apply(); },
        selectedColor: color,
        checkmarkColor: Colors.white,
      ),
    );
  }

  Widget _userCard(Map u) {
    final status = (u['status'] ?? 'active').toString();
    final statusColor = {
      'active': AppColors.success,
      'suspended': AppColors.warning,
      'inactive': AppColors.textSecondary,
      'blocked': AppColors.danger,
    }[status] ?? AppColors.textSecondary;
    final roles = (u['roles'] as List?)?.cast<String>() ?? [];

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        onTap: () async {
          await Navigator.push(context, MaterialPageRoute(
            builder: (_) => AdminUserEditScreen(user: u)));
          _load();
        },
        borderRadius: BorderRadius.circular(10),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(children: [
                CircleAvatar(
                  backgroundColor: AppColors.primary.withOpacity(0.1),
                  child: Icon(
                    u['user_type'] == 'staff' ? Icons.badge :
                    u['user_type'] == 'driver' ? Icons.local_shipping :
                    Icons.store,
                    color: AppColors.primary,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(u['full_name']?.toString() ?? '—',
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                    Text(u['phone']?.toString() ?? '—',
                        style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                  ]),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: statusColor.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    {'active':'نشط','suspended':'معلّق','inactive':'غير نشط','blocked':'محظور'}[status] ?? status,
                    style: TextStyle(fontSize: 10, color: statusColor, fontWeight: FontWeight.bold),
                  ),
                ),
              ]),
              if (roles.isNotEmpty) ...[
                const SizedBox(height: 6),
                Wrap(spacing: 4, runSpacing: 4, children: roles.map((r) =>
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: AppColors.primary.withOpacity(0.08),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(r, style: const TextStyle(fontSize: 10, color: AppColors.primary)),
                  )).toList(),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
