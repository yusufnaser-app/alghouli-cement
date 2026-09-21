import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/notification_service.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  final _service = NotificationService();
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
      final list = await _service.list();
      setState(() => _items = list);
    } catch (_) {}
    setState(() => _loading = false);
  }

  IconData _iconFor(String type) {
    if (type.contains('order')) return Icons.receipt_long;
    if (type.contains('payment')) return Icons.payment;
    if (type.contains('delivery')) return Icons.local_shipping;
    if (type.contains('offer')) return Icons.local_offer;
    return Icons.notifications;
  }

  String _timeAgo(String? iso) {
    if (iso == null) return '';
    try {
      final dt = DateTime.parse(iso);
      final diff = DateTime.now().difference(dt);
      if (diff.inMinutes < 60) return 'منذ ${diff.inMinutes} د';
      if (diff.inHours < 24) return 'منذ ${diff.inHours} س';
      if (diff.inDays < 7) return 'منذ ${diff.inDays} ي';
      return iso.substring(0, 10);
    } catch (_) {
      return '';
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('الإشعارات'),
        actions: [
          if (_items.isNotEmpty)
            TextButton(
              onPressed: () async {
                await _service.markAllRead();
                _load();
              },
              child: const Text('تحديد الكل كمقروء',
                  style: TextStyle(color: Colors.white, fontSize: 12)),
            ),
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
                              fontSize: 18, color: AppColors.textSecondary)),
                    ],
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView.builder(
                    padding: const EdgeInsets.all(12),
                    itemCount: _items.length,
                    itemBuilder: (context, i) {
                      final n = _items[i];
                      final isRead = n['is_read'] == true;
                      return Dismissible(
                        key: Key(n['id'].toString()),
                        background: Container(
                          color: AppColors.danger,
                          alignment: Alignment.centerRight,
                          padding: const EdgeInsets.only(right: 20),
                          child: const Icon(Icons.delete,
                              color: Colors.white),
                        ),
                        onDismissed: (_) async {
                          await _service.remove(n['id']);
                          setState(() => _items.removeAt(i));
                        },
                        child: InkWell(
                          onTap: () async {
                            if (!isRead) {
                              await _service.markRead(n['id']);
                              _load();
                            }
                          },
                          child: Container(
                            margin: const EdgeInsets.only(bottom: 8),
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: isRead
                                  ? Colors.white
                                  : AppColors.primary.withOpacity(0.05),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(
                                color: isRead
                                    ? AppColors.divider
                                    : AppColors.primary.withOpacity(0.3),
                                width: isRead ? 1 : 2,
                              ),
                            ),
                            child: Row(
                              children: [
                                Container(
                                  width: 44,
                                  height: 44,
                                  decoration: BoxDecoration(
                                    color: AppColors.primary.withOpacity(0.1),
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                  child: Icon(_iconFor(n['type'] ?? ''),
                                      color: AppColors.primary),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(n['title_ar'] ?? '',
                                          style: TextStyle(
                                            fontWeight: isRead
                                                ? FontWeight.normal
                                                : FontWeight.bold,
                                            fontSize: 14,
                                          )),
                                      const SizedBox(height: 4),
                                      Text(n['body_ar'] ?? '',
                                          style: const TextStyle(
                                              fontSize: 12,
                                              color: AppColors.textSecondary)),
                                      const SizedBox(height: 4),
                                      Text(_timeAgo(n['sent_at']),
                                          style: const TextStyle(
                                              fontSize: 10,
                                              color: AppColors.textSecondary)),
                                    ],
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
                          ),
                        ),
                      );
                    },
                  ),
                ),
    );
  }
}
