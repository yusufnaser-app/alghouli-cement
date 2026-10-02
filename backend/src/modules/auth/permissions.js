'use strict';
/**
 * الصلاحيات الدقيقة (RBAC) — user → roles → permissions.
 * المصدر الافتراضي هنا، ويُزرع في الجداول permissions/role_permissions عند تشغيل m29.
 * بعد ذلك تُقرأ من قاعدة البيانات، ويمكن منح/سحب صلاحية لمستخدم بعينه عبر user_permissions.
 *
 * admin = '*' (كل شيء) — ومع ذلك حذف/تعديل السجل المالي ممنوع على مستوى قاعدة البيانات (Trigger).
 */

const PERMISSIONS = Object.freeze({
  'orders.view': 'مشاهدة الطلبات',
  'orders.create': 'إنشاء طلب',
  'orders.update': 'تعديل طلب',
  'orders.cancel': 'إلغاء طلب',

  'pricing.view': 'مشاهدة التسعير',
  'pricing.create': 'إدخال السعر/الخصم/النقل',
  'pricing.update': 'تعديل السعر',
  'pricing.approve': 'اعتماد السعر والائتمان',

  'payments.view': 'مشاهدة المدفوعات',
  'payments.create': 'تسجيل دفعة',
  'payments.approve': 'اعتماد دفعة',
  'payments.reject': 'رفض دفعة',
  'payments.reverse': 'عكس دفعة معتمدة',

  'ledger.view': 'مشاهدة دفتر الأستاذ',
  'ledger.create': 'إنشاء قيد',
  'ledger.adjust': 'إنشاء تسوية',
  'ledger.reverse': 'عكس قيد',

  'statements.view': 'مشاهدة كشوف حسابات العملاء',
  'statements.export': 'تصدير/طباعة كشف الحساب',
  'statements.view_own': 'مشاهدة كشف حسابي',

  'loading.view': 'مشاهدة التحميل والفاكس',
  'loading.create': 'إنشاء/إصدار فاكس',
  'loading.update': 'تحديث حالة التحميل',
  'loading.confirm': 'اعتماد الكمية المحملة الفعلية',

  'transport.view': 'مشاهدة النقل',
  'transport.assign': 'تعيين سائق/قاطرة',
  'transport.update': 'تحديث الرحلة',

  'users.view': 'مشاهدة المستخدمين',
  'users.create': 'إنشاء مستخدم',
  'users.update': 'تعديل مستخدم',
  'users.disable': 'تعطيل مستخدم',

  'roles.view': 'مشاهدة الأدوار',
  'roles.manage': 'إدارة الأدوار والصلاحيات',

  'reports.view': 'مشاهدة التقارير',
  'reports.export': 'تصدير التقارير',

  'audit.view': 'مشاهدة سجل التدقيق',
  'accounting.integrity_check': 'تشغيل فحص سلامة الحسابات',
  'accounting.post': 'ترحيل الطلبات المحمّلة محاسبيًا',
});

const EXTRA_ROLES = Object.freeze([
  ['auditor', 'المراجع'],
  ['loading', 'موظف التحميل'],
]);

// ملاحظة: لا يُمنح أي دور (غير admin) ledger.reverse / payments.reverse / pricing.approve افتراضيًا.
// تُمنح صراحةً عبر user_permissions عند الحاجة — لفصل المهام.
const ROLE_PERMISSIONS = Object.freeze({
  admin: ['*'],

  accountant: [
    'orders.view', 'pricing.view',
    'payments.view', 'payments.approve', 'payments.reject',
    'ledger.view', 'ledger.create', 'ledger.adjust',
    'statements.view', 'statements.export',
    'reports.view', 'reports.export',
    'accounting.integrity_check', 'accounting.post',
    'transport.view', 'loading.view',
  ],

  sales: [
    'orders.view', 'orders.create', 'orders.update',
    'pricing.view', 'pricing.create', 'pricing.update',
    'transport.view', 'loading.view', 'reports.view',
  ],

  loading: [
    'orders.view', 'loading.view', 'loading.create', 'loading.update', 'loading.confirm',
    'transport.view',
  ],

  // مسؤول النقل (Dispatcher) — الدور الحالي transport
  transport: [
    'orders.view', 'transport.view', 'transport.assign', 'transport.update',
    'loading.view', 'loading.create', 'loading.update',
  ],

  auditor: [
    'orders.view', 'pricing.view', 'payments.view',
    'ledger.view', 'statements.view', 'statements.export',
    'audit.view', 'accounting.integrity_check',
    'reports.view', 'reports.export',
  ],

  // العميل/التاجر: بياناته فقط (الفلترة بالمالك داخل الاستعلامات)
  customer: ['orders.create', 'payments.create', 'statements.view_own'],

  // السائق: عملياته فقط
  driver: [],
  inventory: [],
  pos: [],
});

const hasPermission = (permSet, code) => permSet.has('*') || permSet.has(code);

module.exports = { PERMISSIONS, ROLE_PERMISSIONS, EXTRA_ROLES, hasPermission };
