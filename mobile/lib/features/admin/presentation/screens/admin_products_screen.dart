import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/network/api_client.dart';

class AdminProductsScreen extends StatefulWidget {
  const AdminProductsScreen({super.key});
  @override
  State<AdminProductsScreen> createState() => _S();
}

class _S extends State<AdminProductsScreen> {
  List<Map<String, dynamic>> _list = [];
  List<Map<String, dynamic>> _filtered = [];
  final _searchCtrl = TextEditingController();
  bool _loading = true;
  String? _error;

  @override
  void initState() { super.initState(); _searchCtrl.addListener(_apply); _load(); }

  @override
  void dispose() { _searchCtrl.dispose(); super.dispose(); }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final api = ApiClient();
      final res = await api.get('/products');
      final list = ((res.data['data'] as List?) ?? []).cast<Map<String, dynamic>>();
      if (mounted) setState(() { _list = list; _filtered = list; _loading = false; });
    } catch (e) {
      if (mounted) setState(() { _error = e.toString().replaceFirst('Exception: ', ''); _loading = false; });
    }
  }

  void _apply() {
    final q = _searchCtrl.text.trim().toLowerCase();
    setState(() {
      _filtered = q.isEmpty ? _list : _list.where((p) =>
        (p['name_ar'] ?? '').toString().toLowerCase().contains(q)).toList();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('المنتجات'), actions: [
        IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
      ]),
      body: Column(children: [
        Padding(padding: const EdgeInsets.all(12), child: TextField(
          controller: _searchCtrl,
          decoration: InputDecoration(hintText: 'بحث', prefixIcon: const Icon(Icons.search),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12))),
        )),
        Expanded(child: _loading ? const Center(child: CircularProgressIndicator())
          : _error != null ? Center(child: Text(_error!))
          : _filtered.isEmpty ? const Center(child: Text('لا توجد منتجات'))
          : ListView.builder(padding: const EdgeInsets.all(12), itemCount: _filtered.length,
              itemBuilder: (_, i) {
                final p = _filtered[i];
                return Card(margin: const EdgeInsets.only(bottom: 8), child: ListTile(
                  leading: CircleAvatar(backgroundColor: AppColors.info.withOpacity(0.1),
                    child: const Icon(Icons.inventory_2, color: AppColors.info)),
                  title: Text(p['name_ar']?.toString() ?? '—', style: const TextStyle(fontWeight: FontWeight.bold)),
                  subtitle: Text('${p['code'] ?? ""} • ${p['unit'] ?? ""}'),
                  trailing: Text('${p['default_price'] ?? 0} ر.ي',
                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                ));
              }),
        ),
      ]),
    );
  }
}
