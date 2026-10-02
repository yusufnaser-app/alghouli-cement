import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/admin_service.dart';
import 'admin_create_fax_screen.dart';

class AdminFaxesScreen extends StatefulWidget {
  const AdminFaxesScreen({super.key});
  @override
  State<AdminFaxesScreen> createState() => _State();
}

class _State extends State<AdminFaxesScreen> {
  final _service = AdminService();
  List<Map<String, dynamic>> _all = [];
  List<Map<String, dynamic>> _filtered = [];
  bool _loading = true;
  String? _error;
  String _status = 'ALL';
  final _searchCtrl = TextEditingController();

  static const _statuses = [
    {'key': 'ALL', 'label': 'الكل', 'color': AppColors.primary},
    {'key': 'REQUESTED', 'label': 'بانتظار الاعتماد', 'color': AppColors.warning},
    {'key': 'APPROVED', 'label': 'معتمد', 'color': AppColors.info},
    {'key': 'ISSUED', 'label': 'صادر', 'color': AppColors.accent},
    {'key': 'USED', 'label': 'مُحمَّل', 'color': AppColors.success},
    {'key': 'READY_FOR_TRANSIT', 'label': 'في الطريق', 'color': AppColors.primary},
    {'key': 'CANCELLED', 'label': 'ملغي', 'color': AppColors.danger},
  ];

  @override
  void initState() {
    super.initState();
    _load();
    _searchCtrl.addListener(_applyFilter);
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final list = await _service.faxes();
      if (mounted) {
        setState(() { _all = list; _loading = false; _applyFilter(); });
      }
    } catch (e) {
      if (mounted) setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  void _applyFilter() {
    final q = _searchCtrl.text.trim().toLowerCase();
    setState(() {
      _filtered = _all.where((f) {
        if (_status != 'ALL' && f['status'] != _status) return false;
        if (q.isEmpty) return true;
        final n = (f['fax_number'] ?? '').toString().toLowerCase();
        final d = (f['driver_name'] ?? '').toString().toLowerCase();
        final o = (f['order_number'] ?? '').toString().toLowerCase();
        return n.contains(q) || d.contains(q) || o.contains(q);
      }).toList();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('الفاكسات'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: () async {
              await Navigator.push(context, MaterialPageRoute(builder: (_) => const AdminCreateFaxScreen()));
              _load();
            },
          ),
        ],
      ),
      body: Column(
        children: [
          // بحث
          Padding(
            padding: const EdgeInsets.all(12),
            child: TextField(
              controller: _searchCtrl,
              decoration: InputDecoration(
                hintText: 'بحث برقم الفاكس أو السائق أو الطلب',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _searchCtrl.text.isNotEmpty
                    ? IconButton(icon: const Icon(Icons.close), onPressed: () => _searchCtrl.clear())
                    : null,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
            ),
          ),
          // تبويبات الحالة
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Row(
              children: _statuses.map((s) {
                final selected = _status == s['key'];
                return Padding(
                  padding: const EdgeInsets.only(left: 6),
                  child: FilterChip(
                    label: Text(s['label'] as String, style: TextStyle(
                      color: selected ? Colors.white : null, fontSize: 12)),
                    selected: selected,
                    onSelected: (_) { setState(() => _status = s['key'] as String); _applyFilter(); },
                    selectedColor: s['color'] as Color,
                    checkmarkColor: Colors.white,
                  ),
                );
              }).toList(),
            ),
          ),
          const SizedBox(height: 8),
          // قائمة
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _error != null
                    ? Center(child: Text(_error!))
                    : _filtered.isEmpty
                        ? const Center(child: Text('لا توجد فاكسات'))
                        : RefreshIndicator(
                            onRefresh: _load,
                            child: ListView.builder(
                              padding: const EdgeInsets.all(12),
                              itemCount: _filtered.length,
                              itemBuilder: (_, i) => _faxCard(_filtered[i]),
                            ),
                          ),
          ),
        ],
      ),
    );
  }

  Widget _faxCard(Map<String, dynamic> f) {
    final status = (f['status'] ?? '').toString();
    final st = _statuses.firstWhere((s) => s['key'] == status,
        orElse: () => {'label': status, 'color': AppColors.textSecondary});
    final color = st['color'] as Color;

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    f['fax_number']?.toString() ?? f['order_number']?.toString() ?? '—',
                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                  ),
                ),
                Chip(
                  label: Text(st['label'] as String,
                      style: const TextStyle(color: Colors.white, fontSize: 11)),
                  backgroundColor: color,
                ),
              ],
            ),
            const SizedBox(height: 8),
            Wrap(spacing: 12, runSpacing: 4, children: [
              if (f['driver_name'] != null) _info(Icons.person, f['driver_name'].toString()),
              if (f['plate_number'] != null) _info(Icons.local_shipping, f['plate_number'].toString()),
              if (f['factory_name'] != null) _info(Icons.factory, f['factory_name'].toString()),
              if (f['requested_quantity'] != null) _info(Icons.inventory_2, '${f['requested_quantity']} كيس'),
              if (f['route'] != null) _info(Icons.route, f['route'].toString()),
            ]),
            const SizedBox(height: 10),
            Wrap(spacing: 8, children: _actions(f)),
          ],
        ),
      ),
    );
  }

  List<Widget> _actions(Map<String, dynamic> f) {
    final id = f['id'].toString();
    final status = (f['status'] ?? '').toString();
    final actions = <Widget>[];

    if (status == 'REQUESTED') {
      actions.add(_btn('اعتماد', AppColors.info, () async {
        await _service.approveFax(id); _load();
      }));
    }
    if (status == 'APPROVED' || status == 'REQUESTED') {
      actions.add(_btn('إصدار + إشعار', AppColors.accent, () async {
        final num = await _askFaxNumber();
        if (num != null) { await _service.issueAndNotify(id, num); _load(); }
      }));
    }
    if (status != 'CANCELLED' && status != 'USED' && status != 'READY_FOR_TRANSIT') {
      actions.add(_btn('إلغاء', AppColors.danger, () async {
        final ok = await _confirm('إلغاء الفاكس؟');
        if (ok) { await _service.cancelFax(id); _load(); }
      }));
    }

    return actions;
  }

  Widget _btn(String text, Color color, VoidCallback onTap) {
    return ElevatedButton(
      onPressed: onTap,
      style: ElevatedButton.styleFrom(
        backgroundColor: color,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        minimumSize: const Size(0, 34),
        textStyle: const TextStyle(fontSize: 12),
      ),
      child: Text(text),
    );
  }

  Widget _info(IconData icon, String text) {
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(icon, size: 13, color: AppColors.textSecondary),
      const SizedBox(width: 3),
      Text(text, style: const TextStyle(fontSize: 12)),
    ]);
  }

  Future<String?> _askFaxNumber() async {
    final ctrl = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('رقم الفاكس'),
        content: TextField(controller: ctrl, decoration: const InputDecoration(hintText: 'FAX-2026-00001')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('إلغاء')),
          TextButton(onPressed: () => Navigator.pop(context, ctrl.text.trim()), child: const Text('إصدار')),
        ],
      ),
    );
  }

  Future<bool> _confirm(String msg) async {
    return await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: Text(msg),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('لا')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('نعم')),
        ],
      ),
    ) ?? false;
  }
}
