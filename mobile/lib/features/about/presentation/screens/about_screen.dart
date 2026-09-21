import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/constants/app_config.dart';

class AboutScreen extends StatelessWidget {
  const AboutScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('عن التطبيق')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const SizedBox(height: 20),
          Center(
            child: Container(
              width: 110,
              height: 110,
              decoration: BoxDecoration(
                color: AppColors.primary,
                borderRadius: BorderRadius.circular(24),
              ),
              child: const Icon(Icons.business,
                  size: 70, color: Colors.white),
            ),
          ),
          const SizedBox(height: 20),
          const Text(AppConfig.companyName,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          const Text('لبيع وتسويق الأسمنت إلكترونيًا',
              textAlign: TextAlign.center,
              style:
                  TextStyle(fontSize: 14, color: AppColors.textSecondary)),
          const SizedBox(height: 8),
          const Text('الإصدار 1.0.0',
              textAlign: TextAlign.center,
              style: TextStyle(
                  fontSize: 12, color: AppColors.textSecondary)),
          const SizedBox(height: 32),
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
            ),
            child: const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('عن المؤسسة',
                    style: TextStyle(
                        fontSize: 16, fontWeight: FontWeight.bold)),
                SizedBox(height: 12),
                Text(
                  'مؤسسة الغولي هي الجهة المتخصصة في بيع وتسويق الأسمنت إلكترونيًا وتوصيله للعملاء في مختلف المحافظات. '
                  'نوفر تشكيلة واسعة من الأسمنت من أفضل المصانع، مع خدمة توصيل سريعة وموثوقة.',
                  style: TextStyle(height: 1.6, fontSize: 13),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
            ),
            child: const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('المصانع المدعومة',
                    style: TextStyle(
                        fontSize: 16, fontWeight: FontWeight.bold)),
                SizedBox(height: 12),
                _SourceItem('مصنع عمران', 'OPC'),
                _SourceItem('مصنع باجل', 'OPC'),
                _SourceItem('مصنع البرح', 'OPC'),
                _SourceItem('مصنع الوطنية', 'OPC • SRC • WPC'),
                _SourceItem('مصنع حضرموت', 'OPC • SRC • WPC'),
                _SourceItem('مصنع النهضة', 'OPC'),
                _SourceItem('مصنع الوحدة', 'OPC'),
                _SourceItem('إعمار اليمن', 'OPC • WPC'),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
            ),
            child: const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('أنواع الأسمنت',
                    style: TextStyle(
                        fontSize: 16, fontWeight: FontWeight.bold)),
                SizedBox(height: 12),
                _TypeItem('أسمنت بورتلاندي عادي', 'أخضر', 'OPC',
                    AppColors.cementOpc),
                _TypeItem('أسمنت مقاوم للكبريتات', 'أحمر', 'SRC',
                    AppColors.cementSrc),
                _TypeItem('أسمنت أبيض للتشطيبات', 'أبيض', 'WPC',
                    AppColors.cementWpc),
              ],
            ),
          ),
          const SizedBox(height: 24),
          const Center(
            child: Text('© 2026 مؤسسة الغولي',
                style: TextStyle(
                    fontSize: 12, color: AppColors.textSecondary)),
          ),
          const SizedBox(height: 20),
        ],
      ),
    );
  }
}

class _SourceItem extends StatelessWidget {
  final String name;
  final String types;
  const _SourceItem(this.name, this.types);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: const BoxDecoration(
                color: AppColors.primary, shape: BoxShape.circle),
          ),
          const SizedBox(width: 8),
          Expanded(
              child: Text(name, style: const TextStyle(fontSize: 13))),
          Text(types,
              style: const TextStyle(
                  fontSize: 11, color: AppColors.textSecondary)),
        ],
      ),
    );
  }
}

class _TypeItem extends StatelessWidget {
  final String name;
  final String color;
  final String code;
  final Color displayColor;
  const _TypeItem(this.name, this.color, this.code, this.displayColor);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Container(
            width: 24,
            height: 24,
            decoration: BoxDecoration(
              color: displayColor,
              borderRadius: BorderRadius.circular(6),
              border: Border.all(color: Colors.black12),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name,
                    style: const TextStyle(
                        fontSize: 13, fontWeight: FontWeight.bold)),
                Text('$code • $color',
                    style: const TextStyle(
                        fontSize: 11, color: AppColors.textSecondary)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
