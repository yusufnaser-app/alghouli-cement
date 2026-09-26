import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/driver_service.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  final _service = DriverService();
  List<Map<String, dynamic>> _items = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final list = await _service.myNotifications();
      setState(() => _items = list);
    } catch (_) {}
    setState(() => _loading = false);
  }

  IconData _icon(String type) {
    if (type.contains('FAX_APPROVED')) return Icons.check_circle;
    if (type.contains('FAX_ISSUED')) return Icons.description;
    if (type.contains('FAX_CREATED')) return Icons.add_circle;
    if (type.contains('ROUTE_SET')) return Icons.route;
    if (type.contains('TRANSPORT')) return Icons.payments;
    return Icons.notifications;
  }

  Color _color(String type) {
    if (type.contains('APPROVED')) return AppColors.info;
    if (type.contains('ISSUED')) return AppColors.accent;
    if (type.contains('ROUTE')) return AppColors.success;
    if (type.contains('TRANSPORT')) return AppColors.secondary;
    return AppColors.primary;
  }

  String _timeAgo(String? iso) {
    if (iso == null) return '';
    try {
      final dt = DateTime.parse(iso);
      final diff = DateTime.now().difference(dt);
      if (diff.inMinutes < 1) return 'الآن';
      if (diff.inMinutes < 60) return 'منذ ${diff.inMinutes} دقيقة';
      if (diff.inHours < 24) return 'منذ ${diff.inHours} ساعة';
      if (diff.inDays < 7) return 'منذ ${diff.inDays} يوم';
      return iso.substring(0, 10);
    } catch (_) {
      return '';
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('الإشعارات'),
        actions: [
          if (_items.isNotEmpty)
            TextButton(
              onPressed: () async {
                await _service.markAllNotificationsRead();
                _load();
              },
              child: const Text('تحديد الكل كمقروء',
                  style: TextStyle(color: Colors.white, fontSize: 12)),
            ),
          IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _items.isEmpty
              ? const Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.notifications_off_outlined,
                          size: 80, color: AppColors.textSecondary),
                      SizedBox(height: 16),
                      Text('لا توجد إشعارات',
                          style: TextStyle(
                              fontSize: 16, color: AppColors.textSecondary)),
                    ],
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: _items.length,
                    itemBuilder: (_, i) {
                      final n = _items[i];
                      final isRead = n['is_read'] == true;
                      final type = n['type'] ?? '';
                      final color = _color(type);

                      return InkWell(
                        onTap: () async {
                          if (!isRead) {
                            await _service.markNotificationRead(n['id']);
                            _load();
                          }
                        },
                        borderRadius: BorderRadius.circular(12),
                        child: Container(
                          margin: const EdgeInsets.only(bottom: 10),
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: isRead
                                ? Colors.white
                                : AppColors.primary.withOpacity(0.05),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: isRead
                                  ? AppColors.divider
                                  : color.withOpacity(0.4),
                              width: isRead ? 1 : 2,
                            ),
                          ),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Container(
                                width: 44,
                                height: 44,
                                decoration: BoxDecoration(
                                  color: color.withOpacity(0.15),
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: Icon(_icon(type), color: color, size: 22),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      children: [
                                        Expanded(
                                          child: Text(
                                            n['title_ar'] ?? '',
                                            style: TextStyle(
                                              fontSize: 14,
                                              fontWeight: isRead
                                                  ? FontWeight.normal
                                                  : FontWeight.bold,
                                              color: AppColors.textPrimary,
                                            ),
                                          ),
                                        ),
                                        if (!isRead)
                                          Container(
                                            width: 8,
                                            height: 8,
                                            decoration: const BoxDecoration(
                                              color: AppColors.danger,
                                              shape: BoxShape.circle,
                                            ),
                                          ),
                                      ],
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      n['body_ar'] ?? '',
                                      style: const TextStyle(
                                          fontSize: 12,
                                          color: AppColors.textSecondary,
                                          height: 1.4),
                                    ),
                                    const SizedBox(height: 6),
                                    Text(
                                      _timeAgo(n['sent_at']),
                                      style: TextStyle(
                                          fontSize: 10,
                                          color: color,
                                          fontWeight: FontWeight.w600),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                ),
    );
  }
}
