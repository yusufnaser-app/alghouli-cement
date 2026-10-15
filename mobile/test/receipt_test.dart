import 'package:flutter_test/flutter_test.dart';
import 'package:alghouli_app/core/receipts/receipt.dart';

void main() {
  test('receiptFileName: يحافظ على العربية ويزيل المحارف الخطرة', () {
    expect(receiptFileName('فاكس FX-2026-00007'), 'فاكس_FX-2026-00007');
    expect(receiptFileName('../etc/passwd'), 'etc_passwd');
  });

  test('receiptFileName: الاسم الفارغ يصبح receipt', () {
    expect(receiptFileName(''), 'receipt');
    expect(receiptFileName('///'), 'receipt');
  });
}
