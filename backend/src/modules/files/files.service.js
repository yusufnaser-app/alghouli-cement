const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const BUCKETS = {
  product: 'products',
  receipt: 'receipts',
  proof: 'proofs',
};

const uploadFile = async (buffer, originalName, type) => {
  const bucket = BUCKETS[type];
  if (!bucket) {
    const err = new Error('نوع الملف غير مدعوم');
    err.status = 400;
    throw err;
  }

  const ext = originalName.split('.').pop().toLowerCase();
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const path = `${new Date().getFullYear()}/${fileName}`;

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, buffer, {
      contentType: 'image/jpeg',
      upsert: false,
    });

  if (error) {
    const err = new Error(`فشل الرفع: ${error.message}`);
    err.status = 500;
    throw err;
  }

  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(data.path);

  return {
    bucket,
    path: data.path,
    url: urlData.publicUrl,
  };
};

module.exports = { uploadFile };
