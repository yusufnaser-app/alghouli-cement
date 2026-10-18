import 'package:dio/dio.dart';
import 'package:flutter/material.dart';

import '../../../../core/constants/app_colors.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/receipts/receipt.dart';
import '../../data/customer_account_service.dart';

const _sideAr = {'owed_to_driver': 'مستحق للسائق', 'owed_by_driver': 'على السائق', 'settled': 'مسوّى', 'none': '—'};

/// كشف حساب سائق المؤسسة: الملخص، والحركات بتاريخها وبيانها، وعمليات الصرف والسلفة والخصم.
class AdminDriverAccountScreen extends StatefulWidget {
  final String driverId;
  final String driverName;

  const AdminDriverAccountScreen({super.key, required this.driverId, required this.driverName});

  @override
  State<AdminDriverAccountScreen> createState() => _S();
}

class _S extends State<AdminDriverAccountScreen> {
  final _client = ApiClient();
  final _captureKey = GlobalKey();
  Map<String, dynamic>? _summary;
  List<Map<String, dynamic>> _rows = [];
  bool _loading = true;
  bool _busy = false;
  String? _err;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _err = null;
    });
    try {
      final s = await _client.dio.get('/drivers/${widget.driverId}/summary');
      final l = await _client.dio.get('/drivers/${widget.driverId}/ledger');
      final sum = (s.data['data'] as Map?)?.cast<String, dynamic>();
      final raw = l.data['data'];
      final list = raw is List ? raw : ((raw is Map ? (raw['rows'] ?? raw['items']) : null) as List?) ?? [];
      if (!mounted) return;
      setState(() {
        _summary = sum;
        _rows = list.cast<Map>().map((e) => e.cast<String, dynamic>()).toList();
      });
    } on DioException catch (e) {
      _err = handleApiError(e);
    } catch (e) {
      _err = e.toString();
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _snack(String m, Color c) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m), backgroundColor: c));
  }

  /// يسجّل صرفًا أو سلفة أو خصمًا على السائق بمبلغ وبيان.
  Future<void> _operate(String kind, String title) async {
    final amountCtrl = TextEditingController();
    final descCtrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(
            controller: amountCtrl,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(labelText: 'المبلغ (ريال)'),
          ),
          TextField(controller: descCtrl, decoration: const InputDecoration(labelText: 'البيان / السبب')),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('إلغاء')),
          ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('تسجيل')),
        ],
      ),
    );
    final amount = double.tryParse(amountCtrl.text.trim().replaceAll(',', ''));
    final desc = descCtrl.text.trim();
    amountCtrl.dispose();
    descCtrl.dispose();
    if (ok != true) return;
    if (amount == null || amount <= 0) {
      _snack('أدخل مبلغًا صحيحًا', AppColors.danger);
      return;
    }
    final path = kind == 'payment' ? 'payments' : (kind == 'advance' ? 'advances' : 'deductions');
    setState(() => _busy = true);
    try {
      await _client.dio.post(
        '/drivers/${widget.driverId}/$path',
        data: {'amount': amount, if (desc.isNotEmpty) 'description': desc},
      );
      _snack('تم التسجيل', AppColors.success);
      await _load();
    } on DioException catch (e) {
      _snack(handleApiError(e), AppColors.danger);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        backgroundColor: AppColors.background,
        appBar: AppBar(
          title: Text('كشف ${widget.driverName}'),
          actions: [
            IconButton(
              tooltip: 'مشاركة الكشف كصورة',
              icon: const Icon(Icons.image_outlined),
              onPressed: _loading ? null : () => shareWidgetAsImage(_captureKey, 'كشف_سائق_${widget.driverName}'),
            ),
            IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
          ],
        ),
        body: _loading
            ? const Center(child: CircularProgressIndicator())
            : _err != null
                ? Center(child: Padding(padding: const EdgeInsets.all(16), child: Text(_err!, textAlign: TextAlign.center)))
                : ListView(
                    padding: const EdgeInsets.all(12),
                    children: [
                      Row(children: [
                        Expanded(child: _actionBtn(Icons.payments, 'صرف', AppColors.success, () => _operate('payment', 'صرف للسائق'))),
                        const SizedBox(width: 6),
                        Expanded(child: _actionBtn(Icons.request_quote, 'سلفة', AppColors.warning, () => _operate('advance', 'سلفة للسائق'))),
                        const SizedBox(width: 6),
                        Expanded(child: _actionBtn(Icons.remove_circle_outline, 'خصم', AppColors.danger, () => _operate('deduction', 'خصم على السائق'))),
                      ]),
                      const SizedBox(height: 12),
                      RepaintBoundary(
                        key: _captureKey,
                        child: Container(
                          color: Colors.white,
                          padding: const EdgeInsets.all(12),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text('مؤسسة الغولي لتجارة وتسويق الأسمنت',
                                  style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.primary)),
                              Text('كشف حساب سائق: ${widget.driverName}'),
                              const Divider(),
                              _summaryBlock(),
                              const Divider(),
                              _statementBlock(),
                            ],
                          ),
                        ),
                      ),
                      if (_busy) const Padding(padding: EdgeInsets.all(12), child: LinearProgressIndicator()),
                    ],
                  ),
      ),
    );
  }

  Widget _actionBtn(IconData icon, String label, Color color, VoidCallback onTap) {
    return ElevatedButton.icon(
      icon: Icon(icon, size: 18),
      label: Text(label),
      onPressed: _busy ? null : onTap,
      style: ElevatedButton.styleFrom(backgroundColor: color, foregroundColor: Colors.white),
    );
  }

  Widget _line(String label, String value, {bool bold = false, Color? color}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(children: [
          Expanded(child: Text(label, style: const TextStyle(color: AppColors.textSecondary))),
          Text(value, style: TextStyle(fontWeight: bold ? FontWeight.bold : FontWeight.w500, color: color)),
        ]),
      );

  Widget _summaryBlock() {
    final s = _summary;
    if (s == null) return const Text('لا يوجد ملخص');
    final outstanding = (s['outstanding_balance'] ?? '0').toString();
    final side = _sideAr[s['outstanding_side']?.toString()] ?? '';
    return Column(children: [
      _line('الرصيد الافتتاحي', fmtMoney(s['opening_balance'])),
      _line('أجور النقل', fmtMoney(s['transport_due'])),
      _line('عدد الرحلات', '${s['trips'] ?? 0}'),
      _line('سلف', fmtMoney(s['advances'])),
      _line('مدفوعات', fmtMoney(s['payments'])),
      _line('خصومات', fmtMoney(s['deductions'])),
      _line('الرصيد المستحق', '${fmtMoney(outstanding)} ($side)', bold: true,
          color: s['outstanding_side'] == 'owed_to_driver' ? AppColors.danger : AppColors.success),
    ]);
  }

  Widget _statementBlock() {
    if (_rows.isEmpty) return const Padding(padding: EdgeInsets.all(8), child: Text('لا توجد حركات بعد'));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final r in _rows)
          Container(
            margin: const EdgeInsets.only(top: 6),
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: Colors.grey.shade50,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${(r['created_at'] ?? '').toString().length >= 10 ? r['created_at'].toString().substring(0, 10) : ''}'
                  '  ${r['description'] ?? r['transaction_type'] ?? ''}',
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                if (r['order_number'] != null) Text('الطلب: ${r['order_number']}', style: const TextStyle(fontSize: 12)),
                Row(children: [
                  if ('${r['debit']}' != '0.00' && '${r['debit']}' != '0' && r['debit'] != null)
                    Text('مستحق ${fmtMoney(r['debit'])}  ', style: const TextStyle(color: AppColors.danger, fontSize: 12)),
                  if ('${r['credit']}' != '0.00' && '${r['credit']}' != '0' && r['credit'] != null)
                    Text('مدفوع ${fmtMoney(r['credit'])}  ', style: const TextStyle(color: AppColors.success, fontSize: 12)),
                  const Spacer(),
                  Text('الرصيد ${fmtMoney(r['balance_after'])}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                ]),
              ],
            ),
          ),
      ],
    );
  }
}
