import os
import json
import re

os.chdir('mobile')

json_path = 'android/app/google-services.json'

# ============================================================
# 1. Verify google-services.json
# ============================================================

if not os.path.exists(json_path):
    print(f"❌ {json_path} NOT FOUND")
    raise SystemExit(1)

try:
    with open(json_path, 'r', encoding='utf-8-sig') as f:
        data = json.load(f)

    pkg = data['client'][0]['client_info']['android_client_info']['package_name']
    print(f"✅ google-services.json valid — package: {pkg}")

except Exception as e:
    print(f"❌ Invalid google-services.json: {e}")
    raise SystemExit(1)


# ============================================================
# 2. Detect Gradle settings file
# ============================================================

settings_kts = 'android/settings.gradle.kts'
settings_gradle = 'android/settings.gradle'

if os.path.exists(settings_kts):
    settings_path = settings_kts
    print("✅ Using Kotlin Gradle settings: settings.gradle.kts")
elif os.path.exists(settings_gradle):
    settings_path = settings_gradle
    print("✅ Using Groovy Gradle settings: settings.gradle")
else:
    print("❌ Neither settings.gradle nor settings.gradle.kts exists")
    raise SystemExit(1)


# ============================================================
# 3. Patch Firebase Google Services plugin
# ============================================================

with open(settings_path, 'r', encoding='utf-8') as f:
    s = f.read()

if 'com.google.gms.google-services' not in s:

    if settings_path.endswith('.kts'):
        # Kotlin DSL
        plugin_line = '    id("com.google.gms.google-services") version "4.4.2" apply false\n'

        marker = 'plugins {'
        pos = s.find(marker)

        if pos != -1:
            insert_pos = pos + len(marker)
            s = s[:insert_pos] + '\n' + plugin_line + s[insert_pos:]
        else:
            print("❌ plugins block not found in settings.gradle.kts")
            raise SystemExit(1)

    else:
        # Groovy DSL
        plugin_line = '    id "com.google.gms.google-services" version "4.4.2" apply false\n'

        marker = 'plugins {'
        pos = s.find(marker)

        if pos != -1:
            insert_pos = pos + len(marker)
            s = s[:insert_pos] + '\n' + plugin_line + s[insert_pos:]
        else:
            print("❌ plugins block not found in settings.gradle")
            raise SystemExit(1)

    with open(settings_path, 'w', encoding='utf-8') as f:
        f.write(s)

    print("✅ Added Google Services plugin to settings")

else:
    print("✅ Google Services plugin already exists")


# ============================================================
# 4. Detect app Gradle file
# ============================================================

app_kts = 'android/app/build.gradle.kts'
app_gradle = 'android/app/build.gradle'

if os.path.exists(app_kts):
    app_path = app_kts
    print("✅ Using Kotlin Gradle app file: build.gradle.kts")
elif os.path.exists(app_gradle):
    app_path = app_gradle
    print("✅ Using Groovy Gradle app file: build.gradle")
else:
    print("❌ Neither app/build.gradle nor app/build.gradle.kts exists")
    raise SystemExit(1)


# ============================================================
# 5. Add Google Services plugin to app
# ============================================================

with open(app_path, 'r', encoding='utf-8') as f:
    s = f.read()

# Remove old/duplicate Google Services declarations
s = re.sub(
    r'^\s*apply plugin:\s*[\'"]com\.google\.gms\.google-services[\'"]\s*$',
    '',
    s,
    flags=re.MULTILINE
)

s = re.sub(
    r'^\s*id\s*[\'"]com\.google\.gms\.google-services[\'"]\s*$',
    '',
    s,
    flags=re.MULTILINE
)

if app_path.endswith('.kts'):

    # Kotlin DSL
    if 'id("com.google.gms.google-services")' not in s:
        match = re.search(r'plugins\s*\{', s)

        if not match:
            print("❌ plugins block not found in app/build.gradle.kts")
            raise SystemExit(1)

        insert_pos = match.end()

        s = (
            s[:insert_pos]
            + '\n    id("com.google.gms.google-services")'
            + s[insert_pos:]
        )

        print("✅ Added Google Services plugin to Kotlin app Gradle")

    else:
        print("✅ Google Services app plugin already exists")

else:

    # Groovy DSL
    if 'id "com.google.gms.google-services"' not in s and \
       "id 'com.google.gms.google-services'" not in s:

        match = re.search(r'plugins\s*\{', s)

        if match:
            insert_pos = match.end()

            s = (
                s[:insert_pos]
                + '\n    id "com.google.gms.google-services"'
                + s[insert_pos:]
            )

            print("✅ Added Google Services plugin to Groovy app Gradle")

        else:
            print("❌ plugins block not found in app/build.gradle")
            raise SystemExit(1)

    else:
        print("✅ Google Services app plugin already exists")


# ============================================================
# 6. Write app Gradle
# ============================================================

with open(app_path, 'w', encoding='utf-8') as f:
    f.write(s)


# ============================================================
# 7. Verify
# ============================================================

print()
print("--- Android files ---")
print(f"settings: {settings_path}")
print(f"app:      {app_path}")
print(f"firebase: {json_path}")

print()
print("--- Files exist ---")
print(f"settings exists: {os.path.exists(settings_path)}")
print(f"app exists:      {os.path.exists(app_path)}")
print(f"firebase exists: {os.path.exists(json_path)}")
print()
print("✅ Firebase Gradle patch completed successfully")
