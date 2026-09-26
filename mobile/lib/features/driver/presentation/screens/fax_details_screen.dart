import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/driver_service.dart';

class FaxDetailsScreen extends StatefulWidget {
  final String faxId;
  final Map<String, dynamic>? initialData;

  const FaxDetailsScreen({super.key, required this.faxId, this.initialData});

  @override
  State<FaxDetailsScreen> createState() => _FaxDetailsScreenState();
}

class _FaxDetailsScreenState extends State<FaxDetailsScreen> {
  final _service = DriverService();
  Map<String, dynamic>? _fax;
  bool _loading = true;
  String? _error;
  bool _updating = false;

  @override
  void initState() {
    super.initState();
    _fax = widget.initialData;
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await _service.faxDetails(widget.faxId);
      setState(() => _fax = res);
    } catch (e) {
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _enterFactory() async {
    final ok = await _confirm('تأكيد وصولك للمصنع؟');
    if (!ok) return;
    setState(() => _updating = true);
    try {
      await _service.enterFactory(widget.faxId);
      await _load();
      if (mounted) _msg('تم تسجيل وصولك للمصنع', AppColors.success);
    } catch (e) {
      if (mounted) _msg(e.toString().replaceFirst('Exception: ', ''), AppColors.danger);
    } finally {
      if (mounted) setState(() => _updating = false);
    }
  }

  Future<void> _confirmLoading() async {
    final ctrl = TextEditingController(
      text: (_fax?['requested_quantity'] ?? '').toString().split('.').first,
    );

    final result = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Row(
          children: [
            Icon(Icons.check_circle, color: AppColors.success),
            SizedBox(width: 8),
            Text('تأكيد التحميل'),
          ],
        ),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.lightBlue,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('الكمية المطلوبة',
                        style: TextStyle(fontSize: 12)),
                    Text('${_fax?['requested_quantity']} كيس',
                        style: const TextStyle(
                            fontWeight: FontWeight.bold, fontSize: 13)),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              const Text('الكمية المحملة فعليًا:',
                  style: TextStyle(fontSize: 12, color: AppColors.textSecondary)),
              const SizedBox(height: 6),
              TextField(
                controller: ctrl,
                keyboardType: TextInputType.number,
                autofocus: true,
                decoration: const InputDecoration(
                  prefixIcon: Icon(Icons.inventory_2),
                  suffixText: 'كيس',
                  hintText: '980',
                ),
              ),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppColors.warning.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Row(
                  children: [
                    Icon(Icons.info_outline, color: AppColors.warning, size: 16),
                    SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        'سيتم تسجيل الكمية الفعلية وإبلاغ المؤسسة',
                        style: TextStyle(fontSize: 11),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('إلغاء'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.success,
              foregroundColor: Colors.white,
            ),
            child: const Text('تأكيد تم التحميل'),
          ),
        ],
      ),
    );

    if (result != true) return;

    final qty = double.tryParse(ctrl.text.trim());
    if (qty == null || qty <= 0) {
      _msg('الكمية غير صحيحة', AppColors.danger);
      return;
    }

