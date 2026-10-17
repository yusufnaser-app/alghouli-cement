import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:share_plus/share_plus.dart';

import '../constants/app_colors.dart';

/// سطر في بطاقة التفاصيل (تسمية وقيمة).
class ReceiptRow {
  final String label;
  final String value;
  const ReceiptRow(this.label, this.value);
}

/// اسم ملف آمن للصورة: حروف عربية/لاتينية وأرقام وشرطات سفلية فقط.
String receiptFileName(String raw) {
  final cleaned = raw
      .replaceAll(RegExp(r'[^\w\u0600-\u06FF\-]+'), '_')
      .replaceAll(RegExp(r'_+'), '_')
      .replaceAll(RegExp(r'^_|_$'), '');
  return cleaned.isEmpty ? 'receipt' : cleaned;
}

/// بطاقة تفاصيل العملية: شعار المؤسسة، عنوان، مبلغ بارز اختياري، وحقول.
class ReceiptCard extends StatelessWidget {
  final String title;
  final List<ReceiptRow> rows;
  final String? amount;
  final String? amountUnit;
  final String dateText;

  const ReceiptCard({
    super.key,
    required this.title,
    required this.rows,
    this.amount,
    this.amountUnit,
    required this.dateText,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 360,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20)),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Image.asset(
            'assets/images/logo.jpg',
            height: 64,
            errorBuilder: (_, __, ___) => const Icon(Icons.business, size: 56, color: AppColors.primary),
          ),
          const SizedBox(height: 8),
          const Text('مؤسسة الغولي',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: AppColors.primary)),
          const SizedBox(height: 14),
          Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
          if (amount != null) ...[
            const SizedBox(height: 12),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 12),
              decoration: BoxDecoration(color: Colors.grey.shade200, borderRadius: BorderRadius.circular(14)),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(amount!,
                      style: const TextStyle(fontSize: 26, fontWeight: FontWeight.bold, color: AppColors.danger)),
                  const SizedBox(width: 8),
                  Text(amountUnit ?? 'ريال يمني', style: const TextStyle(fontSize: 14)),
                ],
              ),
            ),
          ],
          const SizedBox(height: 12),
          for (final r in rows)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Row(
                children: [
                  Expanded(
                    child: Text(r.label, style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
                  ),
                  Flexible(
                    child: Text(r.value, textAlign: TextAlign.left, style: const TextStyle(fontWeight: FontWeight.w600)),
                  ),
                ],
              ),
            ),
          const SizedBox(height: 8),
          Text(dateText, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
        ],
      ),
    );
  }
}

/// يعرض البطاقة في ورقة سفلية مع زرّي المشاركة والحفظ (تُحفظ الصورة عبر قائمة المشاركة).
Future<void> showReceiptSheet(
  BuildContext context, {
  required String title,
  required List<ReceiptRow> rows,
  String? amount,
  String? fileName,
}) {
  final key = GlobalKey();
  final now = DateTime.now();
  final dateText =
      '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')} '
      '${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}';
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (sheetCtx) => SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            RepaintBoundary(
              key: key,
              child: ReceiptCard(title: title, rows: rows, amount: amount, dateText: dateText),
            ),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                _actionButton(Icons.share_outlined, 'مشاركة',
                    () => shareWidgetAsImage(key, fileName ?? title)),
                _actionButton(Icons.download_outlined, 'حفظ',
                    () => shareWidgetAsImage(key, fileName ?? title)),
              ],
            ),
          ],
        ),
      ),
    ),
  );
}

Widget _actionButton(IconData icon, String label, Future<void> Function() onTap) {
  return Column(
    mainAxisSize: MainAxisSize.min,
    children: [
      IconButton.filledTonal(
        iconSize: 28,
        onPressed: () => onTap(),
        icon: Icon(icon, color: AppColors.primary),
      ),
      Text(label),
    ],
  );
}

/// يلتقط أي عنصر مُعلَّم بـ RepaintBoundary كصورة PNG ثم يفتح قائمة المشاركة (واتساب وغيره).
Future<void> shareWidgetAsImage(GlobalKey key, String name) async {
  final boundary = key.currentContext?.findRenderObject() as RenderRepaintBoundary?;
  if (boundary == null) return;
  final image = await boundary.toImage(pixelRatio: 3);
  final data = await image.toByteData(format: ui.ImageByteFormat.png);
  if (data == null) return;
  final Uint8List bytes = data.buffer.asUint8List();
  await Share.shareXFiles(
    [XFile.fromData(bytes, mimeType: 'image/png', name: '${receiptFileName(name)}.png')],
    subject: name,
  );
}
