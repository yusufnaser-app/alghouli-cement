import 'package:flutter/material.dart';

import '../../../../core/constants/app_colors.dart';
import '../../../../core/receipts/receipt.dart';
import '../../data/admin_service.dart';
import '../../data/factory_report_service.dart';

/// تقرير فاكسات المصنع: اختيار المصنع والفترة، وجدول الفاكسات والإجماليات مع الخطاب الرسمي،
/// ويُشارك التقرير كصورة (واتساب وغيره).
class AdminFactoryReportScreen extends StatefulWidget {
  const AdminFactoryReportScreen({super.key});

  @override
  State<AdminFactoryReportScreen> createState() => _S();
}

class _S extends State<AdminFactoryReportScreen> {
  final _admin = AdminService();
  final _svc = FactoryReportService();
  final _captureKey = GlobalKey();
  List<Map<String, dynamic>> _factories = [];
  String? _factoryId;
  late DateTime _from;
  late DateTime _to;
  Map<String, dynamic>? _report;
  bool _loading = false;
  String? _err;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _from = DateTime(now.year, now.month, 1);
    _to = now;
    _admin.sources().then((l) {
      if (mounted) setState(() => _factories = l);
    }).catchError((_) {});
  }

  Future<void> _pick(bool isFrom) async {
    final picked = await showDatePicker(
      context: context,
      initialDate: isFrom ? _from : _to,
      firstDate: DateTime(2024),
      lastDate: DateTime(2100),
    );
    if (picked == null) return;
    setState(() => isFrom ? _from = picked : _to = picked);
  }

  Future<void> _load() async {
    if (_factoryId == null) {
      setState(() => _err = 'اختر المصنع');
      return;
    }
    if (_from.isAfter(_to)) {
      setState(() => _err = 'تاريخ البداية بعد تاريخ النهاية');
      return;
    }
    setState(() {
      _loading = true;
      _err = null;
    });
    try {
      final r = await _svc.report(factoryId: _factoryId!, from: _from, to: _to);
      if (mounted) setState(() => _report = r);
    } catch (e) {
      if (mounted) setState(() => _err = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        backgroundColor: AppColors.background,
        appBar: AppBar(
          title: const Text('تقارير فاكسات المصانع'),
          actions: [
            if (_report != null)
              IconButton(
                tooltip: 'مشاركة كصورة',
                icon: const Icon(Icons.share),
                onPressed: () => shareWidgetAsImage(
                  _captureKey,
                  'تقرير_مصنع_${formatDateYmd(_from)}_${formatDateYmd(_to)}',
                ),
              ),
          ],
        ),
        body: ListView(
          padding: const EdgeInsets.all(12),
          children: [
            DropdownButtonFormField<String>(
              value: _factoryId,
              decoration: const InputDecoration(labelText: 'المصنع', prefixIcon: Icon(Icons.factory)),
              items: _factories
                  .map((f) => DropdownMenuItem(
                        value: f['id'].toString(),
                        child: Text(f['name_ar']?.toString() ?? '—'),
                      ))
                  .toList(),
              onChanged: (v) => setState(() {
                _factoryId = v;
                _report = null;
              }),
            ),
            const SizedBox(height: 12),
            Row(children: [
              Expanded(
                child: OutlinedButton.icon(
                  icon: const Icon(Icons.date_range),
                  label: Text('من ${formatDateYmd(_from)}'),
                  onPressed: () => _pick(true),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  icon: const Icon(Icons.date_range),
                  label: Text('إلى ${formatDateYmd(_to)}'),
                  onPressed: () => _pick(false),
                ),
              ),
            ]),
            const SizedBox(height: 12),
            ElevatedButton.icon(
              icon: const Icon(Icons.search),
              label: const Text('عرض التقرير'),
              onPressed: _loading ? null : _load,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.white,
                minimumSize: const Size(double.infinity, 48),
              ),
            ),
            if (_loading)
              const Padding(
                padding: EdgeInsets.all(16),
                child: Center(child: CircularProgressIndicator()),
              ),
            if (_err != null)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(_err!, style: const TextStyle(color: AppColors.danger)),
              ),
            if (_report != null) ...[
              const SizedBox(height: 12),
              RepaintBoundary(key: _captureKey, child: _reportBody(_report!)),
            ],
          ],
        ),
      ),
    );
  }

  Widget _reportBody(Map<String, dynamic> r) {
    final rows = ((r['rows'] as List?) ?? []).cast<Map>();
    final factory = (r['factory'] as Map?)?['name_ar']?.toString() ?? '—';
    final byProduct = ((r['by_product'] as List?) ?? []).cast<Map>();
    final cancelled = (r['cancelled_count'] ?? 0) as num;

    return Container(
      color: Colors.white,
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('مؤسسة الغولي لتجارة وتسويق الأسمنت',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: AppColors.primary)),
          const SizedBox(height: 12),
          Text('الإخوة / مصنع $factory المحترمون', style: const TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          const Text('تحية طيبة وبعد،،'),
          const Text('نرجو التكرم بتقييد الكميات والفاكسات الموضحة أدناه في سجلاتكم، وفقًا للبيانات التالية.'),
          const SizedBox(height: 10),
          Text('تقرير الفاكسات والكميات', style: const TextStyle(fontWeight: FontWeight.bold)),
          Text('الفترة: من ${formatDateYmd(_from)} إلى ${formatDateYmd(_to)}'),
          const Divider(),
          if (rows.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Text('لا توجد فاكسات في هذه الفترة'),
            )
          else
            _table(rows),
          const Divider(),
          Text('عدد الفاكسات: ${r['count'] ?? 0}   |   إجمالي الأكياس: ${r['total_bags'] ?? 0}',
              style: const TextStyle(fontWeight: FontWeight.bold)),
          for (final p in byProduct)
            Text('${p['product_name']}: ${p['count']} فاكس، ${p['bags']} كيس'),
          if (cancelled > 0)
            Text('ملغاة (غير محتسبة في الإجماليات): $cancelled',
                style: const TextStyle(color: AppColors.textSecondary)),
          const SizedBox(height: 14),
          const Text('شاكرين لكم حسن تعاونكم، وتفضلوا بقبول خالص التقدير والاحترام.'),
          const SizedBox(height: 6),
          const Text('مؤسسة الغولي لتجارة وتسويق الأسمنت', style: TextStyle(fontWeight: FontWeight.bold)),
          Text('تاريخ إعداد التقرير: ${formatDateYmd(DateTime.now())}',
              style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
        ],
      ),
    );
  }

  Widget _table(List<Map> rows) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: DataTable(
        headingRowHeight: 36,
        dataRowMinHeight: 32,
        dataRowMaxHeight: 48,
        columnSpacing: 16,
        columns: const [
          DataColumn(label: Text('م')),
          DataColumn(label: Text('رقم الفاكس')),
          DataColumn(label: Text('اسم السائق')),
          DataColumn(label: Text('رقم القاطرة')),
          DataColumn(label: Text('نوع الأسمنت')),
          DataColumn(label: Text('عدد الأكياس')),
        ],
        rows: [
          for (var i = 0; i < rows.length; i++)
            DataRow(cells: [
              DataCell(Text('${i + 1}')),
              DataCell(Text('${rows[i]['fax_number'] ?? '—'}${rows[i]['cancelled'] == true ? ' (ملغى)' : ''}')),
              DataCell(Text('${rows[i]['driver_name'] ?? ''}')),
              DataCell(Text('${rows[i]['plate_number'] ?? ''}')),
              DataCell(Text('${rows[i]['product_name'] ?? ''}')),
              DataCell(Text('${rows[i]['bags'] ?? '—'}')),
            ]),
        ],
      ),
    );
  }
}
