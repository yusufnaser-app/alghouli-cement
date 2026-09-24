import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/storage/local_storage.dart';
import '../../../auth/presentation/screens/login_screen.dart';
import '../../data/driver_service.dart';

class DriverProfileScreen extends StatefulWidget {
  const DriverProfileScreen({super.key});

  @override
  State<DriverProfileScreen> createState() => _DriverProfileScreenState();
}

class _DriverProfileScreenState extends State<DriverProfileScreen> {
  final _service = DriverService();
  Map<String, dynamic>? _profile;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final p = await _service.myProfile();
      setState(() => _profile = p);
    } catch (e) {
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _logout() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('تسجيل الخروج؟'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('إلغاء'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('خروج', style: TextStyle(color: AppColors.danger)),
          ),
        ],
      ),
    );
    if (ok != true) return;
    await LocalStorage.clearAll();
    if (!mounted) return;
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (r) => false,
    );
  }

  String _driverTypeAr(String? t) {
    return {
      'institution_driver': 'سائق مؤسسة',
      'transport_driver': 'سائق نقل مستقل',
      'trader_driver': 'سائق تاجر',
    }[t] ?? 'سائق';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('حسابي'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : _profile == null
                  ? const Center(child: Text('غير موجود'))
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView(
                        padding: const EdgeInsets.all(16),
                        children: [
                          Container(
                            padding: const EdgeInsets.all(20),
                            decoration: BoxDecoration(
                              gradient: const LinearGradient(
                                colors: [
                                  AppColors.primary,
                                  AppColors.primaryLight,
                                ],
                                begin: Alignment.topRight,
                                end: Alignment.bottomLeft,
                              ),
                              borderRadius: BorderRadius.circular(16),
                            ),
                            child: Row(
                              children: [
                                const CircleAvatar(
                                  radius: 36,
                                  backgroundColor: Colors.white,
                                  child: Icon(Icons.person,
                                      size: 44, color: AppColors.primary),
                                ),
                                const SizedBox(width: 16),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(_profile!['full_name'] ?? '',
                                          style: const TextStyle(
                                            fontSize: 20,
                                            fontWeight: FontWeight.bold,
                                            color: Colors.white,
                                          )),
                                      const SizedBox(height: 4),
                                      Text(_driverTypeAr(_profile!['driver_type']),
                                          style: const TextStyle(
                                              fontSize: 12,
                                              color: Colors.white70)),
                                      const SizedBox(height: 4),
                                      Row(
                                        children: [
                                          const Icon(Icons.phone,
                                              size: 12, color: Colors.white70),
                                          const SizedBox(width: 4),
                                          Text(_profile!['phone'] ?? '',
                                              style: const TextStyle(
                                                  fontSize: 12,
                                                  color: Colors.white70)),
                                        ],
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 16),
                          _section('البيانات الشخصية', [
                            _row(Icons.phone, 'رقم الهاتف',
                                _profile!['phone'] ?? '—'),
                            _row(Icons.badge_outlined, 'رقم الهوية',
                                _profile!['national_id'] ?? 'لم يُسجّل'),
                            _row(Icons.location_on, 'العنوان',
                                _profile!['address'] ?? 'لم يُسجّل'),
                            _row(Icons.email, 'البريد الإلكتروني',
                                _profile!['email'] ?? 'لم يُسجّل'),
                          ]),
                          _section('رخصة القيادة', [
                            _row(Icons.card_membership, 'رقم الرخصة',
                                _profile!['license_number'] ?? 'لم يُسجّل'),
                            _row(Icons.calendar_today, 'تاريخ الانتهاء',
                                _profile!['license_expiry']?.toString() ?? '—'),
                          ]),
                          if ((_profile!['vehicles'] as List?)?.isNotEmpty ?? false)
                            _section(
                              'قاطراتي',
                              (_profile!['vehicles'] as List)
                                  .map<Widget>((v) => Padding(
                                        padding: const EdgeInsets.symmetric(
                                            vertical: 8),
                                        child: Row(
                                          children: [
                                            Container(
                                              width: 44,
                                              height: 44,
                                              decoration: BoxDecoration(
                                                color: AppColors.accent
                                                    .withOpacity(0.12),
                                                borderRadius:
                                                    BorderRadius.circular(10),
                                              ),
                                              child: const Icon(
                                                  Icons.local_shipping,
                                                  color: AppColors.accent,
                                                  size: 22),
                                            ),
                                            const SizedBox(width: 12),
                                            Expanded(
                                              child: Column(
                                                crossAxisAlignment:
                                                    CrossAxisAlignment.start,
                                                children: [
                                                  Text(
                                                      v['plate_number'] ?? '',
                                                      style: const TextStyle(
                                                        fontSize: 15,
                                                        fontWeight:
                                                            FontWeight.bold,
                                                      )),
                                                  Text(
                                                    '${v['vehicle_type']} • ${v['capacity_tons']} طن',
                                                    style: const TextStyle(
                                                        fontSize: 12,
                                                        color: AppColors
                                                            .textSecondary),
                                                  ),
                                                ],
                                              ),
                                            ),
                                            Container(
                                              padding:
                                                  const EdgeInsets.symmetric(
                                                      horizontal: 8,
                                                      vertical: 4),
                                              decoration: BoxDecoration(
                                                color: AppColors.success
                                                    .withOpacity(0.15),
                                                borderRadius:
                                                    BorderRadius.circular(20),
                                              ),
                                              child: Text(
                                                v['operating_status'] ==
                                                        'available'
                                                    ? 'متاحة'
                                                    : 'غير متاحة',
                                                style: const TextStyle(
                                                    fontSize: 10,
                                                    color: AppColors.success,
                                                    fontWeight:
                                                        FontWeight.bold),
                                              ),
                                            ),
                                          ],
                                        ),
                                      ))
                                  .toList(),
                            ),
                          const SizedBox(height: 12),
                          Card(
                            color: AppColors.danger.withOpacity(0.05),
                            child: ListTile(
                              leading: const Icon(Icons.logout,
                                  color: AppColors.danger),
                              title: const Text('تسجيل الخروج',
                                  style: TextStyle(
                                      color: AppColors.danger,
                                      fontWeight: FontWeight.bold)),
                              onTap: _logout,
                            ),
                          ),
                        ],
                      ),
                    ),
    );
  }

  Widget _section(String title, List<Widget> children) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.divider),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title,
              style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                  color: AppColors.primary)),
          const Divider(height: 20),
          ...children,
        ],
      ),
    );
  }

  Widget _row(IconData icon, String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Icon(icon, size: 16, color: AppColors.textSecondary),
          const SizedBox(width: 10),
          SizedBox(
            width: 110,
            child: Text(label,
                style: const TextStyle(
                    fontSize: 13, color: AppColors.textSecondary)),
          ),
          Expanded(
            child: Text(value,
                style: const TextStyle(
                    fontSize: 13, fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }
}
