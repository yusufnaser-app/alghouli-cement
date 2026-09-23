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
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('تأكيد وصولك للمصنع؟'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('إلغاء')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('تأكيد')),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _updating = true);
    try {
      await _service.enterFactory(widget.faxId);
      await _load();
      if (mounted) _showMsg('✅ تم تسجيل وصولك', AppColors.success);
    } catch (e) {
      if (mounted) _showMsg(e.toString().replaceFirst('Exception: ', ''), AppColors.danger);
    } finally {
      if (mounted) setState(() => _updating = false);
    }
  }

  Future<void> _confirmLoading() async {
    final ctrl = TextEditingController(text: (_fax?['requested_quantity'] ?? '').toString());
    final qty = await showDialog<String>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('تأكيد التحميل'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('الكمية المطلوبة: ${_fax?['requested_quantity']} كيس',
                style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
            const SizedBox(height: 12),
            const Text('الكمية المحملة فعليًا:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
            const SizedBox(height: 8),
            TextField(
              controller: ctrl,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(prefixIcon: Icon(Icons.inventory_2), hintText: '500'),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('إلغاء')),
          TextButton(onPressed: () => Navigator.pop(context, ctrl.text.trim()),
              child: const Text('تأكيد', style: TextStyle(color: AppColors.success, fontWeight: FontWeight.bold))),
        ],
      ),
    );
    if (qty == null) return;
    final q = double.tryParse(qty);
    if (q == null || q <= 0) {
      _showMsg('الكمية غير صحيحة', AppColors.danger);
      return;
    }
    setState(() => _updating = true);
    try {
      await _service.recordLoading(widget.faxId, q);
      await _load();
      if (mounted) _showMsg('✅ تم تسجيل التحميل', AppColors.success);
    } catch (e) {
      if (mounted) _showMsg(e.toString().replaceFirst('Exception: ', ''), AppColors.danger);
    } finally {
      if (mounted) setState(() => _updating = false);
    }
  }

  void _showMsg(String msg, Color color) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), backgroundColor: color),
    );
  }

  String _statusAr(String s) => {
        'REQUESTED': 'بانتظار الاعتماد',
        'APPROVED': 'معتمد',
        'ISSUED': 'صادر — توجه للمصنع',
        'USED': 'تم التحميل',
        'CANCELLED': 'ملغي',
      }[s] ?? s;

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
      appBar: AppBar(
        title: const Text('تفاصيل الفاكس'),
        actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: _load)],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : _fax == null
                  ? const Center(child: Text('غير موجود'))
                  : _buildContent(),
    );
  }

  Widget _buildContent() {
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
                  status == 'USED' ? Icons.done_all : status == 'ISSUED' ? Icons.description : Icons.hourglass_top,
                  color: color,
                  size: 40,
                ),
                const SizedBox(height: 8),
                Text(_statusAr(status),
                    style: TextStyle(color: color, fontSize: 18, fontWeight: FontWeight.bold)),
              ],
            ),
          ),
          const SizedBox(height: 16),
          _section('بيانات الرحلة', [
            _row(Icons.factory, 'المصنع', f['factory_name'] ?? '—'),
            _row(Icons.local_shipping, 'القاطرة', f['plate_number'] ?? '—'),
            _row(Icons.inventory_2, 'الكمية المطلوبة', '${_fmt(f['requested_quantity'])} كيس'),
            if (f['fax_number'] != null) _row(Icons.description, 'رقم الفاكس', f['fax_number'].toString()),
            if (f['route'] != null) _row(Icons.route, 'خط السير', f['route'].toString()),
            if (f['transport_rate'] != null)
              _row(Icons.payments, 'سعر النقل',
                  '${_fmt(f['transport_rate'])} ريال / ${f['transport_rate_unit'] == 'ton' ? 'طن' : 'كيس'}'),
          ]),
          const SizedBox(height: 24),
          if (status == 'ISSUED' && f['factory_entered_at'] == null)
            _actionButton('وصلت للمصنع', Icons.login, AppColors.info, _updating ? null : _enterFactory),
          if (status == 'ISSUED' && f['factory_entered_at'] != null)
            _actionButton('تم التحميل', Icons.inventory, AppColors.success, _updating ? null : _confirmLoading),
          if (status == 'USED')
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: AppColors.success.withOpacity(0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Column(
                children: [
                  Icon(Icons.check_circle, color: AppColors.success, size: 50),
                  SizedBox(height: 12),
                  Text('تمت الرحلة بنجاح',
                      style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppColors.success)),
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
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.divider),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: AppColors.primary)),
          const Divider(height: 20),
          ...children,
        ],
      ),
    );
  }

  Widget _row(IconData icon, String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Icon(icon, size: 16, color: AppColors.textSecondary),
          const SizedBox(width: 8),
          SizedBox(width: 110, child: Text(label, style: const TextStyle(fontSize: 13, color: AppColors.textSecondary))),
          Expanded(child: Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600))),
        ],
      ),
    );
  }

  Widget _actionButton(String label, IconData icon, Color color, VoidCallback? onTap) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: SizedBox(
        width: double.infinity,
        height: 56,
        child: ElevatedButton.icon(
          onPressed: onTap,
          icon: Icon(icon, size: 22),
          label: Text(label, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
          style: ElevatedButton.styleFrom(
            backgroundColor: color,
            foregroundColor: Colors.white,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        ),
      ),
    );
  }
}
