import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/invoice_service.dart';
import 'invoice_details_screen.dart';

class InvoicesScreen extends StatefulWidget {
  const InvoicesScreen({super.key});

  @override
  State<InvoicesScreen> createState() => _InvoicesScreenState();
}

class _InvoicesScreenState extends State<InvoicesScreen> {
  final _service = InvoiceService();
  List<Map<String, dynamic>> _invoices = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final list = await _service.myInvoices();
      setState(() => _invoices = list);
    } catch (e) {
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      setState(() => _loading = false);
    }
  }

  String _fmt(dynamic n) {
    final v = double.tryParse(n.toString()) ?? 0;
    return v.toStringAsFixed(0).replaceAllMapped(
          RegExp(r'(\d)(?=(\d{3})+(?!\d))'),
          (m) => '${m[1]},',
        );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('الفواتير'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : _invoices.isEmpty
                  ? const Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.receipt,
                              size: 80, color: AppColors.textSecondary),
                          SizedBox(height: 16),
                          Text('لا توجد فواتير',
                              style: TextStyle(
                                  fontSize: 18,
                                  color: AppColors.textSecondary)),
                        ],
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _invoices.length,
                        itemBuilder: (context, i) {
                          final inv = _invoices[i];
                          return InkWell(
                            onTap: () {
                              Navigator.push(
                                context,
                                MaterialPageRoute(
                                  builder: (_) =>
                                      InvoiceDetailsScreen(invoiceId: inv['id']),
                                ),
                              );
                            },
                            borderRadius: BorderRadius.circular(12),
                            child: Container(
                              margin: const EdgeInsets.only(bottom: 12),
                              padding: const EdgeInsets.all(16),
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(12),
                                border:
                                    Border.all(color: AppColors.divider),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    mainAxisAlignment:
                                        MainAxisAlignment.spaceBetween,
                                    children: [
                                      Text(inv['invoice_number'] ?? '',
                                          style: const TextStyle(
                                              fontWeight: FontWeight.bold,
                                              color: AppColors.primary)),
                                      Text(
                                        inv['issued_at']
                                                ?.toString()
                                                .substring(0, 10) ??
                                            '',
                                        style: const TextStyle(
                                            fontSize: 12,
                                            color: AppColors.textSecondary),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 8),
                                  Text(
                                    'طلب: ${inv['order_number'] ?? ''}',
                                    style: const TextStyle(fontSize: 12),
                                  ),
                                  const Divider(height: 20),
                                  Row(
                                    mainAxisAlignment:
                                        MainAxisAlignment.spaceBetween,
                                    children: [
                                      const Text('الإجمالي',
                                          style: TextStyle(fontSize: 12)),
                                      Text('${_fmt(inv['total_amount'])} ريال',
                                          style: const TextStyle(
                                              fontWeight: FontWeight.bold,
                                              color: AppColors.primary)),
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
