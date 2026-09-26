import os
import json

os.chdir('mobile')

# ========== 1. التحقق من google-services.json ==========
json_path = 'android/app/google-services.json'
if not os.path.exists(json_path):
    print(f"❌ {json_path} NOT FOUND")
    exit(1)

# تحقق من JSON صالح
try:
    with open(json_path, 'r', encoding='utf-8-sig') as f:
        data = json.load(f)
    pkg = data['client'][0]['client_info']['android_client_info']['package_name']
    print(f"✅ google-services.json valid — package: {pkg}")
except Exception as e:
    print(f"❌ Invalid google-services.json: {e}")
    exit(1)

# ========== 2. settings.gradle ==========
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

# ========== 3. app/build.gradle ==========
with open('android/app/build.gradle', 'r') as f:
    s = f.read()

# احذف أي إضافات سابقة
s = s.replace('\napply plugin: \'com.google.gms.google-services\'\n', '')
s = s.replace('apply plugin: \'com.google.gms.google-services\'\n', '')
s = s.replace('\n    id "com.google.gms.google-services"', '')
s = s.replace('    id "com.google.gms.google-services"\n', '')

# ابحث عن plugins { ... } block
import re
plugins_match = re.search(r'plugins\s*\{([^}]+)\}', s)
if plugins_match:
    plugins_content = plugins_match.group(1).strip()
    # أضف plugin قبل last closing brace
    new_plugins = 'plugins {\n' + plugins_content + '\n    id "com.google.gms.google-services"\n}'
    s = s[:plugins_match.start()] + new_plugins + s[plugins_match.end():]
    print("✅ Added google-services at END of plugins block")
else:
    print("⚠️ No plugins block found")

with open('android/app/build.gradle', 'w') as f:
    f.write(s)

# اطبع الملف للتحقق
print("--- app/build.gradle (first 15 lines) ---")
with open('android/app/build.gradle') as f:
    lines = f.readlines()
    print(''.join(lines[:15]))

# تحقق من وجود google-services.json
print("--- Verify ---")
print(f"file exists: {os.path.exists(json_path)}")
print(f"file size: {os.path.getsize(json_path)} bytes")
