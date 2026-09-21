import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/cart_manager.dart';

class CheckoutScreen extends StatelessWidget {
  const CheckoutScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final cart = CartManager.instance;
    return Scaffold(
      appBar: AppBar(title: const Text('إتمام الطلب')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            const Icon(Icons.construction,
                size: 80, color: AppColors.warning),
            const SizedBox(height: 16),
            const Text('قيد التطوير',
                style: TextStyle(
                    fontSize: 22, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Text(
              'سيتم إضافة العنوان ورفع الإيصال قريبًا\nالإجمالي: ${cart.subtotal.toStringAsFixed(0)} ريال',
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppColors.textSecondary),
            ),
          ],
        ),
      ),
    );
  }
}
