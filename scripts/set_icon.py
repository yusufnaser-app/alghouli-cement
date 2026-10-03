"""يُنشئ أيقونات التطبيق من الشعار.
Usage: python3 scripts/set_icon.py [mobile_dir]
"""
from PIL import Image
import os
import sys

MOBILE = sys.argv[1] if len(sys.argv) > 1 else 'mobile'
SRC = f'{MOBILE}/assets/images/logo.jpg'
SIZES = {
    'mipmap-mdpi': 48,
    'mipmap-hdpi': 72,
    'mipmap-xhdpi': 96,
    'mipmap-xxhdpi': 144,
    'mipmap-xxxhdpi': 192,
}

if not os.path.exists(SRC):
    print(f'❌ غير موجود: {SRC}')
    sys.exit(1)

print(f'📸 المصدر: {SRC}')
img = Image.open(SRC).convert('RGBA')

for folder, size in SIZES.items():
    path = f'{MOBILE}/android/app/src/main/res/{folder}'
    os.makedirs(path, exist_ok=True)
    out = f'{path}/ic_launcher.png'
    img.resize((size, size), Image.LANCZOS).save(out, 'PNG')
    print(f'✅ {out}')

print('✅ أيقونات جاهزة')
