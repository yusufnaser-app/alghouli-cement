import 'package:flutter/material.dart';

import '../../../../core/constants/app_colors.dart';
import '../../../../core/documents/document_actions.dart';
import '../../data/customer_account_service.dart';
import '../../../../core/receipts/receipt.dart';


/// كشف حساب عميل واحد: الملخص والسقوف والحركات، مع طباعة/مشاركة الكشف.
class AdminCustomerAccountScreen extends StatefulWidget {
  final String customerId;
  final String customerName;

  const AdminCustomerAccountScreen({super.key, required this.customerId, required this.customerName});

  @override
  State<AdminCustomerAccountScreen> createState() => _S();
}

class _S extends State<AdminCustomerAccountScreen> {
  final _svc = CustomerAccountService();
  final _captureKey = GlobalKey();
  Map<String, dynamic>? _summary;
  List<Map<String, dynamic>> _rules = [];
  Map<String, dynamic>? _statement;
  bool _loading = true;
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
      // ثلاثة نداءات مستقلة: إذا فشل أحدها تبقى البقية ظاهرة
      final results = await Future.wait([
        _svc.summary(widget.customerId).then<Object?>((v) => v).catchError((_) => null),
        _svc.ceilingRules(widget.customerId).then<Object?>((v) => v).catchError((_) => null),
        _svc.statement(widget.customerId).then<Object?>((v) => v).catchError((_) => null),
      ]);
      if (!mounted) return;
      setState(() {
        _summary = results[0] as Map<String, dynamic>?;
        _rules = (results[1] as List<Map<String, dynamic>>?) ?? [];
        _statement = results[2] as Map<String, dynamic>?;
        if (_summary == null && _statement == null) _err = 'تعذّر تحميل حساب العميل';
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  /// نافذة فيها حقل المبلغ فقط: الإدارة تكتب السقف ويُحفظ مباشرة.
  Future<void> _editLimit() async {
    final messenger = ScaffoldMessenger.of(context);
    final current = (_summary?['credit_limit'] ?? '0').toString();
    final ctrl = TextEditingController(text: (double.tryParse(current) ?? 0) > 0 ? current : '');
    final value = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('سقف الائتمان (ريال)'),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: const InputDecoration(labelText: 'المبلغ', hintText: 'اتركه فارغًا لإلغاء السقف'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('إلغاء')),
          ElevatedButton(onPressed: () => Navigator.pop(ctx, ctrl.text.trim()), child: const Text('حفظ')),
        ],
      ),
    );
    ctrl.dispose();
    if (value == null) return;

