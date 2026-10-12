import 'package:flutter_test/flutter_test.dart';
import 'package:alghouli_app/core/documents/document_actions.dart';

void main() {
  test('safeFileName: يحافظ على العربية ويزيل المحارف الخطرة ويضيف pdf', () {
    expect(safeFileName('إشعار قيمة الطلب 1'), 'إشعار_قيمة_الطلب_1.pdf');
    expect(safeFileName('../../etc/passwd'), 'etc_passwd.pdf');
    expect(safeFileName('a/b\\c?d*e'), 'a_b_c_d_e.pdf');
  });

  test('safeFileName: اسم فارغ أو محارف فقط ⇒ document.pdf', () {
    expect(safeFileName(''), 'document.pdf');
    expect(safeFileName('///'), 'document.pdf');
    expect(safeFileName('   '), 'document.pdf');
  });

  test('safeFileName: لا يبدأ ولا ينتهي بشرطة سفلية ولا يحوي تكرارها', () {
    expect(safeFileName('__x__y__'), 'x_y.pdf');
    expect(safeFileName('a   b'), 'a_b.pdf');
  });

  test('DocumentSpec: المسار يُحلّ عند الطلب (لا عند الإنشاء)', () async {
    var calls = 0;
    final d = DocumentSpec(
      label: 'كشف',
      path: () async {
        calls++;
        return '/documents/my/statement';
      },
      fileName: 'كشف',
    );
    expect(calls, 0);
    expect(await d.path(), '/documents/my/statement');
    expect(calls, 1);
  });
}
