import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/widgets/primary_button.dart';
import '../../data/payment_service.dart';

class UploadReceiptScreen extends StatefulWidget {
  final String orderId;
  final double totalAmount;

  const UploadReceiptScreen({
    super.key,
    required this.orderId,
    required this.totalAmount,
  });

  @override
  State<UploadReceiptScreen> createState() => _UploadReceiptScreenState();
}

class _UploadReceiptScreenState extends State<UploadReceiptScreen> {
  final _service = PaymentService();
  final _amountController = TextEditingController();
  final _refController = TextEditingController();

  List<Map<String, dynamic>> _methods = [];
  String? _selectedMethodId;
  DateTime _transferDate = DateTime.now();
  bool _loading = false;
  bool _loadingMethods = true;
  String? _error;
  XFile? _receiptImage;

  @override
  void initState() {
    super.initState();
    _amountController.text = widget.totalAmount.toStringAsFixed(0);
    _loadMethods();
  }

  @override
  void dispose() {
    _amountController.dispose();
    _refController.dispose();
    super.dispose();
  }

  Future<void> _loadMethods() async {
    try {
      final list = await _service.methods();
      final traderMethods = list.where((m) => ['network_transfer', 'e_wallet'].contains(m['code'])).toList();
      setState(() {
        _methods = traderMethods;
        if (list.isNotEmpty) _selectedMethodId = list.first['id'];
      });
    } catch (e) {
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      setState(() => _loadingMethods = false);
    }
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _transferDate,
      firstDate: DateTime.now().subtract(const Duration(days: 30)),
      lastDate: DateTime.now(),
    );
    if (picked != null) setState(() => _transferDate = picked);
  }

  Future<void> _pickReceipt(ImageSource source) async {
    try {
      final image = await ImagePicker().pickImage(source: source, imageQuality: 80, maxWidth: 1600);
      if (image != null && mounted) setState(() => _receiptImage = image);
    } catch (e) {
      if (mounted) setState(() => _error = 'تعذر اختيار صورة الإيصال');
    }
  }

  Future<void> _submit() async {
    if (_selectedMethodId == null) {
      setState(() => _error = 'يرجى اختيار طريقة الدفع');
      return;
    }

    final amount = double.tryParse(_amountController.text.trim());
    if (amount == null || amount <= 0) {
      setState(() => _error = 'يرجى إدخال مبلغ صحيح');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final dateStr = '${_transferDate.year}-${_transferDate.month.toString().padLeft(2, '0')}-${_transferDate.day.toString().padLeft(2, '0')}';
      if (_receiptImage == null) {
        setState(() => _error = 'صورة إيصال التحويل مطلوبة');
        return;
      }

      final uploaded = await _service.uploadReceipt(_receiptImage!.path);
      await _service.submit(
        orderId: widget.orderId,
        methodId: _selectedMethodId!,
        amount: amount,
        transferDate: dateStr,
        transactionRef: _refController.text.trim(),
        receiptUrl: uploaded['url']?.toString(),
        receiptPath: uploaded['path']?.toString(),
      );

      if (!mounted) return;
      Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('رفع إيصال الدفع')),
      body: _loadingMethods
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: AppColors.primary.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Column(
                      children: [
                        const Text('المبلغ المطلوب',
                            style: TextStyle(
                                color: AppColors.textSecondary)),
                        const SizedBox(height: 4),
                        Text(
                          '${widget.totalAmount.toStringAsFixed(0)} ريال',
                          style: const TextStyle(
                            fontSize: 24,
                            fontWeight: FontWeight.bold,
                            color: AppColors.primary,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 24),
                  if (_error != null) ...[
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppColors.danger.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(_error!,
                          style: const TextStyle(color: AppColors.danger)),
                    ),
                    const SizedBox(height: 16),
                  ],
                  _lbl('طريقة الدفع'),
                  DropdownButtonFormField<String>(
                    value: _selectedMethodId,
                    decoration: const InputDecoration(
                      prefixIcon: Icon(Icons.payment),
                    ),
                    items: _methods
                        .map((m) => DropdownMenuItem<String>(
                              value: m['id'] as String,
                              child: Text(m['name_ar'] ?? ''),
                            ))
                        .toList(),
                    onChanged: (v) => setState(() => _selectedMethodId = v),
                  ),
                  const SizedBox(height: 16),
                  _lbl('المبلغ المحول'),
                  TextField(
                    controller: _amountController,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      hintText: '600000',
                      prefixIcon: Icon(Icons.attach_money),
                    ),
                  ),
                  const SizedBox(height: 16),
                  _lbl('رقم العملية / المرجع'),
                  TextField(
                    controller: _refController,
                    decoration: const InputDecoration(
                      hintText: 'TXN-123456',
                      prefixIcon: Icon(Icons.tag),
                    ),
                  ),
                  const SizedBox(height: 16),
                  _lbl('صورة إيصال التحويل *'),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppColors.divider),
                    ),
                    child: Column(
                      children: [
                        if (_receiptImage != null)
                          ClipRRect(
                            borderRadius: BorderRadius.circular(8),
                            child: Image.file(File(_receiptImage!.path), height: 180, fit: BoxFit.cover),
                          ),
                        if (_receiptImage != null) const SizedBox(height: 10),
                        Row(
                          children: [
                            Expanded(child: OutlinedButton.icon(onPressed: () => _pickReceipt(ImageSource.camera), icon: const Icon(Icons.camera_alt), label: const Text('الكاميرا'))),
                            const SizedBox(width: 8),
                            Expanded(child: OutlinedButton.icon(onPressed: () => _pickReceipt(ImageSource.gallery), icon: const Icon(Icons.photo_library), label: const Text('المعرض'))),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  _lbl('تاريخ التحويل'),
                  InkWell(
                    onTap: _pickDate,
                    child: Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: AppColors.divider),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.calendar_today,
                              color: AppColors.primary),
                          const SizedBox(width: 12),
                          Text(
                            '${_transferDate.year}-${_transferDate.month.toString().padLeft(2, '0')}-${_transferDate.day.toString().padLeft(2, '0')}',
                          ),
                          const Spacer(),
                          const Icon(Icons.arrow_drop_down),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppColors.info.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Row(
                      children: [
                        Icon(Icons.info_outline, color: AppColors.info),
                        SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'سيتم مراجعة الدفع من قبل مؤسسة الغولي واعتماده قبل التجهيز',
                            style: TextStyle(fontSize: 12),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 24),
                  PrimaryButton(
                    text: 'إرسال للمراجعة',
                    icon: Icons.send,
                    isLoading: _loading,
                    onPressed: _submit,
                  ),
                ],
              ),
            ),
    );
  }

  Widget _lbl(String t) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(t,
            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
      );
}
