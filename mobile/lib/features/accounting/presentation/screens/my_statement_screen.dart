import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/statement_service.dart';

/// كشف الحساب — عرض فقط. كل الأرقام (الافتتاحي/الجاري/الختامي/الإجماليات) يحسبها Backend.
/// لا يُجرى أي جمع أو طرح مالي هنا، ولا يُجمع بين عملات مختلفة.
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
  DateTime? _from;
  DateTime? _to;

  static const _currencyName = {'YER': 'ريال يمني', 'USD': 'دولار أمريكي', 'SAR': 'ريال سعودي'};

  @override
  void initState() { super.initState(); _load(); }

  String? _fmtDate(DateTime? d) => d == null
      ? null
      : '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final data = await _service.myStatement(from: _fmtDate(_from), to: _fmtDate(_to));
      if (mounted) setState(() => _data = data);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _pick(bool isFrom) async {
    final d = await showDatePicker(
      context: context,
      initialDate: (isFrom ? _from : _to) ?? DateTime.now(),
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 1)),
    );
    if (d == null) return;
    setState(() { if (isFrom) { _from = d; } else { _to = d; } });
    _load();
  }

  // تنسيق عرض فقط لنص جاهز من Backend (مثل "1200000.00") — لا حساب.
  String _fmt(dynamic v) {
    final s = '${v ?? '0.00'}';
    final neg = s.startsWith('-');
    final parts = (neg ? s.substring(1) : s).split('.');
    final intPart = parts[0].replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (m) => '${m[1]},');
    return '${neg ? '-' : ''}$intPart.${parts.length > 1 ? parts[1] : '00'}';
  }

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
    final sections = ((_data?['sections'] as List?) ?? []).cast<Map>();
    final recon = ((_data?['reconciliation'] as List?) ?? []).cast<Map>();
    final hasMismatch = recon.any((r) => r['matches'] == false);
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: AppColors.primary, borderRadius: BorderRadius.circular(16)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(customer['full_name']?.toString() ?? 'حساب العميل', style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
              const SizedBox(height: 4),
              Text('رقم الحساب: ${customer['account_ref'] ?? ''}', style: const TextStyle(color: Colors.white70)),
            ]),
          ),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(child: OutlinedButton.icon(onPressed: () => _pick(true), icon: const Icon(Icons.date_range), label: Text(_from == null ? 'من' : _fmtDate(_from)!))),
            const SizedBox(width: 8),
            Expanded(child: OutlinedButton.icon(onPressed: () => _pick(false), icon: const Icon(Icons.date_range), label: Text(_to == null ? 'إلى' : _fmtDate(_to)!))),
            if (_from != null || _to != null)
              IconButton(onPressed: () { setState(() { _from = null; _to = null; }); _load(); }, icon: const Icon(Icons.clear)),
          ]),
          if (hasMismatch)
            Card(color: Colors.red.shade50, child: const Padding(padding: EdgeInsets.all(12), child: Text('تنبيه: يوجد فرق بين الرصيد المخزّن والدفتر. تواصل مع المؤسسة.'))),
          const SizedBox(height: 8),
          if (sections.isEmpty)
            const Card(child: Padding(padding: EdgeInsets.all(24), child: Center(child: Text('لا توجد حركات في كشف الحساب'))))
          else
            ...sections.map(_section),
        ],
      ),
    );
  }

  Widget _section(Map s) {
    final cur = '${s['currency']}';
    final rows = ((s['rows'] as List?) ?? []).cast<Map>();
    final side = '${s['closing_side'] ?? ''}';
    final sideColor = side == 'مدين' ? Colors.red : (side == 'دائن' ? Colors.green : Colors.grey);
    return Card(
      margin: const EdgeInsets.only(bottom: 14),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('${_currencyName[cur] ?? cur} ($cur)', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
          const Divider(),
          _kv('الرصيد الافتتاحي', _fmt(s['opening_balance'])),
          ...rows.map((r) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Expanded(child: Text('${r['description'] ?? ''}', style: TextStyle(fontWeight: FontWeight.w600, color: r['is_reversal'] == true ? Colors.red : null))),
                    Text(_fmt(r['balance']), style: const TextStyle(fontWeight: FontWeight.bold)),
                  ]),
                  Text('${'${r['date'] ?? ''}'.split('T').first}  •  المرجع: ${r['reference'] ?? r['order_number'] ?? '-'}', style: const TextStyle(fontSize: 12, color: Colors.black54)),
                  Row(children: [
                    if (r['debit'] != '0.00') Text('مدين: ${_fmt(r['debit'])}', style: const TextStyle(color: Colors.red)),
                    if (r['debit'] != '0.00' && r['credit'] != '0.00') const SizedBox(width: 14),
                    if (r['credit'] != '0.00') Text('دائن: ${_fmt(r['credit'])}', style: const TextStyle(color: Colors.green)),
                  ]),
                ]),
              )),
          const Divider(),
          _kv('إجمالي المدين', _fmt(s['total_debit'])),
          _kv('إجمالي الدائن', _fmt(s['total_credit'])),
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            Text('الرصيد الختامي ($side)', style: TextStyle(fontWeight: FontWeight.bold, color: sideColor)),
            Text('${_fmt(s['closing_balance'])} $cur', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 17, color: sideColor)),
          ]),
        ]),
      ),
    );
  }

  Widget _kv(String k, String v) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [Text(k), Text(v)]),
      );
}
