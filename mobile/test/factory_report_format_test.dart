import 'package:flutter_test/flutter_test.dart';
import 'package:alghouli_app/features/admin/data/factory_report_service.dart';

void main() {
  test('formatDateYmd: صفر بادئ للشهر واليوم', () {
    expect(formatDateYmd(DateTime(2026, 1, 5)), '2026-01-05');
    expect(formatDateYmd(DateTime(2026, 10, 17)), '2026-10-17');
  });
}
