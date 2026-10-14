#!/usr/bin/env python3
"""يفعّل core library desugaring في android/app (مطلوب لـ flutter_local_notifications).
لا يعتمد على نمط داخلي لقالب flutter create (يتغير بين الإصدارات)، بل يضيف في آخر الملف
بلوكين مستقلين: android { compileOptions } و dependencies. Gradle يدمج تكرار الكتل بأمان.
الاستخدام: python3 scripts/enable_desugaring.py mobile
"""
import pathlib
import sys

DESUGAR = 'com.android.tools:desugar_jdk_libs:2.1.4'
mobile = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'mobile')
kts = mobile / 'android/app/build.gradle.kts'
groovy = mobile / 'android/app/build.gradle'

if kts.exists():
    path = kts
    src = kts.read_text(encoding='utf-8')
    if 'isCoreLibraryDesugaringEnabled' in src:
        print('already enabled:', path)
        sys.exit(0)
    block = (
        '\nandroid {\n'
        '    compileOptions {\n'
        '        isCoreLibraryDesugaringEnabled = true\n'
        '    }\n'
        '}\n'
        '\ndependencies {\n'
        '    coreLibraryDesugaring("%s")\n'
        '}\n' % DESUGAR
    )
elif groovy.exists():
    path = groovy
    src = groovy.read_text(encoding='utf-8')
    if 'coreLibraryDesugaringEnabled' in src:
        print('already enabled:', path)
        sys.exit(0)
    block = (
        '\nandroid {\n'
        '    compileOptions {\n'
        '        coreLibraryDesugaringEnabled true\n'
        '    }\n'
        '}\n'
        '\ndependencies {\n'
        "    coreLibraryDesugaring '%s'\n"
        '}\n' % DESUGAR
    )
else:
    sys.exit('لم يُعثر على build.gradle(.kts) تحت android/app')

path.write_text(src.rstrip('\n') + '\n' + block, encoding='utf-8')
print('desugaring enabled in', path)
