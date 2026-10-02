import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/admin_service.dart';

class AdminUserEditScreen extends StatefulWidget {
  final Map<String, dynamic>? user;
  const AdminUserEditScreen({super.key, this.user});
  @override
  State<AdminUserEditScreen> createState() => _S();
}

class _S extends State<AdminUserEditScreen> {
  final _svc = AdminService();
  final _nameCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _passCtrl = TextEditingController();

  String _userType = 'staff';
  String _status = 'active';
  Set<String> _roles = {};
  List<Map<String, dynamic>> _allRoles = [];
  bool _loading = true;
  bool _saving = false;
  String? _error;
  String? _tempPassword;

  bool get _isEdit => widget.user != null;

  @override
  void initState() {
    super.initState();
    if (_isEdit) {
      final u = widget.user!;
      _nameCtrl.text = u['full_name']?.toString() ?? '';
      _phoneCtrl.text = u['phone']?.toString() ?? '';
      _emailCtrl.text = u['email']?.toString() ?? '';
      _userType = u['user_type']?.toString() ?? 'staff';
      _status = u['status']?.toString() ?? 'active';
      _roles = ((u['roles'] as List?)?.cast<String>() ?? []).toSet();
    }
    _loadRoles();
  }

  @override
  void dispose() {
    _nameCtrl.dispose(); _phoneCtrl.dispose(); _emailCtrl.dispose(); _passCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadRoles() async {
    try {
      final list = await _svc.adminRoles();
      if (mounted) setState(() { _allRoles = list; _loading = false; });
    } catch (e) {
      if (mounted) setState(() { _error = e.toString(); _loading = false; });
    }
  }

  Future<void> _submit() async {
    setState(() { _saving = true; _error = null; _tempPassword = null; });
    try {
      if (_isEdit) {
        // تعديل
        await _svc.updateUser(widget.user!['id'].toString(), {
          'full_name': _nameCtrl.text.trim(),
          'email': _emailCtrl.text.trim().isEmpty ? null : _emailCtrl.text.trim(),
          'status': _status,
        });
        // الأدوار
        await _svc.setUserRoles(widget.user!['id'].toString(), _roles.toList());
        // كلمة المرور إن أُدخلت
        if (_passCtrl.text.trim().isNotEmpty) {
          await _svc.resetUserPassword(widget.user!['id'].toString(), _passCtrl.text.trim());
        }
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('✅ تم التعديل'), backgroundColor: AppColors.success));
          Navigator.pop(context, true);
        }
      } else {
        // إنشاء
        if (_nameCtrl.text.trim().length < 3) {
          setState(() { _error = 'الاسم قصير'; _saving = false; });
          return;
        }
        if (!RegExp(r'^\d{9,15}$').hasMatch(_phoneCtrl.text.trim())) {
          setState(() { _error = 'رقم الجوال غير صحيح'; _saving = false; });
          return;
        }
        if (_roles.isEmpty) {
          setState(() { _error = 'اختر دورًا واحدًا على الأقل'; _saving = false; });
          return;
        }
        final result = await _svc.createUser({
          'full_name': _nameCtrl.text.trim(),
          'phone': _phoneCtrl.text.trim(),
          'email': _emailCtrl.text.trim().isEmpty ? null : _emailCtrl.text.trim(),
          'user_type': _userType,
          'roles': _roles.toList(),
          if (_passCtrl.text.trim().isNotEmpty) 'password': _passCtrl.text.trim(),
        });
        if (mounted) {
          final tempPass = result['temp_password'];
          if (tempPass != null) {
            setState(() { _tempPassword = tempPass; _saving = false; });
            return;
          }
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('✅ تم الإنشاء'), backgroundColor: AppColors.success));
          Navigator.pop(context, true);
        }
      }
    } catch (e) {
      if (mounted) setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _saving = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_isEdit ? 'تعديل المستخدم' : 'مستخدم جديد'),
        actions: [
          if (_isEdit)
            IconButton(
              icon: const Icon(Icons.delete_outline, color: Colors.white),
              tooltip: 'حذف (تعطيل)',
              onPressed: () async {
                final ok = await showDialog<bool>(
                  context: context,
                  builder: (_) => AlertDialog(
                    title: const Text('تعطيل المستخدم'),
                    content: const Text('هل تريد تعطيل هذا الحساب؟'),
                    actions: [
                      TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('إلغاء')),
                      TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('تعطيل')),
                    ],
                  ),
                );
                if (ok == true) {
                  await _svc.setUserStatus(widget.user!['id'].toString(), 'inactive');
                  if (mounted) Navigator.pop(context, true);
                }
              },
            ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _tempPassword != null
              ? _tempPasswordView()
              : SingleChildScrollView(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (_error != null) ...[
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: AppColors.danger.withOpacity(0.1),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(_error!, style: const TextStyle(color: AppColors.danger)),
                        ),
                        const SizedBox(height: 12),
                      ],

                      _lbl('الاسم الكامل'),
                      TextField(controller: _nameCtrl, decoration: const InputDecoration(
                        prefixIcon: Icon(Icons.person), hintText: 'الاسم')),
                      const SizedBox(height: 12),

                      _lbl('رقم الجوال'),
                      TextField(
                        controller: _phoneCtrl,
                        enabled: !_isEdit,
                        keyboardType: TextInputType.phone,
                        decoration: const InputDecoration(
                          prefixIcon: Icon(Icons.phone), hintText: '967xxxxxxxxx'),
                      ),
                      const SizedBox(height: 12),

                      _lbl('البريد الإلكتروني (اختياري)'),
                      TextField(controller: _emailCtrl, keyboardType: TextInputType.emailAddress,
                        decoration: const InputDecoration(
                          prefixIcon: Icon(Icons.email), hintText: 'name@example.com')),
                      const SizedBox(height: 12),

                      if (!_isEdit) ...[
                        _lbl('نوع المستخدم'),
                        DropdownButtonFormField<String>(
                          value: _userType,
                          decoration: const InputDecoration(prefixIcon: Icon(Icons.category)),
                          items: const [
                            DropdownMenuItem(value: 'staff', child: Text('موظف')),
                            DropdownMenuItem(value: 'driver', child: Text('سائق')),
                            DropdownMenuItem(value: 'customer', child: Text('تاجر')),
                          ],
                          onChanged: (v) => setState(() => _userType = v ?? 'staff'),
                        ),
                        const SizedBox(height: 12),
                      ],

                      _lbl('الأدوار'),
                      Wrap(spacing: 6, runSpacing: 6, children: _allRoles.map((r) {
                        final name = r['name'].toString();
                        final selected = _roles.contains(name);
                        return FilterChip(
                          label: Text(r['name_ar']?.toString() ?? name),
                          selected: selected,
                          onSelected: (v) {
                            setState(() {
                              if (v) { _roles.add(name); } else { _roles.remove(name); }
                            });
                          },
                          selectedColor: AppColors.primary,
                          labelStyle: TextStyle(color: selected ? Colors.white : null),
                          checkmarkColor: Colors.white,
                        );
                      }).toList()),
                      const SizedBox(height: 12),

                      if (_isEdit) ...[
                        _lbl('الحالة'),
                        DropdownButtonFormField<String>(
                          value: _status,
                          decoration: const InputDecoration(prefixIcon: Icon(Icons.toggle_on)),
                          items: const [
                            DropdownMenuItem(value: 'active', child: Text('نشط')),
                            DropdownMenuItem(value: 'suspended', child: Text('معلّق')),
                            DropdownMenuItem(value: 'inactive', child: Text('غير نشط')),
                            DropdownMenuItem(value: 'blocked', child: Text('محظور')),
                          ],
                          onChanged: (v) => setState(() => _status = v ?? 'active'),
                        ),
                        const SizedBox(height: 12),
                      ],

                      _lbl(_isEdit ? 'كلمة مرور جديدة (اترك فارغًا لعدم التغيير)' : 'كلمة المرور (اترك فارغًا لتوليدها)'),
                      TextField(
                        controller: _passCtrl,
                        obscureText: true,
                        decoration: const InputDecoration(
                          prefixIcon: Icon(Icons.lock), hintText: '••••••'),
                      ),
                      const SizedBox(height: 24),

                      ElevatedButton.icon(
                        onPressed: _saving ? null : _submit,
                        icon: _saving
                            ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                            : const Icon(Icons.save),
                        label: Text(_isEdit ? 'حفظ التعديلات' : 'إنشاء المستخدم'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.primary,
                          foregroundColor: Colors.white,
                          minimumSize: const Size(double.infinity, 54),
                        ),
                      ),
                    ],
                  ),
                ),
    );
  }

  Widget _tempPasswordView() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.check_circle, color: AppColors.success, size: 70),
            const SizedBox(height: 16),
            const Text('تم إنشاء المستخدم بنجاح', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 20),
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: AppColors.warning.withOpacity(0.1),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.warning, width: 2),
              ),
              child: Column(children: [
                const Text('كلمة المرور المؤقتة', style: TextStyle(fontWeight: FontWeight.bold)),
                const SizedBox(height: 10),
                SelectableText(_tempPassword!,
                  style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold, letterSpacing: 2)),
                const SizedBox(height: 10),
                const Text('⚠️ احفظها الآن — لن تُعرض مرة أخرى',
                  style: TextStyle(fontSize: 11, color: AppColors.danger)),
              ]),
            ),
            const SizedBox(height: 20),
            ElevatedButton(
              onPressed: () => Navigator.pop(context, true),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.white,
                minimumSize: const Size(double.infinity, 50),
              ),
              child: const Text('تم'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _lbl(String t) => Padding(
    padding: const EdgeInsets.only(bottom: 6),
    child: Text(t, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
  );
}
