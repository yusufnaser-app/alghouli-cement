import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/order_service.dart';
import '../../../payments/presentation/screens/upload_receipt_screen.dart';

class OrderDetailsScreen extends StatefulWidget {
  final String orderId;
  const OrderDetailsScreen({super.key, required this.orderId});

  @override
  State<OrderDetailsScreen> createState() => _OrderDetailsScreenState();
}

class _OrderDetailsScreenState extends State<OrderDetailsScreen> {
  final _service = OrderService();
  Map<String, dynamic>? _order;
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
      final order = await _service.orderDetails(widget.orderId);
      setState(() => _order = order);
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

  String _statusAr(String s) {
    const map = {
      'PENDING_PAYMENT': 'بانتظار الدفع',
      'RECEIPT_UPLOADED': 'تم رفع الإيصال',
      'PENDING_PAYMENT_REVIEW': 'بانتظار مراجعة الدفع',
      'PAYMENT_APPROVED': 'تم اعتماد الدفع',
      'PREPARING': 'جاري التجهيز',
      'DRIVER_ASSIGNED': 'تم تعيين السائق',
      'LOADED': 'تم التحميل',
      'IN_TRANSIT': 'في الطريق',
      'DELIVERED': 'تم التسليم',
      'COMPLETED': 'مكتمل',
      'CANCELLED': 'ملغي',
      'PAYMENT_REJECTED': 'الدفع مرفوض',
    };
    return map[s] ?? s;
  }

  Color _statusColor(String s) {
    if (s == 'PENDING_PAYMENT' || s == 'PENDING_PAYMENT_REVIEW' ||
        s == 'RECEIPT_UPLOADED') {
      return AppColors.statusPending;
    }
    if (s == 'PAYMENT_APPROVED' || s == 'PREPARING' ||
        s == 'DRIVER_ASSIGNED' || s == 'LOADED') {
      return AppColors.statusApproved;
    }
    if (s == 'IN_TRANSIT') return AppColors.statusInTransit;
    if (s == 'DELIVERED' || s == 'COMPLETED') return AppColors.statusCompleted;
    if (s == 'CANCELLED') return AppColors.statusCancelled;
    if (s == 'PAYMENT_REJECTED') return AppColors.statusRejected;
    return AppColors.textSecondary;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('تفاصيل الطلب'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : _buildContent(),
    );
  }

  Widget _buildContent() {
    final o = _order!;
    final status = o['status'] ?? '';
    final canPay = status == 'PENDING_PAYMENT';
    final items = (o['items'] as List?) ?? [];

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // رقم الطلب والحالة
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: _statusColor(status).withOpacity(0.1),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: _statusColor(status), width: 2),
            ),
            child: Column(
              children: [
                Text(o['order_number'] ?? '',
                    style: const TextStyle(
                        fontSize: 18, fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 16, vertical: 6),
                  decoration: BoxDecoration(
                    color: _statusColor(status),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(_statusAr(status),
                      style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.bold)),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // العنوان
          _section('عنوان التسليم', [
            _row('المحافظة', o['governorate'] ?? ''),
            _row('المنطقة', o['area'] ?? ''),
            _row('العنوان', o['address_text'] ?? ''),
          ]),

          // المنتجات
          _section(
            'المنتجات',
            items
                .map<Widget>((item) => Padding(
                      padding: const EdgeInsets.symmetric(vertical: 6),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(item['product_name'] ?? '',
                                    style: const TextStyle(
                                        fontWeight: FontWeight.bold,
                                        fontSize: 13)),
                                Text(
                                  '${item['quantity']} ${item['unit'] == 'ton' ? 'طن' : 'كيس'} × ${_fmt(item['unit_price'])}',
                                  style: const TextStyle(
                                      fontSize: 11,
                                      color: AppColors.textSecondary),
                                ),
                              ],
                            ),
                          ),
                          Text('${_fmt(item['line_total'])} ريال',
                              style:
                                  const TextStyle(fontWeight: FontWeight.bold)),
                        ],
                      ),
                    ))
                .toList(),
          ),

          // الملخص المالي
          _section('الملخص المالي', [
            _row('الإجمالي الفرعي', '${_fmt(o['subtotal'])} ريال'),
            _row('الخصم', '${_fmt(o['discount_amount'])} ريال'),
            _row('النقل', '${_fmt(o['shipping_amount'])} ريال'),
            const Divider(height: 16),
            _row('الإجمالي', '${_fmt(o['total_amount'])} ريال', bold: true),
            _row('المدفوع', '${_fmt(o['paid_amount'])} ريال'),
            _row('المتبقي', '${_fmt(o['remaining_amount'])} ريال',
                color: AppColors.danger),
          ]),

          if (o['notes'] != null && o['notes'].toString().isNotEmpty)
            _section('ملاحظات', [
              Text(o['notes'].toString()),
            ]),

          const SizedBox(height: 24),

          // زر الدفع
          if (canPay)
            ElevatedButton.icon(
              onPressed: () async {
                final result = await Navigator.push<bool>(
                  context,
                  MaterialPageRoute(
                    builder: (_) => UploadReceiptScreen(
                      orderId: widget.orderId,
                      totalAmount: double.tryParse(o['total_amount'].toString()) ?? 0,
                    ),
                  ),
                );
                if (result == true) _load();
              },
              icon: const Icon(Icons.upload_file),
              label: const Text('رفع إيصال الدفع'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.white,
                minimumSize: const Size(double.infinity, 56),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _section(String title, List<Widget> children) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
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

  Widget _row(String label, String value, {bool bold = false, Color? color}) {
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
