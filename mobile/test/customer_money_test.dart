import 'package:flutter_test/flutter_test.dart';
import 'package:alghouli_app/features/admin/data/customer_account_service.dart';

void main() {
  test('fmtMoney: فواصل آلاف وخانتان عشريتان', () {
    expect(fmtMoney('1800000.00'), '1,800,000.00');
    expect(fmtMoney('1234567.5'), '1,234,567.50');
    expect(fmtMoney('0'), '0.00');
  });

  test('fmtMoney: السالب يبقى سالبًا', () {
    expect(fmtMoney('-1500'), '-1,500.00');
  });

  test('fmtMoney: القيم غير الرقمية تُعاد كما هي، والفارغ صفر', () {
    expect(fmtMoney(null), '0.00');
    expect(fmtMoney('غير معروف'), 'غير معروف');
  });
}
