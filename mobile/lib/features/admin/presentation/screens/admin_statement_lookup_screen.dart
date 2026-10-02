import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/admin_service.dart';

class AdminStatementLookupScreen extends StatefulWidget {
  const AdminStatementLookupScreen({super.key});
  @override
  State<AdminStatementLookupScreen> createState() => _S();
}

class _S extends State<AdminStatementLookupScreen> {
  final _svc = AdminService();
  List<Map<String, dynamic>> _customers = [];
  List<Map<String, dynamic>> _filtered = [];
  final _searchCtrl = TextEditingController();
  bool _loading = true;
  String? _error;

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
      final list = await _svc.customers();
      if (mounted) setState(() { _customers = list; _filtered = list; _loading = false; });
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
      _filtered = q.isEmpty ? _customers : _customers.where((c) =>
        (c['full_name'] ?? '').toString().toLowerCase().contains(q) ||
        (c['phone'] ?? '').toString().toLowerCase().contains(q),
      ).toList();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('كشوف الحسابات')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: TextField(
              controller: _searchCtrl,
              decoration: InputDecoration(
                hintText: 'ابحث برقم الجوال أو الاسم',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _searchCtrl.text.isNotEmpty
                    ? IconButton(icon: const Icon(Icons.close), onPressed: () => _searchCtrl.clear())
                    : null,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _error != null
                    ? Center(child: Text(_error!))
                    : _filtered.isEmpty
                        ? const Center(child: Text('لا توجد نتائج'))
                        : ListView.builder(
                            padding: const EdgeInsets.all(12),
                            itemCount: _filtered.length,
                            itemBuilder: (_, i) {
                              final c = _filtered[i];
                              return Card(
                                margin: const EdgeInsets.only(bottom: 8),
                                child: ListTile(
                                  leading: CircleAvatar(
                                    backgroundColor: AppColors.primary.withOpacity(0.1),
                                    child: const Icon(Icons.store, color: AppColors.primary),
                                  ),
                                  title: Text(c['full_name']?.toString() ?? '—'),
                                  subtitle: Text(c['phone']?.toString() ?? '—'),
                                  trailing: Text('${c['current_balance'] ?? 0} ر.ي',
                                      style: const TextStyle(fontWeight: FontWeight.bold)),
                                  onTap: () => _showStatement(c),
                                ),
                              );
                            },
                          ),
          ),
        ],
      ),
    );
  }

  void _showStatement(Map c) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: Text('كشف: ${c['full_name']}'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('الهاتف: ${c['phone']}'),
            const Divider(),
            Text('الرصيد: ${c['current_balance']} ر.ي',
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: AppColors.primary)),
            const SizedBox(height: 12),
            const Text('لعرض التفاصيل الكاملة استخدم الويب', style: TextStyle(fontSize: 11, color: AppColors.textSecondary)),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('إغلاق')),
        ],
      ),
    );
  }
}
