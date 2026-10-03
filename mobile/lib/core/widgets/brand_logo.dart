import 'package:flutter/material.dart';
import '../branding/branding_service.dart';
import '../constants/app_colors.dart';

/// شعار المؤسسة — يعرض الصورة إن وُجدت، وإلا يعرض أيقونة + الحرف الأول.
class BrandLogo extends StatelessWidget {
  final double size;
  final Color? bgColor;
  final Color? fgColor;

  const BrandLogo({
    super.key,
    this.size = 80,
    this.bgColor,
    this.fgColor,
  });

  @override
  Widget build(BuildContext context) {
    final logo = BrandingService.logoUrl;
    final name = BrandingService.companyName;
    final bg = bgColor ?? Colors.white;
    final fg = fgColor ?? BrandingService.primaryColor;

    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(size * 0.22),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.1),
            blurRadius: size * 0.15,
            offset: Offset(0, size * 0.06),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: logo.isNotEmpty
          ? Image.network(
              logo,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => _fallback(name, fg),
              loadingBuilder: (_, child, progress) =>
                  progress == null ? child : _fallback(name, fg),
            )
          : _fallback(name, fg),
    );
  }

  Widget _fallback(String name, Color fg) {
    final initial = name.trim().isNotEmpty ? name.trim()[0] : 'غ';
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.business, color: fg, size: size * 0.5),
          if (size >= 70)
            Padding(
              padding: EdgeInsets.only(top: size * 0.05),
              child: Text(
                initial,
                style: TextStyle(
                  color: fg,
                  fontSize: size * 0.2,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
        ],
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
      child: BrandingService.logoUrl.isNotEmpty
          ? Image.network(
              BrandingService.logoUrl,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => Icon(
                Icons.business,
                color: BrandingService.primaryColor,
                size: size * 0.65,
              ),
            )
          : Icon(
              Icons.business,
              color: BrandingService.primaryColor,
              size: size * 0.65,
            ),
    );
  }
}
