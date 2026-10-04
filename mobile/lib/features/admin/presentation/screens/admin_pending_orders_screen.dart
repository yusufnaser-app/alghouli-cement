import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/admin_service.dart';
import '../widgets/admin_async_view.dart';

String _fmt(num v) {
  final s = v.round().toString();
  return s.replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => ',');
}

double _num(dynamic v) => double.tryParse(v?.toString() ?? '') ?? 0;

/// الطلبات بانتظار التسعير
class AdminPendingOrdersScreen extends StatefulWidget {
  const AdminPendingOrdersScreen({super.key});

  @override
  State<AdminPendingOrdersScreen> createState() => _State();
}

class _State extends State<AdminPendingOrdersScreen> {
  final _service = AdminService();
  List<Map<String, dynamic>> _orders = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final list = await _service.pendingPricing();
      if (mounted) setState(() { _orders = list; _loading = false; });
    } catch (e) {
      if (mounted) setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  Future<void> _price(Map<String, dynamic> o) async {
    final done = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _PricingSheet(orderId: o['id'].toString(), orderNumber: '${o['order_number'] ?? ''}'),
    );
    if (done == true) _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('الطلبات بانتظار التسعير'),
        actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: _load)],
      ),
      body: AdminAsyncView(
        loading: _loading,
        error: _error,
        isEmpty: _orders.isEmpty,
        emptyText: 'لا توجد طلبات حالياً',
        onRetry: _load,
        builder: () => RefreshIndicator(
          onRefresh: _load,
          child: ListView.builder(
            padding: const EdgeInsets.all(12),
            itemCount: _orders.length,
            itemBuilder: (_, i) {
              final o = _orders[i];
              return Card(
                margin: const EdgeInsets.only(bottom: 10),
                child: ListTile(
                  title: Text(o['order_number']?.toString() ?? '—',
                      style: const TextStyle(fontWeight: FontWeight.bold)),
                  subtitle: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('العميل: ${o['customer_name'] ?? '—'}'),
                      Text('التاريخ: ${(o['created_at'] ?? '').toString().split('T').first}'),
                    ],
                  ),
                  trailing: const Icon(Icons.price_change, color: AppColors.brandRed),
                  onTap: () => _price(o),
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}

/// ورقة التسعير: الموظف فقط يدخل سعر الكيس؛ النظام يعرض الكمية × السعر.
/// الحساب هنا للعرض فقط — الحساب الرسمي يتم في Backend.
class _PricingSheet extends StatefulWidget {
  final String orderId;
  final String orderNumber;
  const _PricingSheet({required this.orderId, required this.orderNumber});

  @override
  State<_PricingSheet> createState() => _PricingSheetState();
}

class _PricingSheetState extends State<_PricingSheet> {
  final _service = AdminService();
  bool _loading = true;
  bool _saving = false;
  String? _error;
  List<Map<String, dynamic>> _items = [];
  final Map<String, TextEditingController> _price = {};
  final _transport = TextEditingController();
  final _discount = TextEditingController();
  bool _inclusive = false; // السعر شامل النقل
  bool _addTransport = false;
  String _beneficiary = 'driver';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final o = await _service.orderDetail(widget.orderId);
      final its = ((o['items'] as List?) ?? [])
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
      for (final it in its) {
        _price.putIfAbsent(it['id'].toString(), () => TextEditingController());
      }
      if (mounted) setState(() { _items = its; _loading = false; });
    } catch (e) {
      if (mounted) setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  double get _cement => _items.fold(0.0, (sum, it) =>
      sum + _num(it['quantity']) * _num(_price[it['id'].toString()]?.text));

  double get _transportAmt => (!_inclusive && _addTransport) ? _num(_transport.text) : 0;

  double get _total => _cement + _transportAmt - _num(_discount.text);

  Future<void> _save() async {
    for (final it in _items) {
      if (_num(_price[it['id'].toString()]!.text) <= 0) {
        _snack('أدخل سعر الكيس لكل بند', AppColors.danger);
        return;
      }
    }
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('تأكيد التسعير'),
        content: Text('الإجمالي: ${_fmt(_total)}\nهل تريد اعتماد التسعير؟'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('إلغاء')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('اعتماد')),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _saving = true);
    try {
      final disc = _num(_discount.text);
      await _service.setPricing(
        widget.orderId,
        transportAmount: _transportAmt,
        transportMode: _inclusive ? 'included' : (_addTransport ? 'separate' : 'none'),
        beneficiary: (!_inclusive && _addTransport) ? _beneficiary : null,
        items: [
          for (final it in _items)
            {
              'orderItemId': it['id'].toString(),
              'unitPrice': _num(_price[it['id'].toString()]!.text),
              // الخصم على مستوى الطلب يُطبق على أول بند (واجهة الخادم تقبله لكل بند)
              if (disc > 0 && identical(it, _items.first)) 'discount': disc,
            }
        ],
      );
      if (mounted) {
        _snack('تم تحديد السعر', AppColors.success);
        Navigator.pop(context, true);
      }
    } catch (e) {
      if (mounted) {
        setState(() => _saving = false);
        _snack(e.toString().replaceFirst('Exception: ', ''), AppColors.danger);
      }
    }
  }

  void _snack(String m, Color c) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m), backgroundColor: c));

  @override
  void dispose() {
    for (final c in _price.values) { c.dispose(); }
    _transport.dispose();
    _discount.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SizedBox(
        height: MediaQuery.of(context).size.height * 0.85,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(14),
              child: Text('تسعير ${widget.orderNumber}',
                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
            ),
            const Divider(height: 1),
            Expanded(
              child: AdminAsyncView(
                loading: _loading,
                error: _error,
                isEmpty: _items.isEmpty,
                emptyText: 'لا توجد بنود في هذا الطلب',
                onRetry: _load,
                builder: () => ListView(
                  padding: const EdgeInsets.all(14),
                  children: [
                    for (final it in _items) _itemRow(it),
                    const SizedBox(height: 8),
                    const Text('طريقة السعر', style: TextStyle(fontWeight: FontWeight.bold)),
                    RadioListTile<bool>(
                      value: true, groupValue: _inclusive,
                      title: const Text('السعر شامل النقل'),
                      onChanged: (v) => setState(() => _inclusive = v ?? false),
                    ),
                    RadioListTile<bool>(
                      value: false, groupValue: _inclusive,
                      title: const Text('السعر بدون النقل'),
                      onChanged: (v) => setState(() => _inclusive = v ?? false),
                    ),
                    if (!_inclusive) ...[
                      CheckboxListTile(
                        value: _addTransport,
                        title: const Text('إضافة أجور النقل'),
                        onChanged: (v) => setState(() => _addTransport = v ?? false),
                      ),
                      if (_addTransport) ...[
                        TextField(
                          controller: _transport,
                          keyboardType: TextInputType.number,
                          decoration: const InputDecoration(labelText: 'أجور النقل'),
                          onChanged: (_) => setState(() {}),
                        ),
                        const SizedBox(height: 8),
                        const Text('تُقيد أجور النقل لحساب'),
                        Row(children: [
                          Expanded(child: RadioListTile<String>(
                            value: 'driver', groupValue: _beneficiary,
                            title: const Text('السائق'),
                            onChanged: (v) => setState(() => _beneficiary = v!),
                          )),
                          Expanded(child: RadioListTile<String>(
                            value: 'trader', groupValue: _beneficiary,
                            title: const Text('التاجر'),
                            onChanged: (v) => setState(() => _beneficiary = v!),
                          )),
                        ]),
                      ],
                    ],
                    TextField(
                      controller: _discount,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(labelText: 'الخصم (اختياري)'),
                      onChanged: (_) => setState(() {}),
                    ),
                    const SizedBox(height: 14),
                    _summary(),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(14),
              child: SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: (_loading || _saving || _items.isEmpty) ? null : _save,
                  style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.brandRed, foregroundColor: Colors.white),
                  child: _saving
                      ? const SizedBox(height: 18, width: 18,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Text('اعتماد التسعير'),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _itemRow(Map<String, dynamic> it) {
    final qty = _num(it['quantity']);
    final price = _num(_price[it['id'].toString()]?.text);
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${it['product_name'] ?? '—'}  ${it['source_name'] != null ? '— ${it['source_name']}' : ''}',
                style: const TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 4),
            Text('الكمية: ${_fmt(qty)}'),
            TextField(
              controller: _price[it['id'].toString()],
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'سعر الكيس'),
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: 4),
            Text('قيمة الأسمنت: ${_fmt(qty)} × ${_fmt(price)} = ${_fmt(qty * price)}',
                style: const TextStyle(color: AppColors.primary)),
          ],
        ),
      ),
    );
  }

  Widget _summary() {
    Widget row(String l, String v, {bool bold = false}) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 2),
          child: Row(children: [
            Expanded(child: Text(l, style: TextStyle(fontWeight: bold ? FontWeight.bold : null))),
            Text(v, style: TextStyle(fontWeight: bold ? FontWeight.bold : null)),
          ]),
        );
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: AppColors.lightBlue, borderRadius: BorderRadius.circular(10)),
      child: Column(children: [
        row('قيمة الأسمنت', _fmt(_cement)),
        if (_inclusive) row('النقل', 'مشمول في السعر'),
        if (!_inclusive && _addTransport) row('أجور النقل', _fmt(_transportAmt)),
        if (_num(_discount.text) > 0) row('الخصم', '- ${_fmt(_num(_discount.text))}'),
        const Divider(),
        row('الإجمالي', _fmt(_total), bold: true),
        const SizedBox(height: 4),
        const Text('المعاينة للعرض؛ الحساب الرسمي يتم في الخادم.',
            style: TextStyle(fontSize: 11, color: AppColors.textSecondary)),
      ]),
    );
  }
}

/// كل الطلبات
class AdminAllOrdersScreen extends StatefulWidget {
  const AdminAllOrdersScreen({super.key});
  @override
  State<AdminAllOrdersScreen> createState() => _AllState();
}

class _AllState extends State<AdminAllOrdersScreen> {
  final _service = AdminService();
  List<Map<String, dynamic>> _orders = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final l = await _service.allOrders();
      if (mounted) setState(() { _orders = l; _loading = false; });
    } catch (e) {
      if (mounted) setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('كل الطلبات')),
      body: AdminAsyncView(
        loading: _loading,
        error: _error,
        isEmpty: _orders.isEmpty,
        onRetry: _load,
        builder: () => RefreshIndicator(
          onRefresh: _load,
          child: ListView.builder(
            padding: const EdgeInsets.all(12),
            itemCount: _orders.length,
            itemBuilder: (_, i) {
              final o = _orders[i];
              return Card(
                child: ListTile(
                  title: Text('${o['order_number'] ?? '—'}'),
                  subtitle: Text('${o['customer_name'] ?? '—'}  •  ${o['status'] ?? ''}'),
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}
