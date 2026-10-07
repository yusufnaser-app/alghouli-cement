import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/admin_service.dart';
import '../widgets/admin_async_view.dart';

const double _bagsPerTon = 20; // الكيس = 50 كغ، الطن = 20 كيسًا

class AdminFaxDestinationsScreen extends StatefulWidget {
  final String faxId;
  final String faxNumber;

  /// سعة الفاكس بالأكياس (المحمَّل ثم المعتمد ثم المطلوب — كما يحسبها الخادم).
  final double loadedQuantity;

  /// لعرض قسم سعر النقل: يظهر فقط لفاكس USED لم يُسعَّر بعد.
  final String? faxStatus;
  final bool transportSet;
  final double? approvedQuantity;
  final double? requestedQuantity;

  const AdminFaxDestinationsScreen({
    super.key,
    required this.faxId,
    required this.faxNumber,
    required this.loadedQuantity,
    this.faxStatus,
    this.transportSet = false,
    this.approvedQuantity,
    this.requestedQuantity,
  });

  @override
  State<AdminFaxDestinationsScreen> createState() => _S();
}

class _Row {
  String type; // trader | warehouse
  String? traderId;
  String? warehouseId;
  String unit; // bag | ton
  String? staleNote; // تنبيه: الجهة المحفوظة لم تعد متاحة
  final TextEditingController qtyCtrl;
  final TextEditingController labelCtrl;

  _Row({this.type = 'trader', this.unit = 'bag'})
      : qtyCtrl = TextEditingController(),
        labelCtrl = TextEditingController();

  double get qty => double.tryParse(qtyCtrl.text.trim()) ?? 0;
  double get bags => qty * (unit == 'ton' ? _bagsPerTon : 1);

  void dispose() {
    qtyCtrl.dispose();
    labelCtrl.dispose();
  }
}

class _S extends State<AdminFaxDestinationsScreen> {
  final _svc = AdminService();
  List<Map<String, dynamic>> _traders = [];
  List<Map<String, dynamic>> _warehouses = [];

  /// وجهات لا تُعدَّل من هنا: مُسلَّمة/ملغاة، أو مرتبطة بطلب (fulfills_order_id).
  /// لا تُرسل في الحفظ (الخادم يحتفظ بها)، لكن كمياتها تُحسب ضمن المجموع.
  final List<Map<String, dynamic>> _locked = [];
  final List<_Row> _rows = [];

  bool _loading = true;
  bool _saving = false;
  String? _loadError;
  String? _error;

  // سعر النقل
  bool _setTransport = true;
  final _rateCtrl = TextEditingController();
  final _payerNoteCtrl = TextEditingController();
  String _rateUnit = 'bag';
  String _baseOn = 'loaded_quantity';
  String _payer = 'institution';
  String? _payerTraderId;

