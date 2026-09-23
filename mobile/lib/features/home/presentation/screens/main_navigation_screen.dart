import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/network/api_client.dart';
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
  final _client = ApiClient();
  int _index = 0;
  bool _checking = true;
  String _role = 'customer';

  @override
  void initState() {
    super.initState();
    _cart.addListener(_onChange);
    _checkRole();
  }

  Future<void> _checkRole() async {
    try {
      final res = await _client.get('/auth/me');
      final data = res.data['data'];
      final roles = (data['roles'] as List?)?.map((e) => e.toString()).toList() ?? [];
      if (mounted) {
        setState(() {
          _role = roles.contains('driver') ? 'driver' : 'customer';
          _checking = false;
        });
      }
    } on DioException {
      if (mounted) {
        setState(() {
          _role = 'customer';
          _checking = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _role = 'customer';
          _checking = false;
        });
      }
    }
  }

  @override
  void dispose() {
    _cart.removeListener(_onChange);
    super.dispose();
  }

  void _onChange() => setState(() {});

  @override
  Widget build(BuildContext context) {
    if (_checking) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    if (_role == 'driver') {
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
