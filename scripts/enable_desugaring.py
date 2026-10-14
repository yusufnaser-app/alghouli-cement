#!/usr/bin/env python3
"""يفعّل core library desugaring في android/app (مطلوب لـ flutter_local_notifications).
ينشئ flutter create ملف Gradle بإحدى الصيغتين، والسكربت يتعامل معهما.
الاستخدام: python3 scripts/enable_desugaring.py mobile
"""
import pathlib
import re
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
    src, n1 = re.subn(r'(\n(\s*)targetCompatibility\s*=\s*[^\n]+)',
                      r'\1\n\2isCoreLibraryDesugaringEnabled = true', src, count=1)
    src, n2 = re.subn(r'(\ndependencies\s*\{)',
                      r'\1\n    coreLibraryDesugaring("%s")' % DESUGAR, src, count=1)
elif groovy.exists():
    path = groovy
    src = groovy.read_text(encoding='utf-8')
    if 'coreLibraryDesugaringEnabled' in src:
        print('already enabled:', path)
        sys.exit(0)
    src, n1 = re.subn(r'(\n(\s*)targetCompatibility\s+[^\n]+)',
                      r'\1\n\2coreLibraryDesugaringEnabled true', src, count=1)
    src, n2 = re.subn(r'(\ndependencies\s*\{)',
                      r"\1\n    coreLibraryDesugaring '%s'" % DESUGAR, src, count=1)
else:
    sys.exit('لم يُعثر على build.gradle(.kts) تحت android/app')

if n1 != 1 or n2 != 1:
    sys.exit('لم يتطابق نمط Gradle المتوقع؛ يجب مراجعة الملف %s' % path)
path.write_text(src, encoding='utf-8')
print('desugaring enabled in', path)
