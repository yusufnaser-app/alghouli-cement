import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useBranding } from '../../contexts/BrandingContext';
import ImageUploader from '../../components/ImageUploader';

export default function Branding() {
  const { refresh } = useBranding();
  const [form, setForm] = useState({
    primary_color: '#1a3a5c',
    secondary_color: '#d4a574',
    company_name: 'مؤسسة الغولي',
    logo_url: '',
    favicon_url: '',
    login_image_url: '',
    home_banner_url: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await api.brandingPublic();
        setForm((f) => ({ ...f, ...(res.data.data || {}) }));
      } catch (e) {
        setMsg('تعذّر التحميل: ' + e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const upd = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    setMsg('');
    try {
      await api.brandingUpdate(form);
      await refresh();
      setMsg('✅ تم الحفظ');
    } catch (e) {
      setMsg('❌ ' + (e.response?.data?.message || e.message));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div className="branding-page">
      <h2 className="page-title">الهوية والشعارات</h2>

      <div className="branding-grid">
        <div className="card">
          <h3>الألوان</h3>
          <div className="form-group">
            <label>اللون الأساسي</label>
            <div className="color-input">
              <input
                type="color"
                value={form.primary_color}
                onChange={(e) => upd('primary_color', e.target.value)}
              />
              <input
                type="text"
                value={form.primary_color}
                onChange={(e) => upd('primary_color', e.target.value)}
              />
            </div>
          </div>
          <div className="form-group">
            <label>اللون الثانوي</label>
            <div className="color-input">
              <input
                type="color"
                value={form.secondary_color}
                onChange={(e) => upd('secondary_color', e.target.value)}
              />
              <input
                type="text"
                value={form.secondary_color}
                onChange={(e) => upd('secondary_color', e.target.value)}
              />
            </div>
          </div>
          <div className="form-group">
            <label>اسم المؤسسة</label>
            <input
              type="text"
              value={form.company_name}
              onChange={(e) => upd('company_name', e.target.value)}
              className="input"
            />
          </div>

          <div
            className="branding-preview"
            style={{
              background: `linear-gradient(135deg, ${form.primary_color}, ${form.secondary_color})`,
            }}
          >
            <div className="branding-preview-text">
              معاينة الألوان
            </div>
          </div>
        </div>

        <div className="card">
          <h3>الشعارات والصور</h3>

          <ImageUploader
            label="الشعار الرئيسي"
            value={form.logo_url}
            onChange={(v) => upd('logo_url', v)}
            type="branding"
          />

          <ImageUploader
            label="أيقونة المتصفح (Favicon)"
            value={form.favicon_url}
            onChange={(v) => upd('favicon_url', v)}
            type="branding"
            height={100}
          />

          <ImageUploader
            label="صورة صفحة الدخول"
            value={form.login_image_url}
            onChange={(v) => upd('login_image_url', v)}
            type="branding"
            height={140}
          />

          <ImageUploader
            label="بانر الصفحة الرئيسية"
            value={form.home_banner_url}
            onChange={(v) => upd('home_banner_url', v)}
            type="branding"
            height={140}
          />
        </div>
      </div>

      {msg && <div className="toast">{msg}</div>}

      <div className="branding-actions">
        <button
          className="btn btn-primary"
          onClick={save}
          disabled={saving}
        >
          {saving ? <span className="spinner"></span> : 'حفظ التغييرات'}
        </button>
      </div>
    </div>
  );
}