    setState(() => _updating = true);
    try {
      final r = await _service.confirmLoading(widget.faxId, qty);
      await _load();

      if (!mounted) return;

      if (r['has_discrepancy'] == true) {
        _showDiscrepancyDialog(r);
      } else {
        _msg('تم تسجيل التحميل بنجاح — انتظر تحديد خط السير', AppColors.success);
      }
    } catch (e) {
      if (mounted) _msg(e.toString().replaceFirst('Exception: ', ''), AppColors.danger);
    } finally {
      if (mounted) setState(() => _updating = false);
    }
  }

  void _showDiscrepancyDialog(Map<String, dynamic> r) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Row(
          children: [
            Icon(Icons.warning_amber, color: AppColors.warning),
            SizedBox(width: 8),
            Text('يوجد اختلاف في الكمية'),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _dialogRow('المطلوبة', '${r['requested_quantity']} كيس', null),
            const SizedBox(height: 8),
            _dialogRow('المحملة', '${r['loaded_quantity']} كيس', AppColors.success),
            const Divider(height: 20),
            _dialogRow(
              'الفرق',
              '${r['discrepancy']} كيس',
              (r['discrepancy'] as num) < 0 ? AppColors.danger : AppColors.warning,
            ),
            const SizedBox(height: 12),
            const Text(
              'تم إبلاغ المؤسسة بالاختلاف للمراجعة',
              style: TextStyle(fontSize: 11, color: AppColors.textSecondary),
              textAlign: TextAlign.center,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('حسنًا'),
          ),
        ],
      ),
    );
  }

  Widget _dialogRow(String label, String value, Color? color) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: const TextStyle(fontSize: 13)),
        Text(value,
            style: TextStyle(
                fontSize: 14, fontWeight: FontWeight.bold, color: color)),
      ],
    );
  }

  Future<bool> _confirm(String msg) async {
    return await showDialog<bool>(
          context: context,
          builder: (_) => AlertDialog(
            title: Text(msg),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('إلغاء'),
              ),
              TextButton(
                onPressed: () => Navigator.pop(context, true),
                child: const Text('تأكيد'),
              ),
            ],
          ),
        ) ??
        false;
  }

  void _msg(String msg, Color color) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), backgroundColor: color),
    );
  }

  String _statusAr(String s) {
    return {
      'REQUESTED': 'بانتظار الاعتماد',
      'APPROVED': 'معتمد',
      'ISSUED': 'صادر — توجه للمصنع',
      'USED': 'تم التحميل — بانتظار خط السير',
      'CANCELLED': 'ملغي',
    }[s] ?? s;
  }

  Color _statusColor(String s) {
    if (s == 'REQUESTED') return AppColors.statusPending;
    if (s == 'APPROVED') return AppColors.info;
    if (s == 'ISSUED') return AppColors.accent;
    if (s == 'USED') return AppColors.success;
    return AppColors.textSecondary;
  }

  String _fmt(dynamic n) {
    final v = double.tryParse(n?.toString() ?? '0') ?? 0;
    return v.toStringAsFixed(0).replaceAllMapped(
          RegExp(r'(\d)(?=(\d{3})+(?!\d))'),
          (m) => '${m[1]},',
        );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('تفاصيل الرحلة'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : _fax == null
                  ? const Center(child: Text('غير موجود'))
                  : _content(),
    );
  }

  Widget _content() {
    final f = _fax!;
    final status = f['status'] ?? '';
    final color = _statusColor(status);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: color.withOpacity(0.1),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: color, width: 2),
            ),
            child: Column(
              children: [
                Icon(
                  status == 'USED'
                      ? Icons.done_all
                      : status == 'ISSUED'
                          ? Icons.description
                          : status == 'APPROVED'
                              ? Icons.check_circle_outline
                              : Icons.hourglass_top,
                  color: color,
                  size: 44,
                ),
                const SizedBox(height: 10),
                Text(_statusAr(status),
                    style: TextStyle(
                        color: color,
                        fontSize: 16,
                        fontWeight: FontWeight.bold),
                    textAlign: TextAlign.center),
              ],
            ),
          ),
          const SizedBox(height: 16),
          _section('بيانات الرحلة', [
            _row(Icons.factory, 'المصنع', f['factory_name'] ?? '—'),
            _row(Icons.local_shipping, 'القاطرة', f['plate_number'] ?? '—'),
            _row(Icons.inventory_2, 'الكمية المطلوبة',
                '${_fmt(f['requested_quantity'])} كيس'),
            if (f['fax_number'] != null)
              _row(Icons.description, 'رقم الفاكس', f['fax_number'].toString()),
            if (f['loaded_quantity'] != null)
              _row(Icons.check_circle, 'الكمية المحملة',
                  '${_fmt(f['loaded_quantity'])} كيس',
                  color: AppColors.success),
            if (f['quantity_discrepancy'] != null &&
                (double.tryParse(f['quantity_discrepancy'].toString()) ?? 0).abs() > 0.01)
              _row(Icons.warning_amber, 'فرق الكمية',
                  '${_fmt(f['quantity_discrepancy'])} كيس',
                  color: AppColors.warning),
            if (f['route'] != null)
              _row(Icons.route, 'خط السير', f['route'].toString()),
            if (f['transport_rate'] != null)
              _row(Icons.payments, 'سعر النقل',
                  '${_fmt(f['transport_rate'])} ر.ي / ${f['transport_rate_unit'] == 'ton' ? 'طن' : 'كيس'}'),
            if (f['transport_total'] != null)
              _row(Icons.calculate, 'إجمالي النقل',
                  '${_fmt(f['transport_total'])} ر.ي',
                  color: AppColors.success),
          ]),
          const SizedBox(height: 20),
          if (status == 'ISSUED' && f['factory_entered_at'] == null)
            _bigButton('وصلت للمصنع', Icons.login, AppColors.info,
                _updating ? null : _enterFactory),
          if ((status == 'ISSUED' ||
                  (status == 'APPROVED' && f['factory_entered_at'] != null)) &&
              f['used_at'] == null)
            _bigButton('تم التحميل', Icons.inventory, AppColors.success,
                _updating ? null : _confirmLoading),
          if (status == 'USED')
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: AppColors.success.withOpacity(0.1),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.success.withOpacity(0.3)),
              ),
              child: const Column(
                children: [
                  Icon(Icons.check_circle, color: AppColors.success, size: 50),
                  SizedBox(height: 12),
                  Text('تم تسجيل التحميل',
                      style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                          color: AppColors.success)),
                  SizedBox(height: 4),
                  Text('يرجى انتظار تحديد خط السير والعنوان من المؤسسة',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _section(String title, List<Widget> children) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.divider),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title,
              style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                  color: AppColors.primary)),
          const Divider(height: 20),
          ...children,
        ],
      ),
    );
  }

  Widget _row(IconData icon, String label, String value, {Color? color}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Icon(icon, size: 16, color: AppColors.textSecondary),
          const SizedBox(width: 10),
          Expanded(
            flex: 2,
            child: Text(label,
                style: const TextStyle(
                    fontSize: 13, color: AppColors.textSecondary)),
          ),
          Expanded(
            flex: 3,
            child: Text(value,
                style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: color),
                textAlign: TextAlign.end),
          ),
        ],
      ),
    );
  }

  Widget _bigButton(String label, IconData icon, Color color, VoidCallback? onTap) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: SizedBox(
        width: double.infinity,
        height: 58,
        child: ElevatedButton.icon(
          onPressed: onTap,
          icon: Icon(icon, size: 24),
          label: Text(label,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
          style: ElevatedButton.styleFrom(
            backgroundColor: color,
            foregroundColor: Colors.white,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
        ),
      ),
    );
  }
}