    final amount = value.isEmpty ? 0.0 : double.tryParse(value.replaceAll(',', ''));
    if (amount == null || amount < 0) {
      messenger.showSnackBar(const SnackBar(content: Text('أدخل مبلغًا صحيحًا (رقم صفر أو أكبر)')));
      return;
    }
    try {
      await _svc.setCreditLimit(widget.customerId, amount);
      messenger.showSnackBar(SnackBar(
        content: Text(amount == 0 ? 'تم إلغاء السقف' : 'تم تحديد السقف: ${fmtMoney(amount)} ر.ي'),
        backgroundColor: AppColors.success,
      ));
      if (mounted) await _load();
    } catch (e) {
      messenger.showSnackBar(SnackBar(
        content: Text(e.toString().replaceFirst('Exception: ', '')),
        backgroundColor: AppColors.danger,
      ));
    }
  }

  /// دفعة أو حوالة من التاجر بمبلغ وبيان، تُرحَّل إلى حسابه.
  Future<void> _payment() async {
    final messenger = ScaffoldMessenger.of(context);
    final amountCtrl = TextEditingController();
    final notesCtrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('دفعة / حوالة من التاجر'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(
            controller: amountCtrl,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(labelText: 'المبلغ (ريال)'),
          ),
          TextField(controller: notesCtrl, decoration: const InputDecoration(labelText: 'البيان / رقم الحوالة')),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('إلغاء')),
          ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('تسجيل')),
        ],
      ),
    );
    final amount = double.tryParse(amountCtrl.text.trim().replaceAll(',', ''));
    final notes = notesCtrl.text.trim();
    amountCtrl.dispose();
    notesCtrl.dispose();
    if (ok != true) return;
    if (amount == null || amount <= 0) {
      messenger.showSnackBar(const SnackBar(content: Text('أدخل مبلغًا صحيحًا')));
      return;
    }
    try {
      await _svc.recordCustomerPayment(widget.customerId, amount, notes);
      messenger.showSnackBar(const SnackBar(content: Text('تم تسجيل الدفعة'), backgroundColor: AppColors.success));
      if (mounted) await _load();
    } catch (e) {
      messenger.showSnackBar(SnackBar(
        content: Text(e.toString().replaceFirst('Exception: ', '')),
        backgroundColor: AppColors.danger,
      ));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        backgroundColor: AppColors.background,
        appBar: AppBar(
          title: Text(widget.customerName),
          actions: [
            IconButton(
              tooltip: 'دفعة / حوالة من التاجر',
              icon: const Icon(Icons.payments_outlined),
              onPressed: _loading ? null : _payment,
            ),
            IconButton(
              tooltip: 'تحديد السقف',
              icon: const Icon(Icons.credit_score),
              onPressed: _loading ? null : _editLimit,
            ),
            DocumentMenuButton(docs: [
              DocumentSpec(
                label: 'كشف حساب العميل',
                path: () async => '/documents/customer/${widget.customerId}/statement',
                fileName: 'كشف_${widget.customerName}',
              ),
            ]),
            IconButton(
              tooltip: 'مشاركة الكشف كصورة',
              icon: const Icon(Icons.image_outlined),
              onPressed: _loading ? null : () => shareWidgetAsImage(_captureKey, 'كشف_${widget.customerName}'),
            ),
            IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
          ],
        ),
        body: _loading
            ? const Center(child: CircularProgressIndicator())
            : _err != null
                ? Center(child: Text(_err!))
                : RefreshIndicator(
                    onRefresh: _load,
                    child: ListView(
                      padding: const EdgeInsets.all(12),
                      children: [
                        RepaintBoundary(
                          key: _captureKey,
                          child: ColoredBox(
                            color: Colors.white,
                            child: SizedBox(width: 400, child: Column(
                              mainAxisSize: MainAxisSize.min,
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                Padding(
                                  padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
                                  child: Row(children: [
                                    Image.asset(
                                      'assets/images/logo.jpg',
                                      height: 48,
                                      errorBuilder: (_, __, ___) => const Icon(Icons.business, color: AppColors.primary),
                                    ),
                                    const SizedBox(width: 10),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          const Text('مؤسسة الغولي لتجارة وتسويق الأسمنت',
                                              style: TextStyle(fontWeight: FontWeight.bold, color: AppColors.primary)),
                                          Text('كشف حساب: ${widget.customerName}',
                                              style: const TextStyle(fontSize: 13)),
                                        ],
                                      ),
                                    ),
                                  ]),
                                ),
                                _summaryCard(),
                                _rulesCard(),
                                ..._statementCards(),
                              ],
                            )),
                          ),
                        ),
                      ],
                    ),
                  ),
      ),
    );
  }

  Widget _card(String title, List<Widget> children) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: AppColors.primary)),
            const Divider(),
            ...children,
          ],
        ),
      ),
    );
  }

  Widget _line(String label, String value, {Color? color, bool bold = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Expanded(child: Text(label, style: const TextStyle(color: AppColors.textSecondary))),
          Text(
            value,
            style: TextStyle(fontWeight: bold ? FontWeight.bold : FontWeight.w500, color: color),
          ),
        ],
      ),
    );
  }

  Widget _summaryCard() {
    final s = _summary;
    if (s == null) return _card('الملخص', [const Text('لا يوجد ملخص متاح')]);

    final limit = (s['credit_limit'] ?? '0').toString();
    final hasLimit = s['has_limit'] == true;
    final status = s['account_status']?.toString() ?? '';
    final statusAr = {'active': 'نشط', 'near_limit': 'قريب من الحد', 'over_limit': 'تجاوز الحد', 'blocked': 'موقوف'}[status] ?? status;
    final statusColor = status == 'active' ? AppColors.success : AppColors.danger;

    final balances = (s['balances'] as Map?)?.cast<String, dynamic>() ?? {};
    final blocks = <Widget>[];
    balances.forEach((cur, raw) {
      final b = (raw as Map).cast<String, dynamic>();
      final bal = (b['balance'] ?? '0').toString();
      final owes = (double.tryParse(bal) ?? 0) > 0;
      blocks.add(Padding(
        padding: const EdgeInsets.only(top: 6),
        child: Text('العملة: $cur', style: const TextStyle(fontWeight: FontWeight.bold)),
      ));
      blocks.add(_line('الرصيد الافتتاحي', fmtMoney(b['opening_balance'])));
      blocks.add(_line('المبيعات', fmtMoney(b['sales'])));
      blocks.add(_line('أجور النقل', fmtMoney(b['transport_fees'])));
      blocks.add(_line('الخصومات (ضمن المبيعات)', fmtMoney(b['discounts'])));
      blocks.add(_line('المدفوعات', fmtMoney(b['payments'])));
      blocks.add(_line('التسويات', fmtMoney(b['adjustments'])));
      blocks.add(_line(
        'الرصيد الحالي',
        '${fmtMoney(bal)} (${owes ? 'مدين' : 'دائن/صفر'})',
        color: owes ? AppColors.danger : AppColors.success,
        bold: true,
      ));
      if (b['reconciled'] == false) {
        blocks.add(const Padding(
          padding: EdgeInsets.only(top: 4),
          child: Text('⚠ الرصيد المخزَّن لا يطابق الحركات — راجع فحص السلامة', style: TextStyle(color: AppColors.warning, fontSize: 12)),
        ));
      }
    });

    return _card('الملخص', [
      _line('حد الائتمان', hasLimit ? '${fmtMoney(limit)} ر.ي' : 'بلا حد'),
      if (hasLimit) _line('المتاح', s['available_credit'] == null ? '—' : '${fmtMoney(s['available_credit'])} ر.ي'),
      if (hasLimit) _line('المعلّق', '${fmtMoney(s['pending_credit'])} ر.ي'),
      _line('حالة الحساب', statusAr, color: statusColor, bold: true),
      ...blocks,
      if (balances.isEmpty) const Padding(padding: EdgeInsets.only(top: 6), child: Text('لا توجد حركات بعد')),
    ]);
  }

  Widget _rulesCard() {
    final action = _summary?['ceiling_action'];
    final children = <Widget>[
      if (action != null)
        _line('عند التجاوز', action == 'request_approval' ? 'طلب موافقة استثنائية' : 'منع الطلب'),
    ];
    if (_rules.isEmpty) {
      children.add(const Padding(padding: EdgeInsets.only(top: 6), child: Text('لا توجد سقوف خاصة بهذا العميل')));
    } else {
      for (final r in _rules) {
        final parts = <String>[
          if (r['max_bags'] != null) '${r['max_bags']} كيس',
          if (r['max_amount'] != null) '${fmtMoney(r['max_amount'])} ر.ي',
          if (r['max_orders'] != null) '${r['max_orders']} طلب',
          if (r['max_vehicles'] != null) '${r['max_vehicles']} قاطرة',
        ];
        final period = r['period'] == 'monthly' ? 'شهري' : 'يومي';
        final active = r['is_active'] == true;
        children.add(Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Row(
            children: [
              Icon(active ? Icons.check_circle : Icons.pause_circle, size: 18, color: active ? AppColors.success : AppColors.textSecondary),
              const SizedBox(width: 6),
              Expanded(
                child: Text('${r['name_ar'] ?? ''} ($period): ${parts.join(' · ')}',
                    style: TextStyle(color: active ? null : AppColors.textSecondary)),
              ),
            ],
          ),
        ));
      }
    }
    return _card('السقوف (${_rules.length})', children);
  }

  List<Widget> _statementCards() {
    final st = _statement;
    final sections = ((st?['sections'] as List?) ?? []).cast<Map>();
    if (sections.isEmpty) {
      return [_card('كشف الحساب', [const Text('لا توجد حركات')])];
    }
    final out = <Widget>[];
    for (final s in sections) {
      final sec = s.cast<String, dynamic>();
      final rows = ((sec['rows'] as List?) ?? []).cast<Map>();
      final children = <Widget>[
        _line('الرصيد الافتتاحي', fmtMoney(sec['opening_balance']), bold: true),
      ];
      for (final raw in rows) {
        final r = raw.cast<String, dynamic>();
        final rev = r['is_reversal'] == true;
        final date = (r['date'] ?? '').toString();
        final desc = (r['description'] ?? '').toString() + (r['reason'] != null ? ' — ${r['reason']}' : '');
        final details = (r['details_text'] ?? '').toString();
        final debit = (r['debit'] ?? '0.00').toString();
        final credit = (r['credit'] ?? '0.00').toString();
        children.add(Container(
          margin: const EdgeInsets.only(top: 6),
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: rev ? AppColors.danger.withOpacity(0.06) : Colors.grey.shade50,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(children: [
                Text(date.length >= 10 ? date.substring(0, 10) : date, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                const SizedBox(width: 8),
                Expanded(child: Text(desc, style: TextStyle(fontWeight: FontWeight.w600, color: rev ? AppColors.danger : null))),
              ]),
              if (details.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 3),
                  child: Text(details, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                ),
              Row(children: [
                if (debit != '0.00' && debit != '0') Text('مدين ${fmtMoney(debit)}', style: const TextStyle(color: AppColors.danger, fontSize: 12)),
                if (credit != '0.00' && credit != '0') Text('  دائن ${fmtMoney(credit)}', style: const TextStyle(color: AppColors.success, fontSize: 12)),
                const Spacer(),
                Text('الرصيد ${fmtMoney(r['balance'])}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
              ]),
            ],
          ),
        ));
      }
      children.add(const Divider());
      children.add(_line('الرصيد الختامي (${sec['closing_side'] ?? ''})', fmtMoney(sec['closing_balance']), bold: true));
      out.add(_card('كشف ${sec['currency'] ?? ''}', children));
    }
    return out;
  }
}
