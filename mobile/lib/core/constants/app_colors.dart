import 'package:flutter/material.dart';

class AppColors {
  // الهوية الأساسية
  static const primary = Color(0xFF1B5E20);
  static const primaryLight = Color(0xFF4CAF50);
  static const primaryDark = Color(0xFF0D3B0F);
  static const secondary = Color(0xFFFFA000);
  static const accent = Color(0xFF1565C0);

  // أنواع الأسمنت
  static const cementOpc = Color(0xFF28A745);
  static const cementSrc = Color(0xFFDC3545);
  static const cementWpc = Color(0xFFF8F9FA);

  // الحالات
  static const success = Color(0xFF28A745);
  static const warning = Color(0xFFFFC107);
  static const danger = Color(0xFFDC3545);
  static const info = Color(0xFF17A2B8);

  // محايدة
  static const background = Color(0xFFF5F5F5);
  static const surface = Color(0xFFFFFFFF);
  static const textPrimary = Color(0xFF212121);
  static const textSecondary = Color(0xFF757575);
  static const divider = Color(0xFFE0E0E0);

  // حالات الطلب
  static const statusPending = Color(0xFFFFA000);
  static const statusApproved = Color(0xFF28A745);
  static const statusRejected = Color(0xFFDC3545);
  static const statusInTransit = Color(0xFF1565C0);
  static const statusCompleted = Color(0xFF1B5E20);
  static const statusCancelled = Color(0xFF9E9E9E);

  static Color categoryColor(String code) {
    switch (code) {
      case 'OPC':
        return cementOpc;
      case 'SRC':
        return cementSrc;
      case 'WPC':
        return cementWpc;
      default:
        return primaryLight;
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