  bool get _canSetTransport => widget.faxStatus == 'USED' && !widget.transportSet;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final r in _rows) {
      r.dispose();
    }
    _rateCtrl.dispose();
    _payerNoteCtrl.dispose();
    super.dispose();
  }

  bool _isLocked(Map<String, dynamic> d) {
    final status = (d['status'] ?? 'PENDING').toString();
    final fulfills = (d['fulfills_order_id'] ?? '').toString();
    return status != 'PENDING' || fulfills.isNotEmpty;
  }

  bool _hasId(List<Map<String, dynamic>> list, String? id) {
    if (id == null || id.isEmpty) return false;
    for (final e in list) {
      if (e['id']?.toString() == id) return true;
    }
    return false;
  }

  Map<String, dynamic>? _byId(List<Map<String, dynamic>> list, String? id) {
    if (id == null) return null;
    for (final e in list) {
      if (e['id']?.toString() == id) return e;
    }
    return null;
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _loadError = null;
    });
    try {
      final results = await Future.wait([
        _svc.tradersList(),
        _svc.warehouses(),
        _svc.faxDestinations(widget.faxId),
      ]);
      if (!mounted) return;
      final traders = results[0];
      final warehouses = results[1];
      final existing = results[2];

      for (final r in _rows) {
        r.dispose();
      }
      _rows.clear();
      _locked.clear();

      for (final d in existing) {
        if (_isLocked(d)) {
          _locked.add(d);
          continue;
        }
        final r = _Row(
          type: d['destination_type']?.toString() ?? 'trader',
          unit: d['unit']?.toString() == 'ton' ? 'ton' : 'bag',
        );
        final tid = d['trader_id']?.toString();
        final wid = d['warehouse_id']?.toString();
        final lbl = (d['label'] ?? d['trader_name'] ?? d['warehouse_name'] ?? '').toString();
        // مرجع محذوف/غير نشط: لا نضعه في Dropdown (يسبب انهيارًا) ونُنبّه المستخدم
        if (r.type == 'trader') {
          if (_hasId(traders, tid)) {
            r.traderId = tid;
          } else {
            r.staleNote = 'التاجر "$lbl" لم يعد متاحًا (محذوف أو غير نشط) — اختر بديلًا';
          }
        } else {
          if (_hasId(warehouses, wid)) {
            r.warehouseId = wid;
          } else {
            r.staleNote = 'المستودع "$lbl" لم يعد متاحًا — اختر بديلًا';
          }
        }
        final q = double.tryParse(d['quantity']?.toString() ?? '0') ?? 0;
        r.qtyCtrl.text = _fmt(q);
        r.labelCtrl.text = d['label']?.toString() ?? '';
        _rows.add(r);
      }
      if (_rows.isEmpty) _rows.add(_Row());

      setState(() {
        _traders = traders;
        _warehouses = warehouses;
        _loading = false;
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          _loadError = e.toString().replaceFirst('Exception: ', '');
          _loading = false;
        });
      }
    }
  }

  static String _fmt(double v) =>
      v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(2);

  void _addRow() => setState(() => _rows.add(_Row()));

  void _removeRow(int i) {
    if (_rows.length <= 1) return;
    setState(() {
      _rows[i].dispose();
      _rows.removeAt(i);
    });
  }

  // ── المجاميع (كلها بالأكياس) ──
  double get _lockedBags {
    double sum = 0;
    for (final d in _locked) {
      if ((d['status'] ?? '').toString() == 'CANCELLED') continue;
      final q = double.tryParse(d['quantity']?.toString() ?? '0') ?? 0;
      sum += q * (d['unit']?.toString() == 'ton' ? _bagsPerTon : 1);
    }
    return sum;
  }

  double get _rowsBags {
    double sum = 0;
    for (final r in _rows) {
      sum += r.bags;
    }
    return sum;
  }

  double get _totalBags => _lockedBags + _rowsBags;
  bool get _totalMatches => (_totalBags - widget.loadedQuantity).abs() < 0.01;
  bool get _lockedCoversAll => widget.loadedQuantity > 0 && _lockedBags >= widget.loadedQuantity - 0.01;

  // ── معاينة أجرة النقل (تقديرية — الحساب النهائي عند الخادم) ──
  double get _baseQuantity {
    if (_baseOn == 'requested_quantity') {
      return widget.requestedQuantity ?? widget.loadedQuantity;
    }
    if (_baseOn == 'approved_quantity') {
      return widget.approvedQuantity ?? widget.requestedQuantity ?? widget.loadedQuantity;
    }
    return widget.loadedQuantity;
  }

  double get _transportPreview {
    final rate = double.tryParse(_rateCtrl.text.trim()) ?? 0;
    final divisor = _rateUnit == 'ton' ? _bagsPerTon : 1;
    return rate * _baseQuantity / divisor;
  }

  void _onPayerChanged(String v) {
    setState(() {
      _payer = v;
      if (v == 'trader' && _payerTraderId == null) {
        // تاجر واحد فقط في الوجهات → نختاره تلقائيًا (كما يفعل الخادم)
        final ids = <String>{};
        for (final r in _rows) {
          if (r.type == 'trader' && r.traderId != null) ids.add(r.traderId!);
        }
        for (final d in _locked) {
          final t = d['trader_id']?.toString();
          if (d['destination_type']?.toString() == 'trader' && t != null && t.isNotEmpty) ids.add(t);
        }
        if (ids.length == 1 && _hasId(_traders, ids.first)) _payerTraderId = ids.first;
      }
    });
  }

  String? _validate() {
    for (int i = 0; i < _rows.length; i++) {
      final r = _rows[i];
      if (r.type == 'trader' && (r.traderId == null || r.traderId!.isEmpty)) {
        return 'الصف ${i + 1}: اختر التاجر';
      }
      if (r.type == 'warehouse' && (r.warehouseId == null || r.warehouseId!.isEmpty)) {
        return 'الصف ${i + 1}: اختر المستودع';
      }
      if (r.qty <= 0) return 'الصف ${i + 1}: كمية غير صحيحة';
    }
    if (!_totalMatches) {
      return 'المجموع ${_fmt(_totalBags)} كيس ≠ ${_fmt(widget.loadedQuantity)} كيس';
    }
    if (_canSetTransport && _setTransport) {
      final rate = double.tryParse(_rateCtrl.text.trim());
      if (rate == null || rate <= 0) return 'أدخل سعر النقل (رقم أكبر من صفر)';
      if (_payer == 'trader' && !_hasId(_traders, _payerTraderId)) {
        return 'اختر التاجر المتحمّل لأجرة النقل';
      }
    }
    return null;
  }

  Future<void> _submit() async {
    final problem = _validate();
    if (problem != null) {
      setState(() => _error = problem);
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final payload = <Map<String, dynamic>>[];
      for (final r in _rows) {
        final item = <String, dynamic>{
          'destinationType': r.type,
          'quantity': r.qty,
          'unit': r.unit,
        };
        if (r.type == 'trader') {
          item['traderId'] = r.traderId;
        } else {
          item['warehouseId'] = r.warehouseId;
        }
        if (r.labelCtrl.text.trim().isNotEmpty) {
          item['label'] = r.labelCtrl.text.trim();
        }
        payload.add(item);
      }

      Map<String, dynamic>? transport;
      if (_canSetTransport && _setTransport) {
        transport = {
          'transportRate': double.parse(_rateCtrl.text.trim()),
          'transportRateUnit': _rateUnit,
          'transportBaseOn': _baseOn,
          'transportPayer': _payer,
          if (_payer == 'trader') 'transportPayerTraderId': _payerTraderId,
          if (_payerNoteCtrl.text.trim().isNotEmpty) 'transportPayerNote': _payerNoteCtrl.text.trim(),
        };
      }

      await _svc.saveDestinations(widget.faxId, payload, transport: transport);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(transport != null ? '✅ تم حفظ الوجهات وسعر النقل' : '✅ تم حفظ الوجهات'),
          backgroundColor: AppColors.success,
        ),
      );
      Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString().replaceFirst('Exception: ', '');
          _saving = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        backgroundColor: AppColors.background,
        appBar: AppBar(
          title: Text('وجهات ${widget.faxNumber}'),
          actions: [
            IconButton(
              icon: const Icon(Icons.add_location_alt),
              onPressed: _loading || _loadError != null ? null : _addRow,
            ),
          ],
        ),
        body: AdminAsyncView(
          loading: _loading,
          error: _loadError,
          isEmpty: false,
          onRetry: _load,
          builder: _content,
        ),
      ),
    );
  }

  Widget _content() {
    return Column(
      children: [
        _header(),
        if (_error != null)
          Container(
            width: double.infinity,
            margin: const EdgeInsets.symmetric(horizontal: 12),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.danger.withOpacity(0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(_error!, style: const TextStyle(color: AppColors.danger)),
          ),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(12, 6, 12, 12),
            children: [
              ..._locked.map(_lockedCard),
              if (_lockedCoversAll && _locked.isNotEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 8),
                  child: Text(
                    'كمية الفاكس مستوفاة بوجهات مقفلة — لا حاجة لوجهات إضافية.',
                    style: TextStyle(color: AppColors.textSecondary, fontSize: 12),
                  ),
                ),
              if (!_lockedCoversAll)
                for (int i = 0; i < _rows.length; i++) _rowCard(i),
              if (_canSetTransport && !_lockedCoversAll) _transportCard(),
            ],
          ),
        ),
        SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: ElevatedButton.icon(
              onPressed: _saving || _lockedCoversAll || !_totalMatches ? null : _submit,
              icon: _saving
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Icon(Icons.save),
              label: Text(_canSetTransport && _setTransport ? 'حفظ الوجهات + سعر النقل' : 'حفظ الوجهات'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.white,
                minimumSize: const Size(double.infinity, 54),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _header() {
    return Container(
      margin: const EdgeInsets.all(12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.primary.withOpacity(0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.primary.withOpacity(0.3)),
      ),
      child: Row(
        children: [
          Expanded(child: _stat('كمية الفاكس (كيس)', _fmt(widget.loadedQuantity))),
          Container(width: 1, height: 40, color: AppColors.divider),
          Expanded(
            child: _stat(
              'المجموع (كيس)',
              _fmt(_totalBags),
              color: _totalMatches ? AppColors.success : AppColors.danger,
            ),
          ),
        ],
      ),
    );
  }

  Widget _stat(String label, String value, {Color? color}) {
    return Column(
      children: [
        Text(label, style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
        const SizedBox(height: 4),
        Text(value,
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: color ?? AppColors.primary)),
      ],
    );
  }

  Widget _lockedCard(Map<String, dynamic> d) {
    final status = (d['status'] ?? 'PENDING').toString();
    final linked = (d['fulfills_order_id'] ?? '').toString().isNotEmpty;
    late final String label;
    late final Color color;
    if (status == 'DELIVERED') {
      label = 'تم التسليم';
      color = AppColors.success;
    } else if (status == 'CANCELLED') {
      label = 'ملغاة';
      color = AppColors.danger;
    } else {
      label = linked ? 'مرتبطة بطلب — مقفلة' : status;
      color = AppColors.info;
    }
    final unit = d['unit']?.toString() == 'ton' ? 'طن' : 'كيس';
    final q = double.tryParse(d['quantity']?.toString() ?? '0') ?? 0;
    final name = (d['label'] ?? d['trader_name'] ?? d['warehouse_name'] ?? '—').toString();
    final gov = (d['governorate'] ?? '').toString();
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      color: Colors.grey.shade100,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            const Icon(Icons.lock_outline, size: 18, color: AppColors.textSecondary),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(name, style: const TextStyle(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 2),
                  Text('${_fmt(q)} $unit${gov.isEmpty ? '' : ' • $gov'}',
                      style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                ],
              ),
            ),
            Chip(
              label: Text(label, style: const TextStyle(color: Colors.white, fontSize: 11)),
              backgroundColor: color,
            ),
          ],
        ),
      ),
    );
  }

  Widget _rowCard(int i) {
    final r = _rows[i];
    final trader = r.type == 'trader' ? _byId(_traders, r.traderId) : null;
    final warehouse = r.type == 'warehouse' ? _byId(_warehouses, r.warehouseId) : null;

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(
                  backgroundColor: AppColors.primary,
                  child: Text('${i + 1}', style: const TextStyle(color: Colors.white)),
                ),
                const SizedBox(width: 8),
                const Expanded(child: Text('وجهة', style: TextStyle(fontWeight: FontWeight.bold))),
                if (_rows.length > 1)
                  IconButton(
                    icon: const Icon(Icons.delete_outline, color: AppColors.danger),
                    onPressed: () => _removeRow(i),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            Row(children: [
              Expanded(
                child: ChoiceChip(
                  label: const Text('تاجر'),
                  selected: r.type == 'trader',
                  onSelected: (_) => setState(() {
                    r.type = 'trader';
                    r.warehouseId = null;
                    r.staleNote = null;
                  }),
                  selectedColor: AppColors.primary,
                  labelStyle: TextStyle(color: r.type == 'trader' ? Colors.white : null),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: ChoiceChip(
                  label: const Text('مستودع'),
                  selected: r.type == 'warehouse',
                  onSelected: (_) => setState(() {
                    r.type = 'warehouse';
                    r.traderId = null;
                    r.staleNote = null;
                  }),
                  selectedColor: AppColors.info,
                  labelStyle: TextStyle(color: r.type == 'warehouse' ? Colors.white : null),
                ),
              ),
            ]),
            const SizedBox(height: 10),
            if (r.staleNote != null)
              Container(
                width: double.infinity,
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: AppColors.warning.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(r.staleNote!, style: const TextStyle(fontSize: 12)),
              ),
            if (r.type == 'trader')
              DropdownButtonFormField<String>(
                value: _hasId(_traders, r.traderId) ? r.traderId : null,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'التاجر', prefixIcon: Icon(Icons.store)),
                items: _traders
                    .map((t) => DropdownMenuItem<String>(
                          value: t['id'].toString(),
                          child: Text('${t['full_name']} — ${t['phone'] ?? ''}',
                              overflow: TextOverflow.ellipsis),
                        ))
                    .toList(),
                onChanged: (v) => setState(() {
                  r.traderId = v;
                  r.staleNote = null;
                }),
              )
            else
              DropdownButtonFormField<String>(
                value: _hasId(_warehouses, r.warehouseId) ? r.warehouseId : null,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'المستودع', prefixIcon: Icon(Icons.warehouse)),
                items: _warehouses
                    .map((w) => DropdownMenuItem<String>(
                          value: w['id'].toString(),
                          child: Text('${w['name_ar']} (${w['code'] ?? ''})', overflow: TextOverflow.ellipsis),
                        ))
                    .toList(),
                onChanged: (v) => setState(() {
                  r.warehouseId = v;
                  r.staleNote = null;
                }),
              ),
            if (trader != null) ...[
              const SizedBox(height: 6),
              Text('المحافظة: ${trader['governorate'] ?? '—'} • ${trader['area'] ?? ''}',
                  style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
            ],
            if (warehouse != null) ...[
              const SizedBox(height: 6),
              Text('${warehouse['name_ar']} • ${warehouse['governorate'] ?? '—'}',
                  style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
            ],
            const SizedBox(height: 10),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  flex: 3,
                  child: TextField(
                    controller: r.qtyCtrl,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    onChanged: (_) => setState(() {}),
                    decoration: InputDecoration(
                      labelText: 'الكمية',
                      prefixIcon: const Icon(Icons.inventory_2),
                      helperText: r.unit == 'ton' && r.qty > 0 ? '= ${_fmt(r.bags)} كيس' : null,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  flex: 2,
                  child: DropdownButtonFormField<String>(
                    value: r.unit,
                    decoration: const InputDecoration(labelText: 'الوحدة'),
                    items: const [
                      DropdownMenuItem(value: 'bag', child: Text('كيس')),
                      DropdownMenuItem(value: 'ton', child: Text('طن')),
                    ],
                    onChanged: (v) => setState(() => r.unit = v ?? 'bag'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _transportCard() {
    final preview = _transportPreview;
    return Card(
      margin: const EdgeInsets.only(top: 4, bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('تحديد خط السير وسعر النقل مع الحفظ',
                  style: TextStyle(fontWeight: FontWeight.bold)),
              subtitle: const Text('يُنقل الفاكس إلى "في الطريق" ويُشتق خط السير من محافظات الوجهات'),
              value: _setTransport,
              onChanged: (v) => setState(() => _setTransport = v),
            ),
            if (_setTransport) ...[
              const SizedBox(height: 8),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    flex: 3,
                    child: TextField(
                      controller: _rateCtrl,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      onChanged: (_) => setState(() {}),
                      decoration: const InputDecoration(
                        labelText: 'سعر النقل',
                        prefixIcon: Icon(Icons.local_shipping),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    flex: 2,
                    child: DropdownButtonFormField<String>(
                      value: _rateUnit,
                      decoration: const InputDecoration(labelText: 'لكل'),
                      items: const [
                        DropdownMenuItem(value: 'bag', child: Text('كيس')),
                        DropdownMenuItem(value: 'ton', child: Text('طن')),
                      ],
                      onChanged: (v) => setState(() => _rateUnit = v ?? 'bag'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                value: _baseOn,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'الاحتساب على'),
                items: const [
                  DropdownMenuItem(value: 'loaded_quantity', child: Text('الكمية المحمَّلة')),
                  DropdownMenuItem(value: 'approved_quantity', child: Text('الكمية المعتمدة')),
                  DropdownMenuItem(value: 'requested_quantity', child: Text('الكمية المطلوبة')),
                ],
                onChanged: (v) => setState(() => _baseOn = v ?? 'loaded_quantity'),
              ),
              const SizedBox(height: 10),
              const Text('يتحمّل الأجرة', style: TextStyle(fontSize: 12, color: AppColors.textSecondary)),
              const SizedBox(height: 4),
              Row(children: [
                Expanded(
                  child: ChoiceChip(
                    label: const Text('المؤسسة'),
                    selected: _payer == 'institution',
                    onSelected: (_) => _onPayerChanged('institution'),
                    selectedColor: AppColors.primary,
                    labelStyle: TextStyle(color: _payer == 'institution' ? Colors.white : null),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: ChoiceChip(
                    label: const Text('تاجر'),
                    selected: _payer == 'trader',
                    onSelected: (_) => _onPayerChanged('trader'),
                    selectedColor: AppColors.secondary,
                    labelStyle: TextStyle(color: _payer == 'trader' ? Colors.white : null),
                  ),
                ),
              ]),
              if (_payer == 'trader') ...[
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  value: _hasId(_traders, _payerTraderId) ? _payerTraderId : null,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'التاجر المتحمّل', prefixIcon: Icon(Icons.store)),
                  items: _traders
                      .map((t) => DropdownMenuItem<String>(
                            value: t['id'].toString(),
                            child: Text('${t['full_name']} — ${t['phone'] ?? ''}',
                                overflow: TextOverflow.ellipsis),
                          ))
                      .toList(),
                  onChanged: (v) => setState(() => _payerTraderId = v),
                ),
              ],
              const SizedBox(height: 10),
              TextField(
                controller: _payerNoteCtrl,
                maxLength: 500,
                decoration: const InputDecoration(labelText: 'ملاحظة (اختياري)', prefixIcon: Icon(Icons.notes)),
              ),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.primary.withOpacity(0.08),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('الإجمالي المتوقع: ${preview.toStringAsFixed(2)} ريال',
                        style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.primary)),
                    const SizedBox(height: 2),
                    Text('${_fmt(_baseQuantity)} كيس × السعر ÷ ${_rateUnit == 'ton' ? '20 (طن)' : '1 (كيس)'} — تقديري، الخادم يحسب النهائي',
                        style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
