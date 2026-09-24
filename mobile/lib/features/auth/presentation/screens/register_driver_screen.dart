import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/widgets/primary_button.dart';
import '../../data/auth_service.dart';
import 'otp_screen.dart';

class RegisterDriverScreen extends StatefulWidget {
  const RegisterDriverScreen({super.key});

  @override
  State<RegisterDriverScreen> createState() => _RegisterDriverScreenState();
}

class _RegisterDriverScreenState extends State<RegisterDriverScreen> {
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _nationalIdController = TextEditingController();
  final _plateController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();

  final _authService = AuthService();
  String _vehicleType = 'truck_10t';
  bool _loading = false;
  bool _obscure = true;
  String? _error;

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _nationalIdController.dispose();
    _plateController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  Future<void> _register() async {
    final name = _nameController.text.trim();
    final phone = _phoneController.text.trim();
    final nationalId = _nationalIdController.text.trim();
    final plate = _plateController.text.trim();
    final password = _passwordController.text;
    final confirm = _confirmPasswordController.text;

    if (name.length < 3) {
      setState(() => _error = 'الاسم قصير جدًا');
      return;
    }
    if (!RegExp(r'^967[0-9]{9}$').hasMatch(phone)) {
      setState(() => _error = 'رقم الهاتف بصيغة 967XXXXXXXXX');
      return;
    }
    if (nationalId.length < 4) {
      setState(() => _error = 'رقم البطاقة غير صحيح');
      return;
    }
    if (plate.length < 3) {
      setState(() => _error = 'رقم اللوحة غير صحيح');
      return;
    }
    if (password.length < 6) {
      setState(() => _error = 'كلمة المرور 6 أحرف على الأقل');
      return;
    }
    if (password != confirm) {
      setState(() => _error = 'كلمتا المرور غير متطابقتين');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final data = await _authService.register(
        fullName: name,
        phone: phone,
        userType: 'driver',
        password: password,
        nationalId: nationalId,
        vehicleType: _vehicleType,
        plateNumber: plate,
      );

      if (!mounted) return;
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) => OtpScreen(
            phone: phone,
            devOtp: data['devOtp']?.toString(),
          ),
        ),
      );
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
      appBar: AppBar(title: const Text('تسجيل كسائق')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppColors.info.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: AppColors.info.withOpacity(0.3)),
                ),
                child: const Row(
                  children: [
                    Icon(Icons.info_outline, color: AppColors.info),
                    SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'بعد التسجيل، سيتم مراجعة حسابك من قبل المؤسسة قبل تفعيله للرحلات.',
                        style: TextStyle(fontSize: 12),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),

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

              _label('الاسم الكامل'),
              TextField(
                controller: _nameController,
                decoration: const InputDecoration(
                  hintText: 'سالم أحمد',
                  prefixIcon: Icon(Icons.person_outline),
                ),
              ),
              const SizedBox(height: 14),

              _label('رقم البطاقة'),
              TextField(
                controller: _nationalIdController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  hintText: '01234567',
                  prefixIcon: Icon(Icons.badge_outlined),
                ),
              ),
              const SizedBox(height: 14),

              _label('رقم الهاتف'),
              TextField(
                controller: _phoneController,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(
                  hintText: '967771234567',
                  prefixIcon: Icon(Icons.phone_android),
                ),
              ),
              const SizedBox(height: 14),

              _label('نوع القاطرة'),
              DropdownButtonFormField<String>(
                value: _vehicleType,
                decoration: const InputDecoration(
                  prefixIcon: Icon(Icons.local_shipping),
                ),
                items: const [
                  DropdownMenuItem(value: 'truck_10t', child: Text('شاحنة 10 طن')),
                  DropdownMenuItem(value: 'truck_20t', child: Text('شاحنة 20 طن')),
                  DropdownMenuItem(value: 'tanker', child: Text('صهريج سائب')),
                  DropdownMenuItem(value: 'pickup', child: Text('بيك أب')),
                ],
                onChanged: (v) => setState(() => _vehicleType = v!),
              ),
              const SizedBox(height: 14),

              _label('رقم اللوحة'),
              TextField(
                controller: _plateController,
                decoration: const InputDecoration(
                  hintText: 'ABC-1234',
                  prefixIcon: Icon(Icons.confirmation_number),
                ),
              ),
              const SizedBox(height: 14),

              _label('كلمة المرور'),
              TextField(
                controller: _passwordController,
                obscureText: _obscure,
                decoration: InputDecoration(
                  hintText: '••••••••',
                  prefixIcon: const Icon(Icons.lock_outline),
                  suffixIcon: IconButton(
                    icon: Icon(_obscure
                        ? Icons.visibility_off
                        : Icons.visibility),
                    onPressed: () => setState(() => _obscure = !_obscure),
                  ),
                ),
              ),
              const SizedBox(height: 14),

              _label('تأكيد كلمة المرور'),
              TextField(
                controller: _confirmPasswordController,
                obscureText: true,
                decoration: const InputDecoration(
                  hintText: '••••••••',
                  prefixIcon: Icon(Icons.lock_outline),
                ),
              ),
              const SizedBox(height: 32),

              PrimaryButton(
                text: 'إنشاء حساب سائق',
                icon: Icons.person_add,
                isLoading: _loading,
                onPressed: _register,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _label(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(text,
            style: const TextStyle(
                fontWeight: FontWeight.bold, fontSize: 13)),
      );
}
