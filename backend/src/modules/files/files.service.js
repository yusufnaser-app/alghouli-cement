'use strict';
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// ═══ أنواع الملفات المدعومة ═══
const BUCKETS = {
  product: 'products',
  receipt: 'receipts',
  proof: 'proofs',
  branding: 'branding',   // ← Part 26
  avatar: 'avatars',       // ← صور المستخدمين
  logo: 'branding',        // ← مرادف
};

// ═══ الأنواع المسموحة (MIME) ═══
const ALLOWED_MIME = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
];

// ═══ الحد الأقصى 5 ميجا ═══
const MAX_SIZE = 5 * 1024 * 1024;

// ═══ فحص فعلي لمحتوى الصورة (magic bytes) ═══
const detectImageType = (buffer) => {
  if (!buffer || buffer.length < 12) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buffer[0] === 0x89 && buffer[1] === 0x50 &&
      buffer[2] === 0x4E && buffer[3] === 0x47) {
    return 'image/png';
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'image/jpeg';
  }

  // WEBP: RIFF....WEBP
  if (buffer[0] === 0x52 && buffer[1] === 0x49 &&
      buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 &&
      buffer[10] === 0x42 && buffer[11] === 0x50) {
    return 'image/webp';
  }

  return null; // غير معروف
};

// ═══ رفع الملف ═══
const uploadFile = async (buffer, originalName, type) => {
  // 1) تحقق من النوع
  const bucket = BUCKETS[type];
  if (!bucket) {
    const err = new Error(`نوع الملف غير مدعوم: ${type}`);
    err.status = 400;
    throw err;
  }

  // 2) تحقق من الحجم
  if (buffer.length > MAX_SIZE) {
    const err = new Error(`حجم الملف كبير جدًا (الحد ${MAX_SIZE / 1024 / 1024} ميجا)`);
    err.status = 400;
    throw err;
  }

  // 3) فحص نوع المحتوى الفعلي
  const detectedMime = detectImageType(buffer);
  if (!detectedMime || !ALLOWED_MIME.includes(detectedMime)) {
    const err = new Error('محتوى الملف غير مدعوم (يجب أن يكون PNG/JPEG/WEBP)');
    err.status = 400;
    throw err;
  }

  // 4) بناء اسم الملف
  const ext = detectedMime === 'image/png' ? 'png'
            : detectedMime === 'image/webp' ? 'webp'
            : 'jpg';
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const path = `${new Date().getFullYear()}/${fileName}`;

  // 5) ارفع إلى Supabase
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, buffer, {
      contentType: detectedMime,
      upsert: false,
    });

  if (error) {
    const err = new Error(`فشل الرفع: ${error.message}`);
    err.status = 500;
    throw err;
  }

  // 6) الرابط العام
  const { data: urlData } = supabase.storage
    .from(bucket)
    .getPublicUrl(data.path);

  return {
    bucket,
    path: data.path,
    url: urlData.publicUrl,
  };
};

module.exports = { uploadFile, BUCKETS, detectImageType };
