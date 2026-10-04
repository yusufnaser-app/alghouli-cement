import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/admin_service.dart';
import '../widgets/admin_async_view.dart';

/// إدارة المنتجات: بحث + فلاتر (مصنع/تصنيف/تعبئة) + إضافة/تعديل/حذف
class AdminProductsScreen extends StatefulWidget {
  const AdminProductsScreen({super.key});
  @override
  State<AdminProductsScreen> createState() => _S();
}

class _S extends State<AdminProductsScreen> {
  final _service = AdminService();
  List<Map<String, dynamic>> _list = [];
  List<Map<String, dynamic>> _sources = [];
  List<Map<String, dynamic>> _cats = [];
  final _search = TextEditingController();
  String? _fSource, _fCat, _fPack;
  bool _loading = true;
  String? _error;

  @override
  void initState() { super.initState(); _search.addListener(() => setState(() {})); _load(); }

  @override
  void dispose() { _search.dispose(); super.dispose(); }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final r = await Future.wait([_service.productsList(), _service.sources(), _service.categoriesList()]);
      if (mounted) setState(() { _list = r[0]; _sources = r[1]; _cats = r[2]; _loading = false; });
    } catch (e) {
      if (mounted) setState(() { _error = e.toString().replaceFirst('Exception: ', ''); _loading = false; });
    }
  }

  List<Map<String, dynamic>> get _filtered {
    final q = _search.text.trim().toLowerCase();
    return _list.where((p) {
      if (q.isNotEmpty && !(p['name_ar'] ?? '').toString().toLowerCase().contains(q)) return false;
      if (_fSource != null && p['source_id']?.toString() != _fSource) return false;
      if (_fCat != null && p['category_code']?.toString() != _fCat) return false;
      if (_fPack != null && p['packaging_type']?.toString() != _fPack) return false;
      return true;
    }).toList();
  }

  void _snack(String m, Color c) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m), backgroundColor: c));

  String _statusAr(String? s) =>
      {'available': 'متاح', 'unavailable': 'غير متاح', 'suspended': 'موقوف'}[s] ?? (s ?? '—');

  Future<void> _form([Map<String, dynamic>? p]) async {
    final editing = p != null;
    final name = TextEditingController(text: p?['name_ar']?.toString() ?? '');
    final grade = TextEditingController(text: p?['grade']?.toString() ?? '');
    final bagKg = TextEditingController(text: (p?['bag_weight_kg'] ?? 50).toString());
    final minQty = TextEditingController(text: (p?['min_order_qty'] ?? 10).toString());
    final initQty = TextEditingController();
    String? sourceId = p?['source_id']?.toString();
    String? catId;
    if (p != null) {
      for (final c in _cats) {
        if (c['code']?.toString() == p['category_code']?.toString()) catId = c['id'].toString();
      }
    }
    String pack = p?['packaging_type']?.toString() ?? 'bagged';
    String status = p?['status']?.toString() ?? 'available';

    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Directionality(
        textDirection: TextDirection.rtl,
        child: StatefulBuilder(builder: (ctx, setS) => Padding(
          padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + MediaQuery.of(ctx).viewInsets.bottom),
          child: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Text(editing ? 'تعديل منتج' : 'إضافة منتج',
                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
              TextField(controller: name, decoration: const InputDecoration(labelText: 'اسم المنتج *')),
              DropdownButtonFormField<String>(
                value: sourceId, isExpanded: true,
                decoration: const InputDecoration(labelText: 'المصنع *'),
                items: [for (final s in _sources)
                  DropdownMenuItem(value: s['id'].toString(), child: Text('${s['name_ar']}'))],
                onChanged: (v) => setS(() => sourceId = v),
              ),
              DropdownButtonFormField<String>(
                value: catId, isExpanded: true,
                decoration: const InputDecoration(labelText: 'التصنيف *'),
                items: [for (final c in _cats)
                  DropdownMenuItem(value: c['id'].toString(), child: Text('${c['name_ar']}'))],
                onChanged: (v) => setS(() => catId = v),
              ),
              TextField(controller: grade, decoration: const InputDecoration(labelText: 'الدرجة (مثال 42.5)')),
              Row(children: [
                Expanded(child: RadioListTile<String>(
                  value: 'bagged', groupValue: pack, title: const Text('أكياس'),
                  onChanged: (v) => setS(() => pack = v!))),
                Expanded(child: RadioListTile<String>(
                  value: 'bulk', groupValue: pack, title: const Text('صب'),
                  onChanged: (v) => setS(() => pack = v!))),
              ]),
              if (pack == 'bagged')
                TextField(controller: bagKg, keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: 'وزن الكيس (كجم)')),
              TextField(controller: minQty, keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'أقل كمية للطلب')),
              DropdownButtonFormField<String>(
                value: status,
                decoration: const InputDecoration(labelText: 'الحالة'),
                items: const [
                  DropdownMenuItem(value: 'available', child: Text('متاح')),
                  DropdownMenuItem(value: 'unavailable', child: Text('غير متاح')),
                  DropdownMenuItem(value: 'suspended', child: Text('موقوف')),
                ],
                onChanged: (v) => setS(() => status = v ?? 'available'),
              ),
              if (!editing)
                TextField(controller: initQty, keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: 'الكمية الابتدائية في المخزون')),
              const SizedBox(height: 14),
              Row(children: [
                Expanded(child: OutlinedButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('إلغاء'))),
                const SizedBox(width: 8),
                Expanded(child: ElevatedButton(
                  style: ElevatedButton.styleFrom(backgroundColor: AppColors.brandRed, foregroundColor: Colors.white),
                  onPressed: () {
                    if (name.text.trim().length < 3 || sourceId == null || catId == null) {
                      _snack('أدخل الاسم (3 أحرف على الأقل) واختر المصنع والتصنيف', AppColors.danger);
                      return;
                    }
                    Navigator.pop(ctx, true);
                  },
                  child: const Text('حفظ'),
                )),
              ]),
            ]),
          ),
        )),
      ),
    );
    if (saved != true) return;
    final body = <String, dynamic>{
      'nameAr': name.text.trim(),
      'sourceId': sourceId,
      'categoryId': catId,
      'packagingType': pack,
      'status': status,
      if (grade.text.trim().isNotEmpty) 'grade': grade.text.trim(),
      if (pack == 'bagged' && double.tryParse(bagKg.text) != null) 'bagWeightKg': double.parse(bagKg.text),
      if (int.tryParse(minQty.text) != null) 'minOrderQty': int.parse(minQty.text),
      if (!editing && double.tryParse(initQty.text) != null) 'initialQty': double.parse(initQty.text),
    };
    try {
      if (editing) {
        await _service.productUpdate(p['id'].toString(), body);
      } else {
        await _service.productCreate(body);
      }
      if (mounted) { _snack('تم الحفظ', AppColors.success); _load(); }
    } catch (e) {
      if (mounted) _snack(e.toString().replaceFirst('Exception: ', ''), AppColors.danger);
    }
  }

  Future<void> _delete(Map<String, dynamic> p) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('حذف المنتج'),
        content: Text('حذف "${p['name_ar']}"؟'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('إلغاء')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('حذف')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await _service.productDelete(p['id'].toString());
      if (mounted) { _snack('تم الحذف', AppColors.success); _load(); }
    } catch (e) {
      if (mounted) _snack(e.toString().replaceFirst('Exception: ', ''), AppColors.danger);
    }
  }

  @override
  Widget build(BuildContext context) {
    final items = _filtered;
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        appBar: AppBar(title: const Text('المنتجات'),
            actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: _load)]),
        floatingActionButton: FloatingActionButton.extended(
          backgroundColor: AppColors.brandRed, foregroundColor: Colors.white,
          onPressed: _loading ? null : () => _form(),
          icon: const Icon(Icons.add), label: const Text('إضافة منتج'),
        ),
        body: Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
            child: TextField(
              controller: _search,
              decoration: InputDecoration(hintText: 'بحث بالاسم', prefixIcon: const Icon(Icons.search),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12))),
            ),
          ),
          SizedBox(
            height: 46,
            child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 12), children: [
              _filterMenu('المصنع', _fSource, {for (final s in _sources) s['id'].toString(): '${s['name_ar']}'},
                  (v) => setState(() => _fSource = v)),
              _filterMenu('التصنيف', _fCat, {for (final c in _cats) c['code'].toString(): '${c['name_ar']}'},
                  (v) => setState(() => _fCat = v)),
              _filterMenu('التعبئة', _fPack, const {'bagged': 'أكياس', 'bulk': 'صب'},
                  (v) => setState(() => _fPack = v)),
            ]),
          ),
          Expanded(
            child: AdminAsyncView(
              loading: _loading, error: _error, isEmpty: items.isEmpty,
              emptyText: 'لا توجد منتجات', onRetry: _load,
              builder: () => RefreshIndicator(
                onRefresh: _load,
                child: ListView.builder(
                  padding: const EdgeInsets.fromLTRB(12, 8, 12, 90),
                  itemCount: items.length,
                  itemBuilder: (_, i) {
                    final p = items[i];
                    final price = p['default_price'] ?? p['price'];
                    return Card(
                      child: ListTile(
                        title: Text('${p['name_ar'] ?? '—'}', style: const TextStyle(fontWeight: FontWeight.bold)),
                        subtitle: Text('${p['source_name'] ?? ''} • ${p['category_name'] ?? ''} • '
                            '${p['packaging_type'] == 'bulk' ? 'صب' : 'أكياس'}\n'
                            '${_statusAr(p['status']?.toString())}'
                            '${price != null ? ' • السعر: $price' : ''}'),
                        isThreeLine: true,
                        trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                          IconButton(icon: const Icon(Icons.edit, color: AppColors.primary), onPressed: () => _form(p)),
                          IconButton(icon: const Icon(Icons.delete, color: AppColors.danger), onPressed: () => _delete(p)),
                        ]),
                      ),
                    );
                  },
                ),
              ),
            ),
          ),
        ]),
      ),
    );
  }

  Widget _filterMenu(String label, String? value, Map<String, String> opts, void Function(String?) on) {
    return Padding(
      padding: const EdgeInsetsDirectional.only(end: 8),
      child: PopupMenuButton<String>(
        onSelected: (v) => on(v == '__all' ? null : v),
        itemBuilder: (_) => [
          const PopupMenuItem(value: '__all', child: Text('الكل')),
          for (final e in opts.entries) PopupMenuItem(value: e.key, child: Text(e.value)),
        ],
        child: Chip(
          label: Text(value == null ? label : '$label: ${opts[value] ?? ''}'),
          backgroundColor: value == null ? null : AppColors.lightBlue,
        ),
      ),
    );
  }
}
