import 'package:flutter/material.dart';
import '../domain/cart_item.dart';

class CartManager extends ChangeNotifier {
  static final CartManager instance = CartManager._internal();
  CartManager._internal();

  final List<CartItem> _items = [];

  List<CartItem> get items => List.unmodifiable(_items);

  int get itemCount => _items.length;

  int get totalQuantity =>
      _items.fold(0, (sum, item) => sum + item.quantity);

  double get subtotal =>
      _items.fold(0.0, (sum, item) => sum + item.lineTotal);

  bool get isEmpty => _items.isEmpty;

  void addItem(CartItem item) {
    final existing = _items.indexWhere((e) => e.productId == item.productId);
    if (existing >= 0) {
      _items[existing].quantity += item.quantity;
    } else {
      _items.add(item);
    }
    notifyListeners();
  }

  void updateQuantity(String productId, int newQty) {
    final i = _items.indexWhere((e) => e.productId == productId);
    if (i >= 0) {
      if (newQty <= 0) {
        _items.removeAt(i);
      } else {
        _items[i].quantity = newQty;
      }
      notifyListeners();
    }
  }

  void removeItem(String productId) {
    _items.removeWhere((e) => e.productId == productId);
    notifyListeners();
  }

  void clear() {
    _items.clear();
    notifyListeners();
  }
}
