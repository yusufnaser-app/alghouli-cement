import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../cart/data/cart_manager.dart';
import '../../../cart/domain/cart_item.dart';
import '../../../cart/presentation/screens/cart_screen.dart';

class ProductDetailsScreen extends StatefulWidget {
  final Map<String, dynamic> product;
  const ProductDetailsScreen({super.key, required this.product});

  @override
  State<ProductDetailsScreen> createState() => _ProductDetailsScreenState();
}

class _ProductDetailsScreenState extends State<ProductDetailsScreen> {
  int _quantity = 10;

  Map<String, dynamic> get p => widget.product;

  double get _unitPrice {
    final prices = p['prices'] as List?;
    if (prices == null || prices.isEmpty) return 0;
    final individual = prices.firstWhere(
      (e) => e['customer_type'] == 'individual',
      orElse: () => prices.first,
    );
    return double.tryParse(individual['price'].toString()) ?? 0;
  }

  String get _unitAr => p['unit'] == 'ton' ? 'طن' : 'كيس';

  Color get _color => _parseColor(p['category_color'] as String?);

  Color _parseColor(String? hex) {
    if (hex == null || hex.isEmpty) return AppColors.primaryLight;
    try {
      return Color(int.parse('FF${hex.replaceFirst('#', '')}', radix: 16));
    } catch (_) {
      return AppColors.primaryLight;
    }
  }

  String _formatPrice(dynamic n) {
    final v = double.tryParse(n.toString()) ?? 0;
    return v.toStringAsFixed(0).replaceAllMapped(
          RegExp(r'(\d)(?=(\d{3})+(?!\d))'),
          (m) => '${m[1]},',
        );
  }

  void _addToCart() {
    CartManager.instance.addItem(CartItem(
      productId: p['id'],
      name: p['name_ar'] ?? '',
      sourceName: p['source_name'] ?? '',
      categoryCode: p['category_code'] ?? '',
      categoryColor: p['category_color'] ?? '#28A745',
      packagingType: p['packaging_type'] ?? 'bagged',
      unit: p['unit'] ?? 'bag',
      unitPrice: _unitPrice,
      quantity: _quantity,
    ));

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('تمت إضافة $_quantity $_unitAr إلى السلة'),
        backgroundColor: AppColors.success,
        duration: const Duration(seconds: 2),
        action: SnackBarAction(
          label: 'عرض السلة',
          textColor: Colors.white,
          onPressed: () {
            Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const CartScreen()),
            );
          },
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('تفاصيل المنتج'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: _color,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: Colors.black12),
            ),
            child: Column(
              children: [
                Icon(
                  Icons.inventory_2,
                  size: 80,
                  color: p['category_code'] == 'WPC'
                      ? Colors.black87
                      : Colors.white,
                ),
                const SizedBox(height: 12),
                Text(
                  p['category_name'] ?? '',
                  style: TextStyle(
                    fontSize: 16,
                    color: p['category_code'] == 'WPC'
                        ? Colors.black87
                        : Colors.white,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          Text(
            p['name_ar'] ?? '',
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 16),
          _infoRow('المصنع', p['source_name'] ?? ''),
          _infoRow('الدرجة', p['grade'] ?? '—'),
          _infoRow('التعبئة',
              p['packaging_type'] == 'bagged' ? 'أكياس' : 'سائب'),
          _infoRow('المخزون',
              '${_formatPrice(p['available_qty'])} $_unitAr'),
          const Divider(height: 32),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('السعر',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
              Text(
                '${_formatPrice(_unitPrice)} ريال / $_unitAr',
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: AppColors.primary,
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),
          const Text('الكمية',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _qtyBtn(Icons.remove, () {
                if (_quantity > 1) setState(() => _quantity--);
              }),
              const SizedBox(width: 20),
              Container(
                width: 100,
                height: 52,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppColors.primary, width: 2),
                ),
                child: Text(
                  '$_quantity',
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    color: AppColors.primary,
                  ),
                ),
              ),
              const SizedBox(width: 20),
              _qtyBtn(Icons.add, () => setState(() => _quantity++)),
            ],
          ),
          const SizedBox(height: 12),
          Center(
            child: Text(
              '$_unitAr',
              style: const TextStyle(color: AppColors.textSecondary),
            ),
          ),
          const SizedBox(height: 24),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.divider),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('الإجمالي',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                Text(
                  '${_formatPrice(_unitPrice * _quantity)} ريال',
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    color: AppColors.primary,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          ElevatedButton.icon(
            onPressed: _addToCart,
            icon: const Icon(Icons.add_shopping_cart),
            label: const Text('إضافة إلى السلة'),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primary,
              foregroundColor: Colors.white,
              minimumSize: const Size(double.infinity, 56),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
          ),
          const SizedBox(height: 16),
        ],
      ),
    );
  }

  Widget _infoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label,
              style: const TextStyle(color: AppColors.textSecondary)),
          Text(value, style: const TextStyle(fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _qtyBtn(IconData icon, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        width: 52,
        height: 52,
        decoration: BoxDecoration(
          color: AppColors.primary,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Icon(icon, color: Colors.white, size: 28),
      ),
    );
  }
}
