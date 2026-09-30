import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/widgets/primary_button.dart';
import '../../../orders/data/order_service.dart';
import '../../../wallet/data/wallet_service.dart';
import 'upload_receipt_screen.dart';

/// تظهر بعد أن يحدد الموظف سعر الطلب (الحالة PENDING_PAYMENT_METHOD) —
/// هنا يرى العميل السعر الرسمي لأول مرة ويختار طريقة السداد (بند 23-24).
class ChoosePaymentScreen extends StatefulWidget {
  final String orderId;
  final double totalAmount;

  const ChoosePaymentScreen({
    super.key,
    required this.orderId,
    required this.totalAmount,
  });

  @override
  State<ChoosePaymentScreen> createState() => _ChoosePaymentScreenState();
}

class _ChoosePaymentScreenState extends State<ChoosePaymentScreen> {
  final _orderService = OrderService();
  final _walletService = WalletService();
  final _partialController = TextEditingController();

  String _paymentTerms = 'cash';
  CustomerSummary? _summary;
  bool _loading = false;
  bool _loadingSummary = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _partialController.text = (widget.totalAmount / 2).toStringAsFixed(0);
    _loadSummary();
  }

  @override
  void dispose() {
    _partialController.dispose();
    super.dispose();
  }

  Future<void> _loadSummary() async {
    try {
      final s = await _walletService.getSummary();
      if (mounted) setState(() => _summary = s);
    } catch (_) {
      // غير حرج: الشاشة تعمل بدون عرض الرصيد الحالي
    }
    if (mounted) setState(() => _loadingSummary = false);
  }

  String _fmt(dynamic n) {
    final v = double.tryParse(n.toString()) ?? 0;
    return v.toStringAsFixed(0).replaceAllMapped(
          RegExp(r'(\d)(?=(\d{3})+(?!\d))'),
          (m) => '${m[1]},',
        );
  }

  Future<void> _submit() async {
    double? paidNow;
    if (_paymentTerms == 'partial') {
      paidNow = double.tryParse(_partialController.text.trim());
      if (paidNow == null || paidNow <= 0 || paidNow >= widget.totalAmount) {
        setState(() => _error = 'أدخل مبلغًا صحيحًا أقل من الإجمالي');
        return;
      }
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final result = await _orderService.choosePayment(
        orderId: widget.orderId,
        paymentTerms: _paymentTerms,
        paidAmountNow: paidNow,
      );
      if (!mounted) return;

      final status = result['status'] as String?;
      if (status == 'PENDING_PAYMENT') {
        // فوري أو جزئي: يذهب لرفع إيصال المبلغ المطلوب سداده الآن
        final amountToPay = _paymentTerms == 'partial' ? paidNow! : widget.totalAmount;
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(
            builder: (_) => UploadReceiptScreen(
              orderId: widget.orderId,
              totalAmount: amountToPay,
            ),
          ),
        );
      } else {
        // آجل: بانتظار موافقة المدير — لا حاجة لرفع إيصال الآن
        Navigator.pop(context, true);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('تم إرسال طلب السداد الآجل — بانتظار موافقة المدير'),
            backgroundColor: AppColors.warning,
            duration: Duration(seconds: 4),
          ),
        );
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isCredit = _paymentTerms != 'cash';
    final currentBalance = _summary?.currentBalance ?? 0;
    final creditLimit = _summary?.creditLimit ?? 0;

    return Scaffold(
      appBar: AppBar(title: const Text('اختيار طريقة السداد')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // قيمة الطلب الرسمية — تظهر للعميل هنا لأول مرة
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: AppColors.success.withOpacity(0.08),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppColors.success, width: 2),
                ),
                child: Column(
                  children: [
                    const Text('قيمة طلبك',
                        style: TextStyle(fontSize: 13, color: AppColors.textSecondary)),
                    const SizedBox(height: 6),
                    Text('${_fmt(widget.totalAmount)} ريال',
                        style: const TextStyle(
                            fontSize: 26,
                            fontWeight: FontWeight.bold,
                            color: AppColors.success)),
                  ],
                ),
              ),
              const SizedBox(height: 24),

              if (_error != null) ...[
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppColors.danger.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.error_outline, color: AppColors.danger),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(_error!,
                            style: const TextStyle(color: AppColors.danger)),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
              ],

              const Text('طريقة السداد',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
              const SizedBox(height: 12),
              _option('cash', '💵 دفع فوري', 'رفع إيصال التحويل الآن', Icons.payments),
              _option('partial', '➗ دفع جزئي', 'تدفع جزءًا الآن والباقي آجل', Icons.percent),
              _option('credit', '📝 دفع آجل', 'يحتاج موافقة المدير', Icons.schedule),

              if (_paymentTerms == 'partial') ...[
                const SizedBox(height: 12),
                TextField(
                  controller: _partialController,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(
                    labelText: 'المبلغ المدفوع الآن (ريال)',
                    prefixIcon: Icon(Icons.money),
                  ),
                ),
              ],

              if (isCredit && !_loadingSummary && _summary != null) ...[
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppColors.divider),
                  ),
                  child: Column(
                    children: [
                      _row('رصيدك الحالي', '${_fmt(currentBalance)} ر.ي'),
                      _row('الحد الائتماني',
                          creditLimit == 0 ? 'غير محدود' : '${_fmt(creditLimit)} ر.ي'),
                    ],
                  ),
                ),
              ],

              const SizedBox(height: 24),
              PrimaryButton(
                text: _paymentTerms == 'credit' ? 'إرسال طلب آجل' : 'متابعة',
                icon: _paymentTerms == 'credit' ? Icons.send : Icons.check_circle,
                isLoading: _loading,
                onPressed: _submit,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _option(String value, String title, String subtitle, IconData icon) {
    final selected = _paymentTerms == value;
    return InkWell(
      onTap: () => setState(() => _paymentTerms = value),
      borderRadius: BorderRadius.circular(12),
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: selected ? AppColors.primary.withOpacity(0.08) : Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: selected ? AppColors.primary : AppColors.divider,
            width: 2,
          ),
        ),
        child: Row(
          children: [
            Icon(icon, color: selected ? AppColors.primary : AppColors.textSecondary),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      style: TextStyle(
                          fontWeight: FontWeight.bold,
                          color: selected ? AppColors.primary : null)),
                  Text(subtitle,
                      style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
                ],
              ),
            ),
            if (selected) const Icon(Icons.check_circle, color: AppColors.primary),
          ],
        ),
      ),
    );
  }

  Widget _row(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: AppColors.textSecondary)),
          Text(value, style: const TextStyle(fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }
}
