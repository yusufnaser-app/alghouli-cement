import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/network/api_client.dart';
import '../../../offers/presentation/screens/offers_screen.dart';
import '../../../products/presentation/screens/product_details_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _client = ApiClient();
  final _searchController = TextEditingController();

  List<dynamic> _allProducts = [];
  List<dynamic> _filteredProducts = [];
  String? _selectedCategory; // null = الكل
  bool _loading = true;
  String? _error;

  final _categories = [
    {'code': 'OPC', 'label': 'بورتلاندي', 'color': AppColors.cementOpc},
    {'code': 'SRC', 'label': 'مقاوم', 'color': AppColors.cementSrc},
    {'code': 'WPC', 'label': 'أبيض', 'color': AppColors.cementWpc},
  ];

  @override
  void initState() {
    super.initState();
    _loadProducts();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadProducts() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await _client.get('/products');
      final list = (res.data['data'] as List?) ?? [];
      setState(() {
        _allProducts = list;
        _applyFilters();
      });
    } on DioException catch (e) {
      setState(() => _error = handleApiError(e));
    } catch (e) {
      setState(() => _error = 'خطأ في التحميل');
    } finally {
      setState(() => _loading = false);
    }
  }

  void _applyFilters() {
    final query = _searchController.text.trim().toLowerCase();
    _filteredProducts = _allProducts.where((p) {
      final matchesCategory = _selectedCategory == null ||
          p['category_code'] == _selectedCategory;
      final matchesSearch = query.isEmpty ||
          (p['name_ar'] ?? '').toString().toLowerCase().contains(query) ||
          (p['source_name'] ?? '').toString().toLowerCase().contains(query);
      return matchesCategory && matchesSearch;
    }).toList();
  }

  void _onCategoryTap(String? code) {
    setState(() {
      _selectedCategory = _selectedCategory == code ? null : code;
      _applyFilters();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('مؤسسة الغولي'),
        automaticallyImplyLeading: false,
      ),
      body: RefreshIndicator(
        onRefresh: _loadProducts,
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(Icons.error_outline,
                              size: 60, color: AppColors.danger),
                          const SizedBox(height: 16),
                          Text(_error!,
                              textAlign: TextAlign.center,
                              style:
                                  const TextStyle(color: AppColors.danger)),
                          const SizedBox(height: 16),
                          ElevatedButton(
                            onPressed: _loadProducts,
                            child: const Text('إعادة المحاولة'),
                          ),
                        ],
                      ),
                    ),
                  )
                : Column(
                    children: [
                      // شريط البحث + الفلاتر
                      Container(
                        color: Colors.white,
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          children: [
                            TextField(
                              controller: _searchController,
                              onChanged: (_) => setState(_applyFilters),
                              decoration: InputDecoration(
                                hintText: 'ابحث عن أسمنت...',
                                prefixIcon: const Icon(Icons.search,
                                    color: AppColors.primary),
                                suffixIcon: _searchController.text.isNotEmpty
                                    ? IconButton(
                                        icon: const Icon(Icons.clear),
                                        onPressed: () {
                                          _searchController.clear();
                                          setState(_applyFilters);
                                        },
                                      )
                                    : null,
                              ),
                            ),
                            const SizedBox(height: 12),
                            SingleChildScrollView(
                              scrollDirection: Axis.horizontal,
                              child: Row(
                                children: [
                                  _chip('الكل', null,
                                      _selectedCategory == null,
                                      AppColors.primary),
                                  const SizedBox(width: 8),
                                  ..._categories.map((c) => Padding(
                                        padding:
                                            const EdgeInsets.only(left: 8),
                                        child: _chip(
                                          c['label'] as String,
                                          c['code'] as String,
                                          _selectedCategory == c['code'],
                                          c['color'] as Color,
                                        ),
                                      )),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),

                      // زر العروض
                      Padding(
                        padding: const EdgeInsets.all(16),
                        child: InkWell(
                          onTap: () {
                            Navigator.push(
                              context,
                              MaterialPageRoute(
                                  builder: (_) => const OffersScreen()),
                            );
                          },
                          borderRadius: BorderRadius.circular(12),
                          child: Container(
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              gradient: const LinearGradient(
                                colors: [
                                  AppColors.secondary,
                                  Color(0xFFFF6F00)
                                ],
                              ),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: const Row(
                              children: [
                                Icon(Icons.local_offer,
                                    color: Colors.white),
                                SizedBox(width: 12),
                                Expanded(
                                  child: Text(
                                    '🎯 شاهد العروض الحالية',
                                    style: TextStyle(
                                      color: Colors.white,
                                      fontWeight: FontWeight.bold,
                                      fontSize: 15,
                                    ),
                                  ),
                                ),
                                Icon(Icons.arrow_forward_ios,
                                    color: Colors.white, size: 14),
                              ],
                            ),
                          ),
                        ),
                      ),

                      // عدد المنتجات
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        child: Row(
                          children: [
                            Text(
                              '${_filteredProducts.length} منتج',
                              style: const TextStyle(
                                  color: AppColors.textSecondary,
                                  fontSize: 13),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 8),

                      // المنتجات
                      Expanded(
                        child: _filteredProducts.isEmpty
                            ? const Center(
                                child: Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Icon(Icons.search_off,
                                        size: 60,
                                        color: AppColors.textSecondary),
                                    SizedBox(height: 12),
                                    Text('لا توجد نتائج',
                                        style: TextStyle(
                                            color: AppColors.textSecondary)),
                                  ],
                                ),
                              )
                            : ListView.builder(
                                padding: const EdgeInsets.all(16),
                                itemCount: _filteredProducts.length,
                                itemBuilder: (context, i) =>
                                    _productCard(_filteredProducts[i]),
                              ),
                      ),
                    ],
                  ),
      ),
    );
  }

  Widget _chip(String label, String? code, bool selected, Color color) {
    return InkWell(
      onTap: () => _onCategoryTap(code),
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color: selected ? color : Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
              color: selected ? color : AppColors.divider, width: 2),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: selected
                ? (code == 'WPC' ? Colors.black87 : Colors.white)
                : AppColors.textSecondary,
            fontWeight: FontWeight.bold,
            fontSize: 13,
          ),
        ),
      ),
    );
  }

  Widget _productCard(Map<String, dynamic> p) {
    final color = _parseColor(p['category_color'] as String?);
    final priceList = p['prices'] as List?;
    final price = priceList != null && priceList.isNotEmpty
        ? (priceList.first['price'] ?? 0)
        : 0;
    final unit = p['unit'] ?? 'bag';
    final unitAr = unit == 'bag' ? 'كيس' : 'طن';
    final packaging = p['packaging_type'] == 'bagged' ? 'أكياس' : 'سائب';

    return InkWell(
      onTap: () {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => ProductDetailsScreen(product: p),
          ),
        );
      },
      borderRadius: BorderRadius.circular(16),
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: color.withOpacity(0.3), width: 2),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: color,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: Colors.black12),
                  ),
                  child: Icon(
                    Icons.inventory_2,
                    color: p['category_code'] == 'WPC'
                        ? Colors.black87
                        : Colors.white,
                    size: 22,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(p['name_ar'] ?? '',
                          style: const TextStyle(
                              fontSize: 14, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 4),
                      Text('${p['source_name'] ?? ''} • $packaging',
                          style: const TextStyle(
                              fontSize: 11,
                              color: AppColors.textSecondary)),
                    ],
                  ),
                ),
                const Icon(Icons.arrow_forward_ios,
                    size: 14, color: AppColors.textSecondary),
              ],
            ),
            const Divider(height: 20),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  '${_formatPrice(price)} ريال / $unitAr',
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                    color: AppColors.primary,
                  ),
                ),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppColors.success.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: const Text('متوفر',
                      style: TextStyle(
                          color: AppColors.success,
                          fontSize: 11,
                          fontWeight: FontWeight.bold)),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Color _parseColor(String? hex) {
    if (hex == null || hex.isEmpty) return AppColors.primaryLight;
    try {
      return Color(int.parse('FF${hex.replaceFirst('#', '')}', radix: 16));
    } catch (_) {
      return AppColors.primaryLight;
    }
  }

  String _formatPrice(dynamic price) {
    final n = double.tryParse(price.toString()) ?? 0;
    return n.toStringAsFixed(0).replaceAllMapped(
          RegExp(r'(\d)(?=(\d{3})+(?!\d))'),
          (m) => '${m[1]},',
        );
  }
}
