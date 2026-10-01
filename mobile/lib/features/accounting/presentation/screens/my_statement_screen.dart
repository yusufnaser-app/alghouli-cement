import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/statement_service.dart';

class MyStatementScreen extends StatefulWidget {
  const MyStatementScreen({super.key});
  @override
  State<MyStatementScreen> createState() => _MyStatementScreenState();
}

class _MyStatementScreenState extends State<MyStatementScreen> {
  final _service = StatementService();
  Map<String, dynamic>? _data;
  bool _loading = true;
  String? _error;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final data = await _service.myStatement();
      if (mounted) setState(() => _data = data);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _money(dynamic v) => (double.tryParse('$v') ?? 0).toStringAsFixed(0)
      .replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (m) => '${m[1]},');

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('كشف الحساب'), actions: [IconButton(onPressed: _load, icon: const Icon(Icons.refresh))]),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(_error!, textAlign: TextAlign.center)))
              : _buildBody(),
    );
  }

  Widget _buildBody() {
    final customer = Map<String, dynamic>.from(_data?['customer'] ?? {});
    final rows = ((_data?['rows'] as List?) ?? []).cast<Map>();
    final balance = double.tryParse('${customer['current_balance'] ?? 0}') ?? 0;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(color: AppColors.primary, borderRadius: BorderRadius.circular(16)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(customer['full_name']?.toString() ?? 'حساب العميل', style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
              const SizedBox(height: 12),
              const Text('الرصيد الحالي', style: TextStyle(color: Colors.white70)),
              const SizedBox(height: 4),
              Text('${_money(balance)} ريال', style: const TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.bold)),
            ]),
          ),
          const SizedBox(height: 16),
          if (rows.isEmpty)
            const Card(child: Padding(padding: EdgeInsets.all(24), child: Center(child: Text('لا توجد حركات في كشف الحساب'))))
          else
            ...rows.map((r) => Card(
              margin: const EdgeInsets.only(bottom: 10),
              child: Padding(padding: const EdgeInsets.all(14), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Expanded(child: Text(r['description']?.toString() ?? r['transaction_type']?.toString() ?? 'حركة', style: const TextStyle(fontWeight: FontWeight.bold))),
                  Text('${r['balance_after'] ?? 0} ريال', style: const TextStyle(fontWeight: FontWeight.bold)),
                ]),
                const SizedBox(height: 7),
                if (r['order_number'] != null) Text('الطلب: ${r['order_number']}'),
                if (r['reference_code'] != null) Text('المرجع: ${r['reference_code']}'),
                const SizedBox(height: 5),
                Row(children: [
                  if ((double.tryParse('${r['debit'] ?? 0}') ?? 0) > 0) Text('مدين: ${_money(r['debit'])} ريال', style: const TextStyle(color: Colors.red)),
                  if ((double.tryParse('${r['credit'] ?? 0}') ?? 0) > 0) ...[
                    const SizedBox(width: 16),
                    Text('دائن: ${_money(r['credit'])} ريال', style: const TextStyle(color: Colors.green)),
                  ],
                ]),
              ])),
            )),
        ],
      ),
    );
  }
}
