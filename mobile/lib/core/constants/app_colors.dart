import 'package:flutter/material.dart';

class AppColors {
  // الهوية الأساسية — أزرق داكن احترافي
  static const primary = Color(0xFF1A3A5C);        // Navy داكن
  static const primaryLight = Color(0xFF2E5984);   // أزرق متوسط
  static const primaryDark = Color(0xFF0F2338);    // Navy غامق
  static const accent = Color(0xFF2196F3);         // أزرق فاتح
  static const secondary = Color(0xFFFFA000);      // ذهبي
  static const success = Color(0xFF28A745);
  static const warning = Color(0xFFFFC107);
  static const danger = Color(0xFFDC3545);
  static const info = Color(0xFF17A2B8);

  // الهوية الحمراء (للشعار)
  static const brandRed = Color(0xFFD32F2F);
  static const brandDark = Color(0xFF1A3A5C);

  // أنواع الأسمنت
  static const cementOpc = Color(0xFF28A745);
  static const cementSrc = Color(0xFFDC3545);
  static const cementWpc = Color(0xFFF8F9FA);

  // محايدة
  static const background = Color(0xFFF5F7FA);
  static const surface = Color(0xFFFFFFFF);
  static const textPrimary = Color(0xFF1A3A5C);
  static const textSecondary = Color(0xFF6B7C8E);
  static const divider = Color(0xFFE5EAF0);
  static const lightBlue = Color(0xFFE3F2FD);
  static const lightGray = Color(0xFFF8F9FA);

  // حالات الطلب
  static const statusPending = Color(0xFFFFA000);
  static const statusApproved = Color(0xFF28A745);
  static const statusRejected = Color(0xFFDC3545);
  static const statusInTransit = Color(0xFF2196F3);
  static const statusCompleted = Color(0xFF1A3A5C);
  static const statusCancelled = Color(0xFF9E9E9E);

  static Color categoryColor(String code) {
    switch (code) {
      case 'OPC': return cementOpc;
      case 'SRC': return cementSrc;
      case 'WPC': return cementWpc;
      default: return primaryLight;
    }
  }

  static Color statusColor(String status) {
    switch (status) {
      case 'PENDING_PAYMENT':
      case 'PENDING_PAYMENT_REVIEW':
      case 'RECEIPT_UPLOADED':
        return statusPending;
      case 'PAYMENT_APPROVED':
      case 'PREPARING':
      case 'DRIVER_ASSIGNED':
      case 'LOADED':
        return statusApproved;
      case 'PAYMENT_REJECTED':
        return statusRejected;
      case 'IN_TRANSIT':
        return statusInTransit;
      case 'DELIVERED':
      case 'COMPLETED':
        return statusCompleted;
      case 'CANCELLED':
        return statusCancelled;
      default:
        return textSecondary;
    }
  }
}
