import os

os.chdir('mobile')

# ========== 1. settings.gradle ==========
with open('android/settings.gradle', 'r') as f:
    s = f.read()

if 'com.google.gms.google-services' not in s:
    s = s.replace(
        'id "com.android.application"',
        'id "com.google.gms.google-services" version "4.4.2" apply false\n    id "com.android.application"',
        1
    )
    with open('android/settings.gradle', 'w') as f:
        f.write(s)
    print("✅ Patched settings.gradle")
else:
    print("ℹ️ settings.gradle already has google-services")

# ========== 2. app/build.gradle ==========
with open('android/app/build.gradle', 'r') as f:
    s = f.read()

# احذف أي apply plugin قديم
s = s.replace("\napply plugin: 'com.google.gms.google-services'\n", "")
s = s.replace("apply plugin: 'com.google.gms.google-services'\n", "")
s = s.replace("\napply plugin: 'com.google.gms.google-services'", "")

# أضف في plugins block
if 'id "com.google.gms.google-services"' not in s:
    # محاولة 1: بعد com.android.application
    if 'id "com.android.application"' in s:
        s = s.replace(
            'id "com.android.application"',
            'id "com.android.application"\n    id "com.google.gms.google-services"',
            1
        )
        print("✅ Added google-services after com.android.application")
    # محاولة 2: بعد flutter-gradle-plugin
    elif 'id "dev.flutter.flutter-gradle-plugin"' in s:
        s = s.replace(
            'id "dev.flutter.flutter-gradle-plugin"',
            'id "dev.flutter.flutter-gradle-plugin"\n    id "com.google.gms.google-services"',
            1
        )
        print("✅ Added google-services after flutter-gradle-plugin")
    else:
        print("⚠️ Could not find plugins block")

    with open('android/app/build.gradle', 'w') as f:
        f.write(s)
else:
    print("ℹ️ app/build.gradle already has google-services")

# اطبع الملف للتحقق
print("--- app/build.gradle (first 20 lines) ---")
with open('android/app/build.gradle') as f:
    lines = f.readlines()
    print(''.join(lines[:20]))
