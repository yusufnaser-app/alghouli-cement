import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/widgets/primary_button.dart';
import '../../../addresses/domain/address_model.dart';
import '../../../addresses/presentation/screens/addresses_screen.dart';
import '../../../orders/data/order_service.dart';
import '../../../orders/presentation/screens/order_details_screen.dart';
import '../../../wallet/data/wallet_service.dart';
import '../../data/cart_manager.dart';

class CheckoutScreen extends StatefulWidget {
  const CheckoutScreen({super.key});

  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends State<CheckoutScreen> {
  final _cart = CartManager.instance;
  final _orderService = OrderService();
  final _walletService = WalletService();
  final _notesController = TextEditingController();
  final _truckController = TextEditingController();
  final _driverNameController = TextEditingController();
  final _driverPhoneController = TextEditingController();

  Address? _selectedAddress;
  String _deliveryType = 'alghouli_delivery';
  String _paymentTerms = 'cash';
  CustomerSummary? _summary;
  bool _loading = false;
  bool _loadingSummary = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadSummary();
  }

  @override
  void dispose() {
    _notesController.dispose();
    _truckController.dispose();
    _driverNameController.dispose();
    _driverPhoneController.dispose();
    super.dispose();
  }

  Future<void> _loadSummary() async {
    try {
      final s = await _walletService.getSummary();
      setState(() => _summary = s);
    } catch (_) {}
    setState(() => _loadingSummary = false);
  }

  Future<void> _pickAddress() async {
    final result = await Navigator.push<Address>(
      context,
      MaterialPageRoute(
        builder: (_) => const AddressesScreen(selectionMode: true),
      ),
    );
    if (result != null) {
      setState(() => _selectedAddress = result);
    }
  }

