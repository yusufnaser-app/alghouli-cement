import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/widgets/primary_button.dart';
import '../../data/auth_service.dart';
import 'otp_screen.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _areaController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();

  final _authService = AuthService();

  String _customerType = 'individual';
  String _governorate = 'صنعاء';
  bool _loading = false;
  bool _obscurePassword = true;
  bool _obscureConfirmPassword = true;
  String? _error;

  final _governorates = [
    'صنعاء',
    'عمران',
    'الحديدة',
    'تعز',
    'حضرموت',
    'عدن',
    'إب',
    'ذمار',
    'حجة',
    'صعدة',
  ];

  final _types = [
    {'value': 'individual', 'label': 'فرد'},
    {'value': 'trader', 'label': 'تاجر'},
    {'value': 'distributor', 'label': 'موزع'},
    {'value': 'contractor', 'label': 'مقاول'},
  ];

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _areaController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  Future<void> _register() async {
    final name = _nameController.text.trim();
    final phone = _phoneController.text.trim();
    final password = _passwordController.text;
    final confirmPassword = _confirmPasswordController.text;

    if (name.isEmpty || phone.isEmpty) {
      setState(() => _error = 'يرجى إدخال الاسم ورقم الهاتف');
      return;
    }

    if (!RegExp(r'^967[0-9]{9}$').hasMatch(phone)) {
      setState(() => _error = 'رقم الهاتف بصيغة 967XXXXXXXXX (12 رقمًا)');
      return;
    }

    if (password.length < 6) {
      setState(() => _error = 'كلمة المرور يجب أن تكون 6 أحرف أو أرقام على الأقل');
      return;
    }

    if (password != confirmPassword) {
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
        customerType: _customerType,
        governorate: _governorate,
        area: _areaController.text.trim().isEmpty
            ? null
            : _areaController.text.trim(),
        password: password,
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

      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
      });
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('حساب جديد'),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'مرحبًا بك في مؤسسة الغولي',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.bold,
                  color: AppColors.primary,
                ),
              ),

              const SizedBox(height: 8),

              const Text(
                'أنشئ حسابك في دقيقة واحدة',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 14,
                  color: AppColors.textSecondary,
                ),
              ),

              const SizedBox(height: 32),

              if (_error != null) ...[
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppColors.danger.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    children: [
                      const Icon(
                        Icons.error_outline,
                        color: AppColors.danger,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          _error!,
                          style: const TextStyle(
                            color: AppColors.danger,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
              ],

              _label('الاسم الكامل'),

              TextField(
                controller: _nameController,
                textInputAction: TextInputAction.next,
                decoration: const InputDecoration(
                  hintText: 'أحمد محمد علي الغولي',
                  prefixIcon: Icon(Icons.person_outline),
                ),
              ),

              const SizedBox(height: 16),

              _label('رقم الهاتف'),

              TextField(
                controller: _phoneController,
                keyboardType: TextInputType.phone,
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                ],
                decoration: const InputDecoration(
                  hintText: '967775477377',
                  prefixIcon: Icon(Icons.phone_android),
                ),
              ),

              const SizedBox(height: 16),

              _label('نوع الحساب'),

              DropdownButtonFormField<String>(
                value: _customerType,
                decoration: const InputDecoration(
                  prefixIcon: Icon(Icons.badge_outlined),
                ),
                items: _types
                    .map(
                      (t) => DropdownMenuItem<String>(
                        value: t['value'],
                        child: Text(t['label']!),
                      ),
                    )
                    .toList(),
                onChanged: (v) {
                  if (v != null) {
                    setState(() => _customerType = v);
                  }
                },
              ),

              const SizedBox(height: 16),

              _label('كلمة المرور'),

              TextField(
                controller: _passwordController,
                obscureText: _obscurePassword,
                textInputAction: TextInputAction.next,
                decoration: InputDecoration(
                  hintText: '6 أحرف أو أرقام على الأقل',
                  prefixIcon: const Icon(Icons.lock_outline),
                  suffixIcon: IconButton(
                    icon: Icon(
                      _obscurePassword
                          ? Icons.visibility_off
                          : Icons.visibility,
                    ),
                    onPressed: () {
                      setState(() {
                        _obscurePassword = !_obscurePassword;
                      });
                    },
                  ),
                ),
              ),

              const SizedBox(height: 16),

              _label('تأكيد كلمة المرور'),

              TextField(
                controller: _confirmPasswordController,
                obscureText: _obscureConfirmPassword,
                textInputAction: TextInputAction.next,
                decoration: InputDecoration(
                  hintText: 'أعد إدخال كلمة المرور',
                  prefixIcon: const Icon(Icons.lock_reset_outlined),
                  suffixIcon: IconButton(
                    icon: Icon(
                      _obscureConfirmPassword
                          ? Icons.visibility_off
                          : Icons.visibility,
                    ),
                    onPressed: () {
                      setState(() {
                        _obscureConfirmPassword =
                            !_obscureConfirmPassword;
                      });
                    },
                  ),
                ),
              ),

              const SizedBox(height: 16),

              _label('المحافظة'),

              DropdownButtonFormField<String>(
                value: _governorate,
                decoration: const InputDecoration(
                  prefixIcon: Icon(Icons.location_city),
                ),
                items: _governorates
                    .map(
                      (g) => DropdownMenuItem<String>(
                        value: g,
                        child: Text(g),
                      ),
                    )
                    .toList(),
                onChanged: (v) {
                  if (v != null) {
                    setState(() => _governorate = v);
                  }
                },
              ),

              const SizedBox(height: 16),

              _label('المنطقة (اختياري)'),

              TextField(
                controller: _areaController,
                textInputAction: TextInputAction.done,
                decoration: const InputDecoration(
                  hintText: 'السبعين',
                  prefixIcon: Icon(Icons.location_on_outlined),
                ),
              ),

              const SizedBox(height: 32),

              PrimaryButton(
                text: 'إنشاء الحساب',
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

  Widget _label(String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(
        text,
        style: const TextStyle(
          fontWeight: FontWeight.bold,
          fontSize: 14,
        ),
      ),
    );
  }
}
