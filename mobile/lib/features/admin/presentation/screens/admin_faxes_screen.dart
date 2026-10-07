import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/admin_service.dart';
import '../widgets/admin_async_view.dart';
import 'admin_create_fax_screen.dart';
import 'admin_fax_destinations_screen.dart';

class AdminFaxesScreen extends StatefulWidget {
  const AdminFaxesScreen({super.key});
  @override
  State<AdminFaxesScreen> createState() => _State();
}

class _State extends State<AdminFaxesScreen> {
  final _service = AdminService();
  Map<String, dynamic> _ops = {};
  List<Map<String, dynamic>> _all = [];
  bool _loading = true;
  String? _error;
  String _status = 'ALL';
  final _searchCtrl = TextEditingController();

  static const _statuses = [
    {'key': 'ALL', 'label': 'الكل', 'color': AppColors.primary},
    {'key': 'REQUESTED', 'label': 'بانتظار الاعتماد', 'color': AppColors.warning},
    {'key': 'APPROVED', 'label': 'معتمد', 'color': AppColors.info},
    {'key': 'ISSUED', 'label': 'صادر', 'color': AppColors.accent},
    {'key': 'USED', 'label': 'مُحمَّل', 'color': AppColors.success},
    {'key': 'READY_FOR_TRANSIT', 'label': 'في الطريق', 'color': AppColors.primary},
    {'key': 'DELIVERED', 'label': 'مُسلَّم', 'color': AppColors.success},
    {'key': 'CANCELLED', 'label': 'ملغي', 'color': AppColors.danger},
  ];

  // أقسام كل تبويب — بنفس مفاتيح classifyOperations في الخادم، وبهذا الترتيب
  static const _institutionSections = [
    ['pending_approval', 'بانتظار الاعتماد'],
    ['approved_pending_factory', 'معتمد — بانتظار الوصول للمصنع'],
    ['at_factory', 'داخل المصنع'],
    ['loaded_pending_destinations', 'مُحمَّل — بانتظار الوجهات'],
    ['in_transit', 'في الطريق'],
    ['completed_recent', 'مكتمل مؤخرًا'],
    ['cancelled_recent', 'ملغى مؤخرًا'],
  ];
  static const _traderSections = [
    ['pending_approval', 'بانتظار الاعتماد'],
    ['ready_for_factory', 'جاهز للتوجه للمصنع'],
    ['at_factory', 'داخل المصنع'],
    ['loaded_in_transit', 'مُحمَّل / في الطريق'],
    ['completed_recent', 'مكتمل مؤخرًا'],
    ['cancelled_recent', 'ملغى مؤخرًا'],
  ];

  @override
  void initState() {
    super.initState();
    _load();
    _searchCtrl.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  List<Map<String, dynamic>> _asList(dynamic v) {
    if (v is! List) return [];
    return v.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final ops = await _service.operationsCenter();
      if (mounted) {
        setState(() {
          _ops = ops;
          _all = _asList(ops['all']);
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString().replaceFirst('Exception: ', '');
          _loading = false;
        });
      }
    }
  }

  bool _matches(Map<String, dynamic> f) {
    if (_status != 'ALL' && f['status'] != _status) return false;
    final q = _searchCtrl.text.trim().toLowerCase();
    if (q.isEmpty) return true;
    final n = (f['fax_number'] ?? '').toString().toLowerCase();
    final d = (f['driver_name'] ?? '').toString().toLowerCase();
    final o = (f['order_number'] ?? '').toString().toLowerCase();
    return n.contains(q) || d.contains(q) || o.contains(q);
  }

  List<List<String>> _sectionsOf(String seg) => seg == 'trader' ? _traderSections : _institutionSections;

  List<Map<String, dynamic>> _bucket(String seg, String key) {
    final m = _ops[seg];
    if (m is! Map) return [];
    return _asList(m[key]);
  }

  int _segmentCount(String seg) {
    int n = 0;
    for (final s in _sectionsOf(seg)) {
      n += _bucket(seg, s[0]).length;
    }
    return n;
  }