  Future<void> _submit() async {
    if (_deliveryType == 'alghouli_delivery' && _selectedAddress == null) {
      setState(() => _error = 'يرجى اختيار عنوان التسليم');
      return;
    }
    if (_deliveryType == 'trader_pickup') {
      if (_truckController.text.trim().isEmpty ||
          _driverNameController.text.trim().isEmpty) {
        setState(() => _error = 'رقم القاطرة واسم السائق مطلوبان');
        return;
      }
    }
    if (_cart.isEmpty) {
      setState(() => _error = 'السلة فارغة');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final items = _cart.items
          .map((e) => {
                'productId': e.productId,
                'quantity': e.quantity,
              })
          .toList();

      final order = await _orderService.createOrder(
        addressId: _selectedAddress?.id,
        items: items,
        notes: _notesController.text.trim(),
        deliveryType: _deliveryType,
        traderTruckPlate: _truckController.text.trim(),
        traderDriverName: _driverNameController.text.trim(),
        traderDriverPhone: _driverPhoneController.text.trim(),
        paymentTerms: _paymentTerms,
      );

      _cart.clear();
      if (!mounted) return;

      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) => OrderDetailsScreen(orderId: order['id']),
        ),
      );

      final msg = _paymentTerms == 'credit'
          ? 'تم إرسال الطلب الآجل — بانتظار موافقة المدير'
          : 'تم إنشاء الطلب ${order['order_number']}';

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(msg),
          backgroundColor: _paymentTerms == 'credit'
              ? AppColors.warning
              : AppColors.success,
          duration: const Duration(seconds: 4),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
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
      appBar: AppBar(title: const Text('إتمام الطلب')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
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

              const Text('نوع التسليم',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
              const SizedBox(height: 12),
              _deliveryOption(
                'alghouli_delivery',
                '🚚 توصيل من الغولي',
                'نوصّل إلى عنوانك',
                Icons.local_shipping,
              ),
              _deliveryOption(
                'trader_pickup',
                '🚛 استلام ذاتي',
                'تستلم من المصنع بقاطرتك',
                Icons.warehouse,
              ),
              const SizedBox(height: 16),

              if (_deliveryType == 'alghouli_delivery') ...[
                const Text('عنوان التسليم',
                    style:
                        TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                const SizedBox(height: 12),
                _addressPicker(),
                const SizedBox(height: 16),
              ],

              if (_deliveryType == 'trader_pickup') ...[
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppColors.info.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Row(
                    children: [
                      Icon(Icons.info_outline, color: AppColors.info),
                      SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'ستستلم الكمية من المصنع بقاطرتك الخاصة. لا توجد أجرة نقل.',
                          style: TextStyle(fontSize: 12),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                const Text('بيانات القاطرة والسائق',
                    style:
                        TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                const SizedBox(height: 12),
                TextField(
                  controller: _truckController,
                  decoration: const InputDecoration(
                    hintText: 'رقم لوحة القاطرة',
                    prefixIcon: Icon(Icons.local_shipping),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _driverNameController,
                  decoration: const InputDecoration(
                    hintText: 'اسم السائق',
                    prefixIcon: Icon(Icons.person),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _driverPhoneController,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(
                    hintText: 'رقم هاتف السائق (اختياري)',
                    prefixIcon: Icon(Icons.phone),
                  ),
                ),
                const SizedBox(height: 16),
              ],

              const Text('ملاحظات (اختياري)',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
              const SizedBox(height: 12),
              TextField(
                controller: _notesController,
                maxLines: 2,
                decoration: const InputDecoration(
                  hintText: 'مثال: التسليم صباحًا',
                ),
              ),
              const SizedBox(height: 24),

              const Text('طريقة الدفع',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
              const SizedBox(height: 12),
              _paymentOption(
                'cash',
                '💵 دفع فوري',
                'رفع إيصال التحويل',
                Icons.payments,
              ),
              _paymentOption(
                'credit',
                '📝 دفع آجل',
                'يحتاج موافقة المدير',
                Icons.schedule,
              ),
              const SizedBox(height: 16),

              _buildSummaryCard(),
              const SizedBox(height: 24),

              PrimaryButton(
                text: _paymentTerms == 'credit'
                    ? 'إرسال طلب آجل'
                    : 'تأكيد الطلب',
                icon: _paymentTerms == 'credit'
                    ? Icons.send
                    : Icons.check_circle,
                isLoading: _loading,
                onPressed: _submit,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _deliveryOption(String value, String title, String subtitle, IconData icon) {
    final selected = _deliveryType == value;
    return InkWell(
      onTap: () => setState(() => _deliveryType = value),
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
            Icon(icon,
                color: selected ? AppColors.primary : AppColors.textSecondary),
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
                      style: const TextStyle(
                          fontSize: 11, color: AppColors.textSecondary)),
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

  Widget _paymentOption(String value, String title, String subtitle, IconData icon) {
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
            Icon(icon,
                color: selected ? AppColors.primary : AppColors.textSecondary),
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
                      style: const TextStyle(
                          fontSize: 11, color: AppColors.textSecondary)),
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

  Widget _addressPicker() {
    return InkWell(
      onTap: _pickAddress,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: _selectedAddress != null ? AppColors.primary : AppColors.divider,
            width: 2,
          ),
        ),
        child: _selectedAddress == null
            ? const Row(
                children: [
                  Icon(Icons.add_location_alt_outlined,
                      color: AppColors.primary),
                  SizedBox(width: 12),
                  Expanded(
                    child: Text('اضغط لاختيار عنوان',
                        style: TextStyle(
                            color: AppColors.primary,
                            fontWeight: FontWeight.bold)),
                  ),
                  Icon(Icons.arrow_forward_ios,
                      size: 14, color: AppColors.textSecondary),
                ],
              )
            : Row(
                children: [
                  const Icon(Icons.location_on, color: AppColors.primary),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(_selectedAddress!.label,
                            style: const TextStyle(
                                fontWeight: FontWeight.bold)),
                        const SizedBox(height: 4),
                        Text(_selectedAddress!.fullAddress,
                            style: const TextStyle(
                                fontSize: 12,
                                color: AppColors.textSecondary)),
                      ],
                    ),
                  ),
                  const Icon(Icons.edit,
                      size: 18, color: AppColors.textSecondary),
                ],
              ),
      ),
    );
  }

  Widget _buildSummaryCard() {
    final subtotal = _cart.subtotal;
    final currentBalance = _summary?.currentBalance ?? 0;
    final afterOrder = currentBalance + subtotal;
    final creditLimit = _summary?.creditLimit ?? 0;
    final isCredit = _paymentTerms == 'credit';

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.divider),
      ),
      child: Column(
        children: [
          _row('قيمة الطلب', '${_fmt(subtotal)} ر.ي'),
          const Divider(height: 24),
          _row('الإجمالي المتوقع', '${_fmt(subtotal)} ر.ي', bold: true),
          if (isCredit && _summary != null) ...[
            const Divider(height: 24),
            _row('رصيدك الحالي', '${_fmt(currentBalance)} ر.ي'),
            _row('بعد هذا الطلب', '${_fmt(afterOrder)} ر.ي'),
            _row('الحد الائتماني', '${_fmt(creditLimit)} ر.ي'),
          ],
        ],
      ),
    );
  }

  Widget _row(String label, String value, {bool bold = false}) {
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
              )),
        ],
      ),
    );
  }
}
