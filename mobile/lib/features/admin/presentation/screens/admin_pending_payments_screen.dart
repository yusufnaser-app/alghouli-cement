import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/admin_service.dart';

class AdminPendingPaymentsScreen extends StatefulWidget {
  const AdminPendingPaymentsScreen({super.key});

  @override
  State<AdminPendingPaymentsScreen> createState() => _State();
}

class _State extends State<AdminPendingPaymentsScreen> {
  final _service = AdminService();
  List<Map<String, dynamic>> _payments = [];
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
      final list = await _service.pendingPayments();
      if (mounted) setState(() { _payments = list; _loading = false; });
    } catch (e) {
      if (mounted) setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  Future<void> _approve(Map p) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('اعتماد الدفعة'),
        content: Text('اعتماد ${p['reference_code']} بمبلغ ${p['amount_transferred']} ${p['payment_currency']}؟'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('إلغاء')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('اعتماد')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await _service.approvePayment(p['id'].toString());
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('تم الاعتماد'), backgroundColor: AppColors.success),
        );
        _load();
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString()), backgroundColor: AppColors.danger),
      );
    }
  }

  Future<void> _reject(Map p) async {
    final ctrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('رفض الدفعة'),
        content: TextField(
          controller: ctrl,
          decoration: const InputDecoration(labelText: 'السبب'),
          maxLines: 3,
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('إلغاء')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('رفض')),
        ],
      ),
    );
    if (ok != true || ctrl.text.trim().length < 3) return;
    try {
      await _service.rejectPayment(p['id'].toString(), ctrl.text.trim());
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('تم الرفض'), backgroundColor: AppColors.warning),
        );
        _load();
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString()), backgroundColor: AppColors.danger),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('الدفعات المعلقة'),
        actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: _load)],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : _payments.isEmpty
                  ? const Center(child: Text('لا توجد دفعات معلقة'))
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.builder(
                        padding: const EdgeInsets.all(12),
                        itemCount: _payments.length,
                        itemBuilder: (_, i) {
                          final p = _payments[i];
                          return Card(
                            margin: const EdgeInsets.only(bottom: 10),
                            child: Padding(
                              padding: const EdgeInsets.all(12),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      Expanded(child: Text(p['reference_code']?.toString() ?? '—',
                                          style: const TextStyle(fontWeight: FontWeight.bold))),
                                      Chip(
                                        label: Text('${p['amount_transferred']} ${p['payment_currency']}',
                                            style: const TextStyle(color: Colors.white, fontSize: 11)),
                                        backgroundColor: AppColors.primary,
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 6),
                                  Text('الطلب: ${p['order_number'] ?? '—'}',
                                      style: const TextStyle(fontSize: 12)),
                                  if (p['transaction_ref'] != null)
                                    Text('رقم العملية: ${p['transaction_ref']}',
                                        style: const TextStyle(fontSize: 12)),
                                  const SizedBox(height: 8),
                                  Row(
                                    children: [
                                      Expanded(
                                        child: ElevatedButton.icon(
                                          onPressed: () => _approve(p),
                                          icon: const Icon(Icons.check, size: 16),
                                          label: const Text('اعتماد'),
                                          style: ElevatedButton.styleFrom(
                                            backgroundColor: AppColors.success,
                                            foregroundColor: Colors.white,
                                          ),
                                        ),
                                      ),
                                      const SizedBox(width: 8),
                                      Expanded(
                                        child: ElevatedButton.icon(
                                          onPressed: () => _reject(p),
                                          icon: const Icon(Icons.close, size: 16),
                                          label: const Text('رفض'),
                                          style: ElevatedButton.styleFrom(
                                            backgroundColor: AppColors.danger,
                                            foregroundColor: Colors.white,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
                    ),
    );
  }
}
