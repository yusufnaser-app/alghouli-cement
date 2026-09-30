import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/network/api_client.dart';
import '../../../addresses/data/address_service.dart';
import '../../../addresses/domain/address_model.dart';
import '../../../trader/data/trader_service.dart';
import '../../data/order_service.dart';

class TraderPurchaseScreen extends StatefulWidget {
  const TraderPurchaseScreen({super.key});

  @override
  State<TraderPurchaseScreen> createState() => _TraderPurchaseScreenState();
}

class _TraderPurchaseScreenState extends State<TraderPurchaseScreen> {
  final _api = ApiClient();
  final _orders = OrderService();
  final _trader = TraderService();
  final _addresses = AddressService();
  final _qty = TextEditingController(text: '100');
  final _notes = TextEditingController();

  List<Map<String, dynamic>> _factories = [];
  List<Map<String, dynamic>> _products = [];
  List<Map<String, dynamic>> _drivers = [];
  List<Map<String, dynamic>> _vehicles = [];
  List<Address> _addressesList = [];

  String? _factoryId;
  String? _productId;
  String? _addressId;
  String? _driverId;
  String? _vehicleId;
  String _deliveryType = 'trader_pickup';
  String _submitMode = 'order_only';
  String _transportBeneficiary = 'driver';
  bool _loading = true;
  bool _sending = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _qty.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final results = await Future.wait([
        _api.get('/sources'),
        _api.get('/products'),
        _trader.listDrivers(),
        _trader.listVehicles(),
        _addresses.list(),
      ]);
      final factories = ((results[0].data['data'] as List?) ?? [])
          .map((e) => Map<String, dynamic>.from(e)).toList();
      final products = ((results[1].data['data'] as List?) ?? [])
          .map((e) => Map<String, dynamic>.from(e)).toList();
      setState(() {
        _factories = factories;
        _products = products;
        _drivers = results[2];
        _vehicles = results[3];
        _addressesList = results[4];
        _factoryId = factories.isNotEmpty ? factories.first['id'] : null;
        _addressId = _addressesList.isNotEmpty ? _addressesList.first.id : null;
        _syncProduct();
      });
    } on DioException catch (e) {
      setState(() => _error = handleApiError(e));
    } catch (e) {
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _syncProduct() {
    final available = _products.where((p) => p['source_id'] == _factoryId).toList();
    if (_productId == null || !available.any((p) => p['id'] == _productId)) {
      _productId = available.isNotEmpty ? available.first['id'] : null;
    }
  }

  List<Map<String, dynamic>> get _factoryProducts =>
      _products.where((p) => p['source_id'] == _factoryId).toList();

  List<Map<String, dynamic>> get _driverVehicles => _vehicles.where((v) =>
      _driverId == null || v['current_driver_id'] == _driverId).toList();

  Future<void> _submit() async {
    final quantity = double.tryParse(_qty.text.trim());
    if (_factoryId == null || _productId == null) {
      setState(() => _error = 'اختر المصنع ونوع الأسمنت');
      return;
    }
    if (quantity == null || quantity <= 0) {
      setState(() => _error = 'أدخل كمية صحيحة');
      return;
    }
    if (_deliveryType == 'alghouli_delivery' && _addressId == null) {
      setState(() => _error = 'اختر عنوان التسليم');
      return;
    }
    if (_deliveryType == 'trader_pickup' && (_driverId == null || _vehicleId == null)) {
      setState(() => _error = 'اختر السائق والقاطرة');
      return;
    }
    if (_submitMode == 'order_fax' && _deliveryType == 'trader_pickup' &&
        (_driverId == null || _vehicleId == null)) {
      setState(() => _error = 'طلب الفاكس يحتاج سائقًا وقاطرة');
      return;
    }

    setState(() { _sending = true; _error = null; });
    try {
      final result = await _orders.createOrder(
        addressId: _deliveryType == 'alghouli_delivery' ? _addressId : null,
        items: [{'productId': _productId, 'quantity': quantity}],
        notes: _notes.text.trim(),
        deliveryType: _deliveryType,
        traderDriverId: _deliveryType == 'trader_pickup' ? _driverId : null,
        traderVehicleId: _deliveryType == 'trader_pickup' ? _vehicleId : null,
        traderTruckPlate: _deliveryType == 'trader_pickup'
            ? _vehicles.firstWhere((v) => v['id'] == _vehicleId)['plate_number']
            : null,
        traderDriverName: _deliveryType == 'trader_pickup'
            ? _drivers.firstWhere((d) => d['id'] == _driverId)['full_name']
            : null,
        traderDriverPhone: _deliveryType == 'trader_pickup'
            ? _drivers.firstWhere((d) => d['id'] == _driverId)['phone']
            : null,
        faxRequested: _submitMode == 'order_fax',
        transportBeneficiary: _deliveryType == 'trader_pickup' ? _transportBeneficiary : null,
      );
      if (!mounted) return;
      Navigator.pop(context, result);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('تم إرسال طلبك بنجاح، يرجى انتظار مراجعة وتأكيد المؤسسة')),
      );
    } catch (e) {
      if (mounted) setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('طلب شراء أسمنت')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  _header(),
                  if (_error != null) _errorBox(),
                  _label('المصنع'),
                  DropdownButtonFormField<String>(
                    value: _factoryId,
                    items: _factories.map((f) => DropdownMenuItem<String>(
                      value: f['id'], child: Text(f['name_ar'] ?? 'مصنع'),
                    )).toList(),
                    onChanged: (v) => setState(() { _factoryId = v; _syncProduct(); }),
                  ),
                  const SizedBox(height: 14),
                  _label('نوع الأسمنت'),
                  DropdownButtonFormField<String>(
                    value: _productId,
                    items: _factoryProducts.map((p) => DropdownMenuItem<String>(
                      value: p['id'], child: Text(p['name_ar'] ?? 'أسمنت'),
                    )).toList(),
                    onChanged: (v) => setState(() => _productId = v),
                  ),
                  const SizedBox(height: 14),
                  _label('الكمية'),
                  TextField(
                    controller: _qty,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    decoration: const InputDecoration(prefixIcon: Icon(Icons.inventory_2), suffixText: 'كيس / طن'),
                  ),
                  const SizedBox(height: 18),
                  _label('طريقة النقل'),
                  _choice('trader_pickup', 'لدي سائق وقاطرة', 'السائق والقاطرة تابعان للتاجر', Icons.local_shipping),
                  _choice('alghouli_delivery', 'توصيل بواسطة مؤسسة الغولي', 'المؤسسة تعين السائق والقاطرة بعد اعتماد الدفع', Icons.fire_truck),
                  if (_deliveryType == 'trader_pickup') _traderTransport(),
                  if (_deliveryType == 'alghouli_delivery') _deliveryAddress(),
                  const SizedBox(height: 12),
                  _label('طريقة الإرسال'),
                  _choice('order_only', 'إرسال الطلب فقط', 'يمكن طلب الفاكس لاحقًا من الموظف', Icons.send),
                  _choice('order_fax', 'إرسال الطلب + طلب الفاكس', 'يتم تجهيز طلب الفاكس من نفس بيانات الطلب', Icons.description),
                  const SizedBox(height: 12),
                  if (_deliveryType == 'trader_pickup') ...[
                    _label('مستفيد أجور النقل'),
                    _choice('driver', 'لحساب السائق', 'تُقيد أجور النقل للسائق', Icons.person),
                    _choice('trader', 'لحساب التاجر', 'تُقيد أجور النقل على حساب التاجر', Icons.store),
                  ],
                  const SizedBox(height: 12),
                  TextField(
                    controller: _notes,
                    maxLines: 3,
                    decoration: const InputDecoration(labelText: 'ملاحظات اختيارية', prefixIcon: Icon(Icons.notes)),
                  ),
                  const SizedBox(height: 20),
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(color: AppColors.info.withOpacity(.08), borderRadius: BorderRadius.circular(12)),
                    child: const Text('تنبيه: السعر لا يحدده التاجر. ستحدد المؤسسة سعر الكيس والإجمالي والخصم وأجور النقل بعد مراجعة الطلب.'),
                  ),
                  const SizedBox(height: 20),
                  SizedBox(height: 54, child: ElevatedButton.icon(
                    onPressed: _sending ? null : _submit,
                    icon: _sending ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Icon(Icons.send),
                    label: Text(_sending ? 'جاري الإرسال...' : 'إرسال الطلب'),
                  )),
                ],
              ),
            ),
    );
  }

  Widget _header() => Container(
    margin: const EdgeInsets.only(bottom: 18), padding: const EdgeInsets.all(18),
    decoration: BoxDecoration(color: AppColors.primary, borderRadius: BorderRadius.circular(16)),
    child: const Row(children: [
      Icon(Icons.request_quote, color: Colors.white, size: 36), SizedBox(width: 12),
      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('طلب شراء أسمنت', style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
        SizedBox(height: 4), Text('اختر البيانات فقط، والسعر تحدده المؤسسة', style: TextStyle(color: Colors.white70)),
      ])),
    ]),
  );

  Widget _traderTransport() => Column(children: [
    const SizedBox(height: 12), _label('السائق'),
    DropdownButtonFormField<String>(
      value: _driverId,
      items: _drivers.map((d) => DropdownMenuItem<String>(value: d['id'], child: Text('${d['full_name']} — ${d['phone'] ?? ''}'))).toList(),
      onChanged: (v) => setState(() { _driverId = v; _vehicleId = null; }),
      decoration: const InputDecoration(prefixIcon: Icon(Icons.person_outline)),
    ),
    const SizedBox(height: 12), _label('القاطرة'),
    DropdownButtonFormField<String>(
      value: _vehicleId,
      items: _driverVehicles.map((v) => DropdownMenuItem<String>(value: v['id'], child: Text('${v['plate_number']} — ${v['vehicle_type'] ?? ''}'))).toList(),
      onChanged: (v) => setState(() => _vehicleId = v),
      decoration: const InputDecoration(prefixIcon: Icon(Icons.local_shipping_outlined)),
    ),
  ]);

  Widget _deliveryAddress() => Column(children: [
    const SizedBox(height: 12), _label('عنوان التسليم'),
    if (_addressesList.isEmpty)
      const Text('لا يوجد عنوان محفوظ. أضف عنوانًا من قسم العناوين أولًا.', style: TextStyle(color: AppColors.danger))
    else
      DropdownButtonFormField<String>(
        value: _addressId,
        items: _addressesList.map((a) => DropdownMenuItem<String>(value: a.id, child: Text('${a.label} — ${a.area}'))).toList(),
        onChanged: (v) => setState(() => _addressId = v),
      ),
  ]);

  Widget _choice(String value, String title, String subtitle, IconData icon) {
    final selected = (_deliveryType == value || _submitMode == value || _transportBeneficiary == value);
    final callback = value.startsWith('trader_') || value == 'alghouli_delivery'
        ? () => setState(() => _deliveryType = value)
        : value.startsWith('order_')
            ? () => setState(() => _submitMode = value)
            : () => setState(() => _transportBeneficiary = value);
    return InkWell(
      onTap: callback,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        margin: const EdgeInsets.only(bottom: 8), padding: const EdgeInsets.all(13),
        decoration: BoxDecoration(color: selected ? AppColors.primary.withOpacity(.08) : Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: selected ? AppColors.primary : AppColors.divider, width: selected ? 2 : 1)),
        child: Row(children: [Icon(icon, color: selected ? AppColors.primary : AppColors.textSecondary), const SizedBox(width: 10), Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(title, style: const TextStyle(fontWeight: FontWeight.bold)), Text(subtitle, style: const TextStyle(fontSize: 11, color: AppColors.textSecondary))])), if (selected) const Icon(Icons.check_circle, color: AppColors.primary)]),
      ),
    );
  }

  Widget _label(String text) => Padding(padding: const EdgeInsets.only(bottom: 7), child: Text(text, style: const TextStyle(fontWeight: FontWeight.bold)));
  Widget _errorBox() => Container(margin: const EdgeInsets.only(bottom: 14), padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: AppColors.danger.withOpacity(.08), borderRadius: BorderRadius.circular(10)), child: Text(_error!, style: const TextStyle(color: AppColors.danger)));
}
