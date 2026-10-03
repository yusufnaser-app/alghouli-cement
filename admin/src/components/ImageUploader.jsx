import { useRef, useState } from 'react';
import { api } from '../api/client';

export default function ImageUploader({
  value,
  onChange,
  type = 'branding',
  accept = 'image/png,image/jpeg,image/webp',
  maxSize = 5 * 1024 * 1024, // 5MB
  label = 'رفع صورة',
  height = 140,
}) {
  const inputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const pick = () => inputRef.current?.click();

  const handleFile = async (file) => {
    if (!file) return;
    if (file.size > maxSize) {
      setError(`الحد الأقصى ${(maxSize / 1024 / 1024).toFixed(1)} ميجابايت`);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await api.uploadImage(file, type);
      const data = res.data?.data || res.data;
      const url = data.url || data.publicUrl || data.path || '';
      if (!url) throw new Error('لم يُعِد الخادم رابطًا');
      onChange?.(url);
    } catch (e) {
      setError(e.response?.data?.message || e.message || 'فشل الرفع');
    } finally {
      setLoading(false);
    }
  };

  const remove = () => {
    onChange?.('');
  };

  return (
    <div className="image-uploader">
      {label && <label className="image-uploader-label">{label}</label>}

      <div className="image-uploader-box" style={{ minHeight: height }}>
        {value ? (
          <div className="image-uploader-preview">
            <img src={value} alt="preview" />
            <div className="image-uploader-actions">
              <button type="button" onClick={pick} className="iu-btn">تغيير</button>
              <button type="button" onClick={remove} className="iu-btn iu-btn-danger">حذف</button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="image-uploader-placeholder"
            onClick={pick}
            disabled={loading}
          >
            {loading ? (
              <span className="spinner"></span>
            ) : (
              <>
                <div className="iu-icon">📷</div>
                <div className="iu-text">اختر صورة أو اسحبها هنا</div>
                <div className="iu-hint">PNG / JPEG / WebP — حتى 5 ميجا</div>
              </>
            )}
          </button>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={accept}
          style={{ display: 'none' }}
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>

      {error && <div className="image-uploader-error">{error}</div>}
    </div>
  );
}
