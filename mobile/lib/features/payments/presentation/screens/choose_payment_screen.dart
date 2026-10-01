import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/widgets/primary_button.dart';
import '../../../orders/data/order_service.dart';
import '../../../wallet/data/wallet_service.dart';
import '../data/payment_service.dart';

/// بعد تسعير الطلب يختار العميل طريقة السداد.
/// الدفع التحويلي يسجل: العملة + المبلغ بنفس العملة + رقم العملية فقط.
/// لا يوجد رفع صورة إيصال ولا سعر صرف.
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
  final _paymentService = PaymentService();
  final _walletService = WalletService();

  final _amountController = TextEditingController();
  final _transactionController = TextEditingController();

  String _paymentTerms = 'network_transfer';
  String _currency = 'YER';
  CustomerSummary? _summary;
  bool _loading = false;
  bool _loadingSummary = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _amountController.text = widget.totalAmount.toStringAsFixed(0);
    _loadSummary();
  }

  @override
  void dispose() {
    _amountController.dispose();
    _transactionController.dispose();
    super.dispose();
  }

  Future<void> _loadSummary() async {
    try {
      final s = await _walletService.getSummary();
      if (mounted) setState(() => _summary = s);
    } catch (_) {}
    if (mounted) setState(() => _loadingSummary = false);
  }

  String _fmt(dynamic n) {
    final v = double.tryParse(n.toString()) ?? 0;
    return v.toStringAsFixed(0).replaceAllMapped(
          RegExp(r'(\d)(?=(\d{3})+(?!\d))'),
          (m) => '${m[1]},',
        );
  }

  String _currencyName(String code) {
    switch (code) {
      case 'USD':
        return 'دولار أمريكي';
      case 'SAR':
        return 'ريال سعودي';
      default:
        return 'ريال يمني';
    }
  }

  Future<void> _submit() async {
    if (_paymentTerms == 'on_account') {
      await _choosePaymentOnly();
      return;
    }

    final amount = double.tryParse(_amountController.text.trim());
    if (amount == null || amount <= 0) {
      setState(() => _error = 'أدخل مبلغ السداد بشكل صحيح');
      return;
    }

    final transactionRef = _transactionController.text.trim();
    if (transactionRef.isEmpty) {
      setState(() => _error = 'أدخل رقم الحوالة أو رقم العملية');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      // أولاً نسجل طريقة السداد للطلب.
      final selected = await _orderService.choosePayment(
        orderId: widget.orderId,
        paymentTerms: _paymentTerms,
      );

      if (selected['status'] != 'PENDING_PAYMENT') {
        throw Exception('تعذر تحويل الطلب إلى حالة الدفع');
      }

      final methods = await _paymentService.methods();
      final method = methods.cast<Map<String, dynamic>?>().firstWhere(
            (m) => m?['code']?.toString() == _paymentTerms,
            orElse: () => null,
          );

      if (method == null || method['id'] == null) {
        throw Exception('طريقة الدفع غير متاحة حاليًا');
      }

      final now = DateTime.now();
      final transferDate =
          '${now.year.toString().padLeft(4, '0')}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';

      await _paymentService.submit(
        orderId: widget.orderId,
        methodId: method['id'].toString(),
        amount: amount,
        currency: _currency,
        transferDate: transferDate,
        transactionRef: transactionRef,
      );

      if (!mounted) return;
      Navigator.pop(context, true);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('تم إرسال بيانات السداد ورقم العملية للمراجعة'),
          backgroundColor: AppColors.success,
          duration: Duration(seconds: 4),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _choosePaymentOnly() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final result = await _orderService.choosePayment(
        orderId: widget.orderId,
        paymentTerms: 'on_account',
      );

      if (!mounted) return;
      Navigator.pop(context, true);
      if (result['status'] == 'PENDING_ADMIN_APPROVAL') {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('تم إرسال طلب الدفع تحت الحساب — بانتظار موافقة المؤسسة'),
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
    final isCredit = _paymentTerms == 'on_account';
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
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: AppColors.success.withOpacity(0.08),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppColors.success, width: 2),
                ),
                child: Column(
                  children: [
                    const Text(
                      'قيمة الطلب',
                      style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      '${_fmt(widget.totalAmount)} ريال يمني',
                      style: const TextStyle(
                        fontSize: 26,
                        fontWeight: FontWeight.bold,
                        color: AppColors.success,
                      ),
                    ),
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
                        child: Text(
                          _error!,
                          style: const TextStyle(color: AppColors.danger),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
              ],

              const Text(
                'طريقة السداد',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 12),
              _option(
                'network_transfer',
                '🏦 تحويل عبر شبكة الصرافة',
                'أدخل مبلغ التحويل ورقم العملية فقط',
                Icons.account_balance,
              ),
              _option(
                'e_wallet',
                '📱 محفظة إلكترونية',
                'أدخل مبلغ الإيداع ورقم العملية فقط',
                Icons.account_balance_wallet,
              ),
              _option(
                'on_account',
                '📝 الدفع تحت الحساب',
                'يحتاج مراجعة واعتماد المؤسسة',
                Icons.receipt_long,
              ),

              if (!isCredit) ...[
                const SizedBox(height: 16),
                const Text(
                  'عملة السداد',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  value: _currency,
                  decoration: const InputDecoration(
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.currency_exchange),
                  ),
                  items: const [
                    DropdownMenuItem(value: 'YER', child: Text('ريال يمني (YER)')),
                    DropdownMenuItem(value: 'USD', child: Text('دولار أمريكي (USD)')),
                    DropdownMenuItem(value: 'SAR', child: Text('ريال سعودي (SAR)')),
                  ],
                  onChanged: (v) {
                    if (v == null) return;
                    setState(() {
                      _currency = v;
                      if (v == 'YER') {
                        _amountController.text =
                            widget.totalAmount.toStringAsFixed(0);
                      } else {
                        // لا يوجد تحويل تلقائي؛ العميل يدخل المبلغ بالعملة المختارة.
                        _amountController.clear();
                      }
                    });
                  },
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _amountController,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: InputDecoration(
                    labelText: 'مبلغ السداد (${_currencyName(_currency)})',
                    prefixIcon: const Icon(Icons.payments),
                    border: const OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _transactionController,
                  keyboardType: TextInputType.text,
                  decoration: const InputDecoration(
                    labelText: 'رقم الحوالة / رقم العملية',
                    prefixIcon: Icon(Icons.numbers),
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'لا ترفع صورة إيصال. يكفي إدخال رقم العملية.',
                  style: TextStyle(
                    fontSize: 12,
                    color: AppColors.textSecondary,
                  ),
                ),
              ],

              if (_paymentTerms == 'network_transfer')
                Container(
                  margin: const EdgeInsets.only(top: 8),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: AppColors.info.withOpacity(0.08),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'بيانات التحويل',
                        style: TextStyle(fontWeight: FontWeight.bold),
                      ),
                      SizedBox(height: 6),
                      Text('اسم المستفيد: عمار حسين مقبل مطر الغولي'),
                      SizedBox(height: 4),
                      Text('بعد التحويل أدخل رقم العملية فقط ليتم اعتماد الدفع.'),
                    ],
                  ),
                ),

              if (_paymentTerms == 'e_wallet')
                Container(
                  margin: const EdgeInsets.only(top: 8),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: AppColors.info.withOpacity(0.08),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Text(
                    'المحفظة الإلكترونية: أتمم الإيداع ثم أدخل رقم العملية فقط.',
                  ),
                ),

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
                      _row(
                        'الحد الائتماني',
                        creditLimit == 0 ? 'غير محدود' : '${_fmt(creditLimit)} ر.ي',
                      ),
                    ],
                  ),
                ),
              ],

              const SizedBox(height: 24),
              PrimaryButton(
                text: isCredit ? 'إرسال طلب تحت الحساب' : 'إرسال بيانات السداد',
                icon: isCredit ? Icons.send : Icons.check_circle,
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
            Icon(
              icon,
              color: selected ? AppColors.primary : AppColors.textSecondary,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      color: selected ? AppColors.primary : null,
                    ),
                  ),
                  Text(
                    subtitle,
                    style: const TextStyle(
                      fontSize: 11,
                      color: AppColors.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
            if (selected)
              const Icon(Icons.check_circle, color: AppColors.primary),
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
