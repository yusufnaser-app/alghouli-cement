import 'package:flutter/material.dart';
import '../branding/branding_service.dart';

/// شعار المؤسسة — يستخدم الصورة المحلية assets/images/logo.jpg
class BrandLogo extends StatelessWidget {
  final double size;
  final Color? bgColor;
  final bool circular;

  const BrandLogo({
    super.key,
    this.size = 100,
    this.bgColor,
    this.circular = true,
  });

  @override
  Widget build(BuildContext context) {
    final bg = bgColor ?? Colors.white;
    final logoUrl = BrandingService.logoUrl;

    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: bg,
        shape: circular ? BoxShape.circle : BoxShape.rectangle,
        borderRadius: circular ? null : BorderRadius.circular(size * 0.22),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.15),
            blurRadius: size * 0.15,
            offset: Offset(0, size * 0.06),
          ),
        ],
      ),
      padding: EdgeInsets.all(size * 0.08),
      clipBehavior: Clip.antiAlias,
      child: _buildLogo(logoUrl),
    );
  }

  Widget _buildLogo(String logoUrl) {
    if (logoUrl.isNotEmpty && logoUrl.startsWith('http')) {
      return Image.network(
        logoUrl,
        fit: BoxFit.contain,
        errorBuilder: (_, __, ___) => _assetLogo(),
      );
    }
    return _assetLogo();
  }

  Widget _assetLogo() {
    return Image.asset(
      'assets/images/logo.jpg',
      fit: BoxFit.contain,
      errorBuilder: (_, __, ___) => Icon(
        Icons.business,
        color: BrandingService.primaryColor,
        size: size * 0.55,
      ),
    );
  }
}

/// شعار صغير للـ AppBar
class BrandLogoSmall extends StatelessWidget {
  final double size;
  const BrandLogoSmall({super.key, this.size = 32});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(size * 0.22),
      ),
      clipBehavior: Clip.antiAlias,
      padding: EdgeInsets.all(size * 0.08),
      child: Image.asset(
        'assets/images/logo.jpg',
        fit: BoxFit.contain,
        errorBuilder: (_, __, ___) => Icon(
          Icons.business,
          color: BrandingService.primaryColor,
          size: size * 0.65,
        ),
      ),
    );
  }
}
