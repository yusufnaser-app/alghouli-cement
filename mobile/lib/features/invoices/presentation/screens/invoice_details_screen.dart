import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/invoice_service.dart';

class InvoiceDetailsScreen extends StatefulWidget {
  final String invoiceId;
  const InvoiceDetailsScreen({super.key, required this.invoiceId});

  @override
  State<InvoiceDetailsScreen> createState() => _InvoiceDetailsScreenState();
}

class _InvoiceDetailsScreenState extends State<InvoiceDetailsScreen> {
  final _service = InvoiceService();
  Map<String, dynamic>? _invoice;
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
      final inv = await _service.invoiceDetails(widget.invoiceId);
      setState(() => _invoice = inv);
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
      appBar: AppBar(title: const Text('الفاتورة')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : SingleChildScrollView(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      // الترويسة
                      Container(
                        padding: const EdgeInsets.all(24),
                        decoration: BoxDecoration(
                          color: AppColors.primary,
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: Column(
                          children: [
                            const Icon(Icons.business,
                                size: 60, color: Colors.white),
                            const SizedBox(height: 12),
                            const Text('مؤسسة الغولي',
                                style: TextStyle(
                                    fontSize: 22,
                                    fontWeight: FontWeight.bold,
                                    color: Colors.white)),
                            const SizedBox(height: 4),
                            const Text('لبيع وتسويق الأسمنت إلكترونيًا',
                                style: TextStyle(
                                    fontSize: 12, color: Colors.white70)),
                            const SizedBox(height: 16),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 16, vertical: 8),
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(20),
                              ),
                              child: Text(
                                _invoice!['invoice_number'] ?? '',
                                style: const TextStyle(
                                    fontWeight: FontWeight.bold,
                                    color: AppColors.primary),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 20),
                      _section('معلومات الفاتورة', [
                        _row('رقم الطلب',
                            _invoice!['order_number'] ?? ''),
                        _row('التاريخ',
                            _invoice!['issued_at']?.toString().substring(0, 10) ?? ''),
                      ]),
                      _section('بيانات العميل', [
                        _row('الاسم', _invoice!['customer_name'] ?? ''),
                        _row('الهاتف', _invoice!['customer_phone'] ?? ''),
                        _row('المحافظة', _invoice!['governorate'] ?? ''),
                        _row('المنطقة', _invoice!['area'] ?? ''),
                      ]),
                      _section(
                        'البنود',
                        (_invoice!['items'] as List? ?? [])
                            .map<Widget>((item) => Padding(
                                  padding:
                                      const EdgeInsets.symmetric(vertical: 8),
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(item['product_name'] ?? '',
                                          style: const TextStyle(
                                              fontWeight: FontWeight.bold,
                                              fontSize: 13)),
                                      const SizedBox(height: 4),
                                      Row(
                                        mainAxisAlignment:
                                            MainAxisAlignment.spaceBetween,
                                        children: [
                                          Text(
                                            '${item['quantity']} × ${_fmt(item['unit_price'])}',
                                            style: const TextStyle(
                                                fontSize: 11,
                                                color:
                                                    AppColors.textSecondary),
                                          ),
                                          Text(
                                            '${_fmt(item['line_total'])} ريال',
                                            style: const TextStyle(
                                                fontWeight: FontWeight.bold),
                                          ),
                                        ],
                                      ),
                                    ],
                                  ),
                                ))
                            .toList(),
                      ),
                      _section('الإجماليات', [
                        _row('الإجمالي الفرعي',
                            '${_fmt(_invoice!['subtotal'])} ريال'),
                        _row('الخصم',
                            '${_fmt(_invoice!['discount_amount'])} ريال'),
                        _row('النقل',
                            '${_fmt(_invoice!['shipping_amount'])} ريال'),
                        const Divider(height: 20),
                        _row('الإجمالي',
                            '${_fmt(_invoice!['total_amount'])} ريال',
                            bold: true,
                            color: AppColors.primary),
                        _row('المدفوع',
                            '${_fmt(_invoice!['paid_amount'])} ريال'),
                        _row('المتبقي',
                            '${_fmt(_invoice!['remaining_amount'])} ريال',
                            color: AppColors.danger),
                      ]),
                    ],
                  ),
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

  Widget _row(String label, String value,
      {bool bold = false, Color? color}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label,
              style: const TextStyle(color: AppColors.textSecondary)),
          Text(value,
              style: TextStyle(
                fontWeight: bold ? FontWeight.bold : FontWeight.normal,
                fontSize: bold ? 16 : 14,
                color: color,
              )),
        ],
      ),
    );
  }
}
