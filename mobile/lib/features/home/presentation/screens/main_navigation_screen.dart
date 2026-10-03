import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/widgets/brand_logo.dart';
import '../../../../core/branding/branding_service.dart';
import '../../../cart/data/cart_manager.dart';
import '../../../cart/presentation/screens/cart_screen.dart';
import '../../../driver/presentation/screens/driver_home_screen.dart';
import '../../../admin/presentation/screens/admin_home_screen.dart';
import '../../../orders/presentation/screens/orders_list_screen.dart';
import '../../../profile/presentation/screens/profile_screen.dart';
import 'home_screen.dart';
import '../../../notifications/presentation/screens/notifications_screen.dart';
import '../../../orders/presentation/screens/trader_purchase_screen.dart';

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
          if (roles.contains('admin') || roles.contains('accountant') || roles.contains('sales') || roles.contains('transport') || roles.contains('loading')) {
            _role = 'admin';
          } else if (roles.contains('driver')) {
            _role = 'driver';
          } else {
            _role = 'customer';
          }
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

    if (_role == 'admin') {
      return const AdminHomeScreen();
    }

    if (_role == 'driver') {
      return const DriverHomeScreen();
    }

    final screens = [
      const HomeScreen(),
      const SizedBox.shrink(),  // index 1 = زر طلب شراء (لا شاشة)
      const OrdersListScreen(),
      const NotificationsScreen(),
      const ProfileScreen(),
    ];

    return Scaffold(
      body: IndexedStack(index: _index, children: screens),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _index,
        onTap: (i) {
          if (i == 1) {
            Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const TraderPurchaseScreen()),
            ).then((_) => _load());
          } else {
            setState(() => _index = i == 1 ? 0 : i);
          }
        },
        type: BottomNavigationBarType.fixed,
        selectedItemColor: AppColors.primary,
        unselectedItemColor: AppColors.textSecondary,
        items: const [
          BottomNavigationBarItem(
            icon: Icon(Icons.home_outlined),
            activeIcon: Icon(Icons.home),
            label: 'الرئيسية',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.add_circle_outline),
            activeIcon: Icon(Icons.add_circle),
            label: 'طلب شراء',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.receipt_long_outlined),
            activeIcon: Icon(Icons.receipt_long),
            label: 'طلباتي',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.notifications_outlined),
            activeIcon: Icon(Icons.notifications),
            label: 'الإشعارات',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.person_outline),
            activeIcon: Icon(Icons.person),
            label: 'حسابي',
          ),
        ],
      ),
    );
  }
}
