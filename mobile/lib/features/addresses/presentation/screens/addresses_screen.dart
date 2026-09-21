import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/address_service.dart';
import '../../domain/address_model.dart';
import 'add_address_screen.dart';

class AddressesScreen extends StatefulWidget {
  final bool selectionMode;

  const AddressesScreen({super.key, this.selectionMode = false});

  @override
  State<AddressesScreen> createState() => _AddressesScreenState();
}

class _AddressesScreenState extends State<AddressesScreen> {
  final _service = AddressService();
  List<Address> _addresses = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final list = await _service.list();
      setState(() => _addresses = list);
    } catch (e) {
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _openAdd() async {
    final result = await Navigator.push<Address>(
      context,
      MaterialPageRoute(builder: (_) => const AddAddressScreen()),
    );
    if (result != null) {
      _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.selectionMode ? 'اختر العنوان' : 'عناويني'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : _addresses.isEmpty
                  ? _emptyState()
                  : _list(),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _openAdd,
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add),
        label: const Text('عنوان جديد'),
      ),
    );
  }

  Widget _emptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.location_off,
              size: 80, color: AppColors.textSecondary),
          const SizedBox(height: 16),
          const Text('لا توجد عناوين',
              style: TextStyle(fontSize: 18, color: AppColors.textSecondary)),
          const SizedBox(height: 24),
          ElevatedButton.icon(
            onPressed: _openAdd,
            icon: const Icon(Icons.add),
            label: const Text('إضافة عنوان'),
          ),
        ],
      ),
    );
  }

  Widget _list() {
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _addresses.length,
      itemBuilder: (context, i) {
        final a = _addresses[i];
        return Card(
          margin: const EdgeInsets.only(bottom: 12),
          child: ListTile(
            contentPadding: const EdgeInsets.all(16),
            leading: CircleAvatar(
              backgroundColor: AppColors.primary,
              child: Icon(
                a.label == 'المنزل' ? Icons.home : Icons.location_on,
                color: Colors.white,
              ),
            ),
            title: Row(
              children: [
                Text(a.label,
                    style: const TextStyle(fontWeight: FontWeight.bold)),
                if (a.isDefault) ...[
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: AppColors.success.withOpacity(0.15),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Text('افتراضي',
                        style: TextStyle(
                            fontSize: 10, color: AppColors.success)),
                  ),
                ],
              ],
            ),
            subtitle: Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(a.fullAddress),
            ),
            trailing: IconButton(
              icon: const Icon(Icons.delete_outline,
                  color: AppColors.danger),
              onPressed: () async {
                final confirm = await showDialog<bool>(
                  context: context,
                  builder: (_) => AlertDialog(
                    title: const Text('حذف العنوان؟'),
                    content: Text(a.label),
                    actions: [
                      TextButton(
                        onPressed: () => Navigator.pop(context, false),
                        child: const Text('إلغاء'),
                      ),
                      TextButton(
                        onPressed: () => Navigator.pop(context, true),
                        child: const Text('حذف',
                            style: TextStyle(color: AppColors.danger)),
                      ),
                    ],
                  ),
                );
                if (confirm == true) {
                  await _service.delete(a.id);
                  _load();
                }
              },
            ),
            onTap: widget.selectionMode
                ? () => Navigator.pop(context, a)
                : null,
          ),
        );
      },
    );
  }
}
