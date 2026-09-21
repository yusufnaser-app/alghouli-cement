import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/offer_service.dart';

class OffersScreen extends StatefulWidget {
  const OffersScreen({super.key});

  @override
  State<OffersScreen> createState() => _OffersScreenState();
}

class _OffersScreenState extends State<OffersScreen> {
  final _service = OfferService();
  List<Map<String, dynamic>> _offers = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final list = await _service.activeOffers();
      setState(() => _offers = list);
    } catch (_) {}
    setState(() => _loading = false);
  }

  String _offerLabel(Map<String, dynamic> o) {
    final type = o['offer_type'] ?? '';
    final value = o['discount_value'];
    switch (type) {
      case 'percentage':
        return 'خصم $value%';
      case 'fixed_amount':
        return 'خصم $value ريال';
      case 'special_price':
        return 'سعر خاص ${o['special_price']} ريال';
      case 'quantity_based':
        return 'عرض كميات';
      default:
        return 'عرض خاص';
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('العروض')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _offers.isEmpty
              ? const Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.local_offer_outlined,
                          size: 80, color: AppColors.textSecondary),
                      SizedBox(height: 16),
                      Text('لا توجد عروض حالية',
                          style: TextStyle(
                              fontSize: 18, color: AppColors.textSecondary)),
                    ],
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: _offers.length,
                    itemBuilder: (context, i) {
                      final o = _offers[i];
                      return Container(
                        margin: const EdgeInsets.only(bottom: 12),
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(
                            colors: [AppColors.primary, AppColors.primaryLight],
                          ),
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                const Icon(Icons.local_offer,
                                    color: Colors.white, size: 28),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Text(
                                    _offerLabel(o),
                                    style: const TextStyle(
                                      fontSize: 20,
                                      fontWeight: FontWeight.bold,
                                      color: Colors.white,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 12),
                            Text(o['product_name'] ?? '',
                                style: const TextStyle(
                                    color: Colors.white, fontSize: 14)),
                            const SizedBox(height: 4),
                            Text(
                              '${o['source_name'] ?? ''} • ينتهي ${o['end_date']?.toString().substring(0, 10) ?? ''}',
                              style: const TextStyle(
                                  color: Colors.white70, fontSize: 12),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
                ),
    );
  }
}