  void _snack(String m, Color c) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m), backgroundColor: c));

  /// ينفّذ إجراءً ثم يحدّث القائمة؛ الخطأ يظهر برسالة واضحة بدل استثناء غير معالَج.
  Future<void> _run(Future<void> Function() action) async {
    try {
      await action();
    } catch (e) {
      if (mounted) _snack(e.toString().replaceFirst('Exception: ', ''), AppColors.danger);
    }
    if (mounted) await _load();
  }

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: TextDirection.rtl,
      child: DefaultTabController(
        length: 3,
        child: Scaffold(
          appBar: AppBar(
            title: const Text('الفاكسات'),
            actions: [
              IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
              IconButton(
                icon: const Icon(Icons.add),
                onPressed: () async {
                  await Navigator.push(
                      context, MaterialPageRoute(builder: (_) => const AdminCreateFaxScreen()));
                  _load();
                },
              ),
            ],
            bottom: TabBar(tabs: [
              Tab(text: 'مؤسسة (${_segmentCount('institution')})'),
              Tab(text: 'تاجر (${_segmentCount('trader')})'),
              Tab(text: 'الكل (${_all.length})'),
            ]),
          ),
          body: Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(12),
                child: TextField(
                  controller: _searchCtrl,
                  decoration: InputDecoration(
                    hintText: 'بحث برقم الفاكس أو السائق أو الطلب',
                    prefixIcon: const Icon(Icons.search),
                    suffixIcon: _searchCtrl.text.isNotEmpty
                        ? IconButton(icon: const Icon(Icons.close), onPressed: () => _searchCtrl.clear())
                        : null,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
              ),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: Row(
                  children: _statuses.map((s) {
                    final selected = _status == s['key'];
                    return Padding(
                      padding: const EdgeInsets.only(left: 6),
                      child: FilterChip(
                        label: Text(s['label'] as String,
                            style: TextStyle(color: selected ? Colors.white : null, fontSize: 12)),
                        selected: selected,
                        onSelected: (_) => setState(() => _status = s['key'] as String),
                        selectedColor: s['color'] as Color,
                        checkmarkColor: Colors.white,
                      ),
                    );
                  }).toList(),
                ),
              ),
              const SizedBox(height: 8),
              Expanded(
                child: TabBarView(children: [
                  _segmentBody('institution'),
                  _segmentBody('trader'),
                  _allBody(),
                ]),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _segmentBody(String seg) {
    final children = <Widget>[];
    for (final s in _sectionsOf(seg)) {
      final list = _bucket(seg, s[0]).where(_matches).toList();
      if (list.isEmpty) continue;
      children.add(_sectionHeader(s[1], list.length));
      children.addAll(list.map(_faxCard));
    }
    return AdminAsyncView(
      loading: _loading,
      error: _error,
      isEmpty: children.isEmpty,
      emptyText: 'لا توجد فاكسات',
      onRetry: _load,
      builder: () => RefreshIndicator(
        onRefresh: _load,
        child: ListView(padding: const EdgeInsets.all(12), children: children),
      ),
    );
  }

  Widget _allBody() {
    final list = _all.where(_matches).toList();
    return AdminAsyncView(
      loading: _loading,
      error: _error,
      isEmpty: list.isEmpty,
      emptyText: 'لا توجد فاكسات',
      onRetry: _load,
      builder: () => RefreshIndicator(
        onRefresh: _load,
        child: ListView.builder(
          padding: const EdgeInsets.all(12),
          itemCount: list.length,
          itemBuilder: (_, i) => _faxCard(list[i], showFleet: true),
        ),
      ),
    );
  }

  Widget _sectionHeader(String title, int count) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 8, 4, 8),
      child: Row(
        children: [
          Expanded(
            child: Text(title,
                style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.primary)),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
            decoration: BoxDecoration(
              color: AppColors.primary.withOpacity(0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Text('$count', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }

  Widget _faxCard(Map<String, dynamic> f, {bool showFleet = false}) {
    final status = (f['status'] ?? '').toString();
    final st = _statuses.firstWhere((s) => s['key'] == status,
        orElse: () => {'label': status, 'color': AppColors.textSecondary});
    final color = st['color'] as Color;
    final isTrader = f['fleet_type'] == 'trader_driver';
    final destCount = int.tryParse((f['destinations_count'] ?? '').toString());

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    f['fax_number']?.toString() ?? f['order_number']?.toString() ?? '—',
                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                  ),
                ),
                if (showFleet)
                  Padding(
                    padding: const EdgeInsets.only(left: 6),
                    child: Chip(
                      label: Text(isTrader ? 'تاجر' : 'مؤسسة', style: const TextStyle(fontSize: 11)),
                      visualDensity: VisualDensity.compact,
                    ),
                  ),
                Chip(
                  label: Text(st['label'] as String,
                      style: const TextStyle(color: Colors.white, fontSize: 11)),
                  backgroundColor: color,
                ),
              ],
            ),
            const SizedBox(height: 8),
            Wrap(spacing: 12, runSpacing: 4, children: [
              if (f['driver_name'] != null) _info(Icons.person, f['driver_name'].toString()),
              if (f['plate_number'] != null) _info(Icons.local_shipping, f['plate_number'].toString()),
              if (f['factory_name'] != null) _info(Icons.factory, f['factory_name'].toString()),
              if (f['requested_quantity'] != null) _info(Icons.inventory_2, '${f['requested_quantity']} كيس'),
              if (destCount != null) _info(Icons.place, '$destCount وجهة'),
              if (f['route'] != null) _info(Icons.route, f['route'].toString()),
            ]),
            const SizedBox(height: 10),
            Wrap(spacing: 8, children: _actions(f)),
          ],
        ),
      ),
    );
  }

  double? _num(dynamic v) => v == null ? null : double.tryParse(v.toString());

  List<Widget> _actions(Map<String, dynamic> f) {
    final id = f['id'].toString();
    final status = (f['status'] ?? '').toString();
    final actions = <Widget>[];

    if (status == 'REQUESTED') {
      actions.add(_btn('اعتماد', AppColors.info, () => _run(() => _service.approveFax(id))));
    }
    if (status == 'APPROVED' || status == 'REQUESTED') {
      actions.add(_btn('إصدار + إشعار', AppColors.accent, () async {
        final num = await _askFaxNumber();
        if (num != null && num.isNotEmpty) await _run(() => _service.issueAndNotify(id, num));
      }));
    }
    // الإلغاء مسموح في الخادم لـ REQUESTED/APPROVED/ISSUED فقط
    if (status == 'REQUESTED' || status == 'APPROVED' || status == 'ISSUED') {
      actions.add(_btn('إلغاء', AppColors.danger, () async {
        final ok = await _confirm('إلغاء الفاكس؟');
        if (ok) await _run(() => _service.cancelFax(id));
      }));
    }

    // وجهات التسليم — لغير الملغى/المُسلَّم
    if (status != 'CANCELLED' && status != 'DELIVERED') {
      final requested = _num(f['requested_quantity']);
      final approved = _num(f['approved_quantity']);
      final loadedQ = _num(f['loaded_quantity']);
      // نفس ترتيب الخادم لسعة الفاكس: المحمَّل ثم المعتمد ثم المطلوب
      final capacity = loadedQ ?? approved ?? requested ?? 0;
      actions.add(_btn('وجهات التسليم', AppColors.primary, () async {
        await Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => AdminFaxDestinationsScreen(
              faxId: id,
              faxNumber: f['fax_number']?.toString() ?? f['order_number']?.toString() ?? '',
              loadedQuantity: capacity,
              faxStatus: status,
              transportSet: f['transport_rate'] != null,
              approvedQuantity: approved,
              requestedQuantity: requested,
            ),
          ),
        );
        _load();
      }));
    }

    return actions;
  }

  Widget _btn(String text, Color color, VoidCallback onTap) {
    return ElevatedButton(
      onPressed: onTap,
      style: ElevatedButton.styleFrom(
        backgroundColor: color,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        minimumSize: const Size(0, 34),
        textStyle: const TextStyle(fontSize: 12),
      ),
      child: Text(text),
    );
  }

  Widget _info(IconData icon, String text) {
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(icon, size: 13, color: AppColors.textSecondary),
      const SizedBox(width: 3),
      Text(text, style: const TextStyle(fontSize: 12)),
    ]);
  }

  Future<String?> _askFaxNumber() async {
    final ctrl = TextEditingController();
    final result = await showDialog<String>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('رقم الفاكس'),
        content: TextField(controller: ctrl, decoration: const InputDecoration(hintText: 'FX-2026-00001')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('إلغاء')),
          TextButton(onPressed: () => Navigator.pop(context, ctrl.text.trim()), child: const Text('إصدار')),
        ],
      ),
    );
    ctrl.dispose();
    return result;
  }

  Future<bool> _confirm(String msg) async {
    return await showDialog<bool>(
          context: context,
          builder: (_) => AlertDialog(
            title: Text(msg),
            actions: [
              TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('لا')),
              TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('نعم')),
            ],
          ),
        ) ??
        false;
  }
}
