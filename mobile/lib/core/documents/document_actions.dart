import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:printing/printing.dart';
import 'package:share_plus/share_plus.dart';

import '../constants/app_colors.dart';
import '../network/api_client.dart';

/// مستند يُجلب من الخادم كـ HTML (مع Bearer token عبر Dio) ثم يُحوَّل إلى PDF على الجهاز.
/// لا يُفتح في المتصفح: المتصفح لا يرسل التوكن.
class DocumentSpec {
  final String label;

  /// يُحلّ المسار عند الطلب (مثلًا بعد جلب معرّف السائق من ملفه الشخصي).
  final Future<String> Function() path;

  /// اسم الملف عند المشاركة (يُنظَّف عبر [safeFileName]).
  final String fileName;

  const DocumentSpec({required this.label, required this.path, required this.fileName});
}

/// اسم ملف آمن: حروف عربية/لاتينية وأرقام وشرطات سفلية فقط، بامتداد pdf.
String safeFileName(String raw) {
  final cleaned = raw
      .replaceAll(RegExp(r'[^\w\u0600-\u06FF\-]+'), '_')
      .replaceAll(RegExp(r'_+'), '_')
      .replaceAll(RegExp(r'^_|_$'), '');
  return '${cleaned.isEmpty ? 'document' : cleaned}.pdf';
}

/// مهلة لكل خطوة (الجلب والتحويل): بدونها قد تبقى رسالة التحضير معلّقة إلى ما لا نهاية.
const Duration _timeout = Duration(seconds: 60);

Future<Uint8List> _fetchPdf(DocumentSpec d) async {
  final path = await d.path();
  debugPrint('[document] GET $path');
  final res = await ApiClient()
      .dio
      .get<String>(path, options: Options(responseType: ResponseType.plain))
      .timeout(_timeout, onTimeout: () => throw Exception('انتهت المهلة أثناء جلب المستند'));
  final html = res.data ?? '';
  if (!html.contains('<html')) {
    throw Exception('استجابة غير متوقعة من الخادم');
  }
  debugPrint('[document] html ${html.length} chars, converting');
  return Printing.convertHtml(html: html)
      .timeout(_timeout, onTimeout: () => throw Exception('انتهت المهلة أثناء تحويل المستند إلى PDF'));
}

Future<void> _run(
  BuildContext context,
  DocumentSpec d,
  Future<void> Function(Uint8List bytes, String fileName) action,
) async {
  // نلتقط المرجع قبل أي await: السياق قد يصبح غير صالح بعد الانتظار
  final messenger = ScaffoldMessenger.of(context);
  messenger.showSnackBar(const SnackBar(
    content: Text('جارٍ تجهيز المستند...'),
    duration: Duration(seconds: 2),
  ));
  try {
    final bytes = await _fetchPdf(d);
    await action(bytes, safeFileName(d.fileName));
  } on DioException catch (e) {
    debugPrint('[document] dio: ${e.type} ${e.response?.statusCode} ${e.message}');
    messenger.hideCurrentSnackBar();
    messenger.showSnackBar(SnackBar(
      content: Text(handleApiError(e)),
      backgroundColor: AppColors.danger,
    ));
  } catch (e) {
    debugPrint('[document] failed: $e');
    messenger.hideCurrentSnackBar();
    messenger.showSnackBar(SnackBar(
      content: Text(e.toString().replaceFirst('Exception: ', '')),
      backgroundColor: AppColors.danger,
    ));
  }
}

Future<void> printDocument(BuildContext context, DocumentSpec d) =>
    _run(context, d, (bytes, name) => Printing.layoutPdf(onLayout: (_) async => bytes, name: name));

Future<void> shareDocument(BuildContext context, DocumentSpec d) => _run(
      context,
      d,
      (bytes, name) => Share.shareXFiles(
        [XFile.fromData(bytes, mimeType: 'application/pdf', name: name)],
        subject: d.label,
      ),
    );

/// ورقة سفلية: لكل مستند زرّا طباعة وزرّا مشاركة PDF.
Future<void> showDocumentSheet(BuildContext context, List<DocumentSpec> docs) {
  return showModalBottomSheet<void>(
    context: context,
    builder: (sheetCtx) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Padding(
            padding: EdgeInsets.all(12),
            child: Text('المستندات', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
          ),
          for (final d in docs)
            ListTile(
              title: Text(d.label),
              trailing: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  IconButton(
                    tooltip: 'طباعة',
                    icon: const Icon(Icons.print_outlined),
                    onPressed: () {
                      Navigator.pop(sheetCtx);
                      printDocument(context, d);
                    },
                  ),
                  IconButton(
                    tooltip: 'مشاركة PDF',
                    icon: const Icon(Icons.share_outlined),
                    onPressed: () {
                      Navigator.pop(sheetCtx);
                      shareDocument(context, d);
                    },
                  ),
                ],
              ),
            ),
          const SizedBox(height: 8),
        ],
      ),
    ),
  );
}

/// زر شريط علوي يفتح ورقة المستندات.
class DocumentMenuButton extends StatelessWidget {
  final List<DocumentSpec> docs;
  const DocumentMenuButton({super.key, required this.docs});

  @override
  Widget build(BuildContext context) {
    return IconButton(
      tooltip: 'طباعة / مشاركة',
      icon: const Icon(Icons.print_outlined),
      onPressed: docs.isEmpty ? null : () => showDocumentSheet(context, docs),
    );
  }
}
