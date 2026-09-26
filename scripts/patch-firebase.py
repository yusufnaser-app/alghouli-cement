import os
import sys

os.chdir('mobile')

# 1. Patch settings.gradle
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
    print("Patched settings.gradle")
else:
    print("settings.gradle already has google-services")

print("--- settings.gradle ---")
with open('android/settings.gradle') as f:
    print(f.read())

# 2. Patch app/build.gradle
with open('android/app/build.gradle', 'r') as f:
    s = f.read()

if 'com.google.gms.google-services' not in s:
    s += "\napply plugin: 'com.google.gms.google-services'\n"
    with open('android/app/build.gradle', 'w') as f:
        f.write(s)
    print("Patched app/build.gradle")
else:
    print("app/build.gradle already has google-services")

print("--- app/build.gradle tail ---")
with open('android/app/build.gradle') as f:
    lines = f.readlines()
    print(''.join(lines[-5:]))
