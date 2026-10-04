import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';

/// عرض موحد لحالات: تحميل / فارغ / خطأ مع إعادة المحاولة.
/// يضمن ألا تظهر شاشة بيضاء عند أي حالة.
class AdminAsyncView extends StatelessWidget {
  final bool loading;
  final String? error;
  final bool isEmpty;
  final String emptyText;
  final VoidCallback onRetry;
  final Widget Function() builder;

  const AdminAsyncView({
    super.key,
    required this.loading,
    required this.error,
    required this.isEmpty,
    required this.onRetry,
    required this.builder,
    this.emptyText = 'لا توجد طلبات حالياً',
  });

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(),
            SizedBox(height: 12),
            Text('جاري تحميل البيانات...'),
          ],
        ),
      );
    }
    if (error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, color: AppColors.danger, size: 56),
              const SizedBox(height: 12),
              const Text('تعذر تحميل البيانات',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
              const SizedBox(height: 6),
              Text(error!, textAlign: TextAlign.center,
                  style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
              const SizedBox(height: 16),
              ElevatedButton.icon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh),
                label: const Text('إعادة المحاولة'),
              ),
            ],
          ),
        ),
      );
    }
    if (isEmpty) {
      // ListView كي يعمل السحب للتحديث حتى في الحالة الفارغة
      return RefreshIndicator(
        onRefresh: () async => onRetry(),
        child: ListView(
          children: [
            SizedBox(height: MediaQuery.of(context).size.height * 0.3),
            const Icon(Icons.inbox_outlined, size: 56, color: AppColors.textSecondary),
            const SizedBox(height: 12),
            Text(emptyText, textAlign: TextAlign.center,
                style: const TextStyle(color: AppColors.textSecondary)),
          ],
        ),
      );
    }
    return builder();
  }
}
