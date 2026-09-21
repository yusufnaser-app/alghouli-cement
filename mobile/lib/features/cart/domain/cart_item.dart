class CartItem {
  final String productId;
  final String name;
  final String sourceName;
  final String categoryCode;
  final String categoryColor;
  final String packagingType;
  final String unit;
  final double unitPrice;
  int quantity;

  CartItem({
    required this.productId,
    required this.name,
    required this.sourceName,
    required this.categoryCode,
    required this.categoryColor,
    required this.packagingType,
    required this.unit,
    required this.unitPrice,
    required this.quantity,
  });

  double get lineTotal => unitPrice * quantity;
  String get unitAr => unit == 'bag' ? 'كيس' : 'طن';
}
