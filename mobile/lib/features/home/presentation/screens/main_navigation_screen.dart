import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/storage/local_storage.dart';
import '../../../cart/data/cart_manager.dart';
import '../../../cart/presentation/screens/cart_screen.dart';
import '../../../driver/presentation/screens/driver_home_screen.dart';
import '../../../orders/presentation/screens/orders_list_screen.dart';
import '../../../profile/presentation/screens/profile_screen.dart';
import 'home_screen.dart';

class MainNavigationScreen extends StatefulWidget {
  const MainNavigationScreen({super.key});

  @override
  State<MainNavigationScreen> createState() => _MainNavigationScreenState();
}

class _MainNavigationScreenState extends State<MainNavigationScreen> {
  final _cart = CartManager.instance;
  int _index = 0;
  bool _checkingRole = true;
  String? _userType;

  @override
  void initState() {
    super.initState();
    _cart.addListener(_onChange);
    _checkRole();
  }

  Future<void> _checkRole() async {
    try {
      final u = await LocalStorage.getUser();
      if (u != null) {
        // نحن نخزن user كـ JSON في storage
        if (u.contains('"driver"')) {
          _userType = 'driver';
        } else {
          _userType = 'customer';
        }
      }
    } catch (_) {}
    if (mounted) setState(() => _checkingRole = false);
  }

  @override
  void dispose() {
    _cart.removeListener(_onChange);
    super.dispose();
  }

  void _onChange() => setState(() {});

  @override
  Widget build(BuildContext context) {
    if (_checkingRole) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    // التوجيه حسب الدور
    if (_userType == 'driver') {
      return const DriverHomeScreen();
    }

    final screens = const [
      HomeScreen(),
      CartScreen(),
      OrdersListScreen(),
      ProfileScreen(),
    ];

    return Scaffold(
      body: IndexedStack(index: _index, children: screens),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _index,
        onTap: (i) => setState(() => _index = i),
        type: BottomNavigationBarType.fixed,
        selectedItemColor: AppColors.primary,
        unselectedItemColor: AppColors.textSecondary,
        items: [
          const BottomNavigationBarItem(
            icon: Icon(Icons.home_outlined),
            activeIcon: Icon(Icons.home),
            label: 'الرئيسية',
          ),
          BottomNavigationBarItem(
            icon: Stack(
              children: [
                const Icon(Icons.shopping_cart_outlined),
                if (_cart.totalQuantity > 0)
                  Positioned(
                    right: 0,
                    top: 0,
                    child: Container(
                      padding: const EdgeInsets.all(2),
                      decoration: const BoxDecoration(
                        color: AppColors.danger,
                        shape: BoxShape.circle,
                      ),
                      constraints: const BoxConstraints(minWidth: 14, minHeight: 14),
                      child: Text(
                        '${_cart.totalQuantity}',
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 8,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
            activeIcon: const Icon(Icons.shopping_cart),
            label: 'السلة',
          ),
          const BottomNavigationBarItem(
            icon: Icon(Icons.receipt_long_outlined),
            activeIcon: Icon(Icons.receipt_long),
            label: 'طلباتي',
          ),
          const BottomNavigationBarItem(
            icon: Icon(Icons.person_outline),
            activeIcon: Icon(Icons.person),
            label: 'حسابي',
          ),
        ],
      ),
    );
  }
}
