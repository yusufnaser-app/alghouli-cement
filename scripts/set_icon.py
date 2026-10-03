"""يُنشئ أيقونات التطبيق من الشعار المحلي."""
from PIL import Image
import os
import sys

SRC = 'assets/images/logo.jpg'
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

img = Image.open(SRC).convert('RGBA')

for folder, size in SIZES.items():
    path = f'android/app/src/main/res/{folder}'
    os.makedirs(path, exist_ok=True)
    resized = img.resize((size, size), Image.LANCZOS)
    out = f'{path}/ic_launcher.png'
    resized.save(out, 'PNG')
    print(f'✅ {out} ({size}x{size})')

print('✅ أيقونات جاهزة')
