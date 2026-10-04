import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/admin_service.dart';
import '../widgets/admin_async_view.dart';

Color _hex(String? h) {
  final s = (h ?? '').replaceAll('#', '');
  final v = int.tryParse(s.length == 6 ? 'FF$s' : s, radix: 16);
  return v == null ? AppColors.textSecondary : Color(v);
}

/// إدارة أنواع/تصنيفات الأسمنت
class AdminCategoriesScreen extends StatefulWidget {
  const AdminCategoriesScreen({super.key});
  @override
  State<AdminCategoriesScreen> createState() => _CatState();
}

class _CatState extends State<AdminCategoriesScreen> {
  final _service = AdminService();
  List<Map<String, dynamic>> _list = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final l = await _service.categoriesList();
      if (mounted) setState(() { _list = l; _loading = false; });
    } catch (e) {
      if (mounted) setState(() { _error = e.toString().replaceFirst('Exception: ', ''); _loading = false; });
    }
  }

  void _snack(String m, Color c) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m), backgroundColor: c));

  Future<void> _form([Map<String, dynamic>? c]) async {
    final name = TextEditingController(text: c?['name_ar']?.toString() ?? '');
    final code = TextEditingController(text: c?['code']?.toString() ?? '');
    final color = TextEditingController(text: c?['color_code']?.toString() ?? '');
    final colorName = TextEditingController(text: c?['color_name_ar']?.toString() ?? '');
    final editing = c != null;
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Directionality(
        textDirection: TextDirection.rtl,
        child: Padding(
          padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + MediaQuery.of(ctx).viewInsets.bottom),
          child: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Text(editing ? 'تعديل تصنيف' : 'إضافة تصنيف',
                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
              TextField(controller: name, decoration: const InputDecoration(labelText: 'الاسم بالعربية *')),
              // الكود مطلوب في قاعدة البيانات (UNIQUE NOT NULL)
              TextField(controller: code, enabled: !editing,
                  decoration: const InputDecoration(labelText: 'الكود (إنجليزي، فريد) *')),
              TextField(controller: color,
                  decoration: const InputDecoration(labelText: 'رمز اللون * مثال: #FF5722')),
              TextField(controller: colorName, decoration: const InputDecoration(labelText: 'اسم اللون بالعربية *')),
              const SizedBox(height: 14),
              Row(children: [
                Expanded(child: OutlinedButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('إلغاء'))),
                const SizedBox(width: 8),
                Expanded(child: ElevatedButton(
                  style: ElevatedButton.styleFrom(backgroundColor: AppColors.brandRed, foregroundColor: Colors.white),
                  onPressed: () {
                    final okHex = RegExp(r'^#[0-9A-Fa-f]{6}$').hasMatch(color.text.trim());
                    if (name.text.trim().length < 2 || (!editing && code.text.trim().isEmpty) ||
                        !okHex || colorName.text.trim().isEmpty) {
                      _snack('أكمل الحقول المطلوبة (اللون بصيغة #RRGGBB)', AppColors.danger);
                      return;
                    }
                    Navigator.pop(ctx, true);
                  },
                  child: const Text('حفظ'),
                )),
              ]),
            ]),
          ),
        ),
      ),
    );
    if (saved != true) return;
    try {
      final body = <String, dynamic>{
        'nameAr': name.text.trim(),
        'colorCode': color.text.trim(),
        'colorNameAr': colorName.text.trim(),
      };
      if (editing) {
        await _service.categoryUpdate(c['id'].toString(), body);
      } else {
        await _service.categoryCreate({...body, 'code': code.text.trim().toLowerCase()});
      }
      if (mounted) { _snack('تم الحفظ', AppColors.success); _load(); }
    } catch (e) {
      if (mounted) _snack(e.toString().replaceFirst('Exception: ', ''), AppColors.danger);
    }
  }

  Future<void> _delete(Map<String, dynamic> c) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('حذف التصنيف'),
        content: Text('حذف "${c['name_ar']}"؟'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('إلغاء')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('حذف')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await _service.categoryDelete(c['id'].toString());
      if (mounted) { _snack('تم الحذف', AppColors.success); _load(); }
    } catch (e) {
      if (mounted) _snack(e.toString().replaceFirst('Exception: ', ''), AppColors.danger);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        appBar: AppBar(title: const Text('التصنيفات'),
            actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: _load)]),
        floatingActionButton: FloatingActionButton.extended(
          backgroundColor: AppColors.brandRed, foregroundColor: Colors.white,
          onPressed: () => _form(), icon: const Icon(Icons.add), label: const Text('إضافة تصنيف'),
        ),
        body: AdminAsyncView(
          loading: _loading, error: _error, isEmpty: _list.isEmpty,
          emptyText: 'لا توجد تصنيفات', onRetry: _load,
          builder: () => RefreshIndicator(
            onRefresh: _load,
            child: ListView.builder(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 90),
              itemCount: _list.length,
              itemBuilder: (_, i) {
                final c = _list[i];
                return Card(
                  child: ListTile(
                    leading: CircleAvatar(backgroundColor: _hex(c['color_code']?.toString())),
                    title: Text('${c['name_ar'] ?? '—'}', style: const TextStyle(fontWeight: FontWeight.bold)),
                    subtitle: Text('${c['color_name_ar'] ?? ''}  ${c['color_code'] ?? ''}'),
                    trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                      IconButton(icon: const Icon(Icons.edit, color: AppColors.primary), onPressed: () => _form(c)),
                      IconButton(icon: const Icon(Icons.delete, color: AppColors.danger), onPressed: () => _delete(c)),
                    ]),
                  ),
                );
              },
            ),
          ),
        ),
      ),
    );
  }
}
