import 'package:flutter/material.dart';

import '../../../../core/constants/app_colors.dart';
import '../../data/customer_account_service.dart';
import 'admin_customer_account_screen.dart';

/// حسابات العملاء: الرصيد والائتمان وعدد السقوف لكل عميل، ويفتح كل عميل على كشف حسابه.
class AdminCustomersScreen extends StatefulWidget {
  const AdminCustomersScreen({super.key});

  @override
  State<AdminCustomersScreen> createState() => _S();
}

class _S extends State<AdminCustomersScreen> {
  final _svc = CustomerAccountService();
  final _search = TextEditingController();
  List<Map<String, dynamic>> _all = [];
  bool _loading = true;
  String? _err;

  @override
  void initState() {
    super.initState();
    _load();
    _search.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _err = null;
    });
    try {
      final list = await _svc.customers();
      if (mounted) setState(() => _all = list);
    } catch (e) {
      if (mounted) setState(() => _err = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<Map<String, dynamic>> get _filtered {
    final q = _search.text.trim().toLowerCase();
    if (q.isEmpty) return _all;
    return _all.where((c) {
      final name = (c['full_name'] ?? '').toString().toLowerCase();
      final phone = (c['phone'] ?? '').toString();
      return name.contains(q) || phone.contains(q);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        backgroundColor: AppColors.background,
        appBar: AppBar(
          title: const Text('حسابات العملاء'),
          actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: _load)],
        ),
        body: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(12),
              child: TextField(
                controller: _search,
                decoration: InputDecoration(
                  hintText: 'ابحث بالاسم أو الهاتف',
                  prefixIcon: const Icon(Icons.search),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                ),
              ),
            ),
            Expanded(child: _body()),
          ],
        ),
      ),
    );
  }

  Widget _body() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_err != null) {
      return Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text(_err!, textAlign: TextAlign.center),
          const SizedBox(height: 8),
          OutlinedButton(onPressed: _load, child: const Text('إعادة المحاولة')),
        ]),
      );
    }
    final list = _filtered;
    if (list.isEmpty) return const Center(child: Text('لا يوجد عملاء'));
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
        itemCount: list.length,
        itemBuilder: (_, i) => _tile(list[i]),
      ),
    );
  }

  Widget _tile(Map<String, dynamic> c) {
    final balance = c['current_balance'] ?? '0';
    final owes = (double.tryParse(balance.toString()) ?? 0) > 0; // موجب = مدين على العميل
    final limit = double.tryParse((c['credit_limit'] ?? '0').toString()) ?? 0;
    final ceilings = int.tryParse((c['ceilings_count'] ?? 0).toString()) ?? 0;
    final requiresApproval = c['ceiling_action'] == 'request_approval';

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        onTap: () => Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => AdminCustomerAccountScreen(
              customerId: c['id'].toString(),
              customerName: c['full_name']?.toString() ?? '—',
            ),
          ),
        ),
        leading: CircleAvatar(
          backgroundColor: AppColors.primary.withOpacity(0.1),
          child: const Icon(Icons.store, color: AppColors.primary),
        ),
        title: Text(c['full_name']?.toString() ?? '—', style: const TextStyle(fontWeight: FontWeight.bold)),
        subtitle: Text(
          '${c['phone'] ?? '—'}\n'
          'الائتمان: ${limit > 0 ? '${fmtMoney(limit)} ر.ي' : 'بلا حد'}'
          ' · السقوف: $ceilings${requiresApproval ? ' (موافقة)' : ''}',
        ),
        isThreeLine: true,
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              '${fmtMoney(balance)} ر.ي',
              style: TextStyle(
                fontWeight: FontWeight.bold,
                color: owes ? AppColors.danger : AppColors.success,
              ),
            ),
            Text(owes ? 'مدين' : 'دائن/صفر', style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
          ],
        ),
      ),
    );
  }
}
