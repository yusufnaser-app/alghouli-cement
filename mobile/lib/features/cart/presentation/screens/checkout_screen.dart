import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/widgets/primary_button.dart';
import '../../../addresses/domain/address_model.dart';
import '../../../addresses/presentation/screens/addresses_screen.dart';
import '../../../orders/data/order_service.dart';
import '../../../orders/presentation/screens/order_details_screen.dart';
import '../../data/cart_manager.dart';

class CheckoutScreen extends StatefulWidget {
  const CheckoutScreen({super.key});

  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends State<CheckoutScreen> {
  final _cart = CartManager.instance;
  final _orderService = OrderService();
  final _notesController = TextEditingController();

  Address? _selectedAddress;
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _notesController.dispose();
    super.dispose();
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
    if (_selectedAddress == null) {
      setState(() => _error = 'يرجى اختيار عنوان التسليم');
      return;
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
        addressId: _selectedAddress!.id,
        items: items,
        notes: _notesController.text.trim(),
      );

      _cart.clear();

      if (!mounted) return;
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) => OrderDetailsScreen(orderId: order['id']),
        ),
      );

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('تم إنشاء الطلب ${order['order_number']}'),
          backgroundColor: AppColors.success,
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

              // عنوان التسليم
              const Text('عنوان التسليم',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
              const SizedBox(height: 12),
              InkWell(
                onTap: _pickAddress,
                borderRadius: BorderRadius.circular(12),
                child: Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: _selectedAddress != null
                          ? AppColors.primary
                          : AppColors.divider,
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
                            const Icon(Icons.location_on,
                                color: AppColors.primary),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(_selectedAddress!.label,
                                      style: const TextStyle(
                                          fontWeight: FontWeight.bold)),
                                  const SizedBox(height: 4),
                                  Text(
                                    _selectedAddress!.fullAddress,
                                    style: const TextStyle(
                                        fontSize: 12,
                                        color: AppColors.textSecondary),
                                  ),
                                ],
                              ),
                            ),
                            const Icon(Icons.edit,
                                size: 18, color: AppColors.textSecondary),
                          ],
                        ),
                ),
              ),
              const SizedBox(height: 24),

              // ملاحظات
              const Text('ملاحظات للسائق (اختياري)',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
              const SizedBox(height: 12),
              TextField(
                controller: _notesController,
                maxLines: 3,
                decoration: const InputDecoration(
                  hintText: 'مثال: التسليم صباحًا',
                ),
              ),
              const SizedBox(height: 24),

              // ملخص الطلب
              const Text('ملخص الطلب',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Column(
                  children: [
                    ..._cart.items.map((item) => Padding(
                          padding: const EdgeInsets.symmetric(vertical: 6),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Expanded(
                                child: Text(
                                  '${item.name} × ${item.quantity}',
                                  style: const TextStyle(fontSize: 13),
                                ),
                              ),
                              Text('${_fmt(item.lineTotal)} ريال',
                                  style: const TextStyle(
                                      fontWeight: FontWeight.bold)),
                            ],
                          ),
                        )),
                    const Divider(height: 24),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('الإجمالي الفرعي'),
                        Text('${_fmt(_cart.subtotal)} ريال',
                            style: const TextStyle(fontWeight: FontWeight.bold)),
                      ],
                    ),
                    const SizedBox(height: 8),
                    const Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('النقل',
                            style: TextStyle(color: AppColors.textSecondary)),
                        Text('يُحسب تلقائيًا',
                            style: TextStyle(color: AppColors.textSecondary)),
                      ],
                    ),
                    const Divider(height: 24),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('الإجمالي المتوقع',
                            style: TextStyle(
                                fontSize: 16, fontWeight: FontWeight.bold)),
                        Text('${_fmt(_cart.subtotal)} + نقل',
                            style: const TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                                color: AppColors.primary)),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),

              // زر الإرسال
              PrimaryButton(
                text: 'تأكيد الطلب',
                icon: Icons.check_circle,
                isLoading: _loading,
                onPressed: _submit,
              ),
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );
  }
}
