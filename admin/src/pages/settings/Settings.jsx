import { useEffect, useState } from 'react';
import client, { handleError } from '../../api/client';

export default function Settings() {
  const [settings, setSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await client.get('/settings');
      setSettings(res.data.data || []);
      const obj = {};
      (res.data.data || []).forEach((s) => { obj[s.key] = s.value || ''; });
      setForm(obj);
    } catch (_) {}
    setLoading(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = Object.entries(form).map(([key, value]) => ({
        key,
        value: String(value || ''),
      }));
      await client.put('/settings', { settings: payload });
      alert('✅ تم حفظ الإعدادات');
      load();
    } catch (err) {
      alert(handleError(err));
    }
    setSaving(false);
  };

  const update = (key, value) => setForm({ ...form, [key]: value });

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  const groups = [
    {
      title: '🏢 معلومات المؤسسة',
      fields: [
        { key: 'company_name', label: 'اسم المؤسسة', placeholder: 'مؤسسة الغولي' },
        { key: 'company_phone', label: 'رقم الهاتف', placeholder: '967775477377' },
        { key: 'company_whatsapp', label: 'رقم الواتساب', placeholder: '967775477377' },
        { key: 'company_email', label: 'البريد الإلكتروني', placeholder: 'info@alghouli.com' },
        { key: 'company_address', label: 'العنوان', placeholder: 'اليمن - صنعاء' },
      ],
    },
    {
      title: '💰 العملة والدفع',
      fields: [
        { key: 'default_currency', label: 'العملة', placeholder: 'YER' },
        { key: 'bank_name', label: 'اسم البنك', placeholder: 'بنك التضامن' },
        { key: 'bank_account_name', label: 'اسم صاحب الحساب', placeholder: 'مؤسسة الغولي' },
        { key: 'bank_account_number', label: 'رقم الحساب', placeholder: '' },
        { key: 'wallet_number', label: 'رقم المحفظة الإلكترونية', placeholder: '' },
      ],
    },
    {
      title: '📋 سياسات',
      fields: [
        { key: 'cancel_policy', label: 'سياسة الإلغاء', type: 'textarea', placeholder: 'يمكن الإلغاء قبل اعتماد الدفع' },
      ],
    },
  ];

  return (
    <div>
      {groups.map((g) => (
        <div key={g.title} className="card mb-2">
          <h3 style={{ marginBottom: 20 }}>{g.title}</h3>
          <div className="grid-2">
            {g.fields.map((f) => (
              <div key={f.key} className="form-group" style={f.type === 'textarea' ? { gridColumn: '1 / -1' } : {}}>
                <label className="form-label">{f.label}</label>
                {f.type === 'textarea' ? (
                  <textarea
                    className="form-textarea"
                    value={form[f.key] || ''}
                    onChange={(e) => update(f.key, e.target.value)}
                    placeholder={f.placeholder}
                  />
                ) : (
                  <input
                    className="form-input"
                    value={form[f.key] || ''}
                    onChange={(e) => update(f.key, e.target.value)}
                    placeholder={f.placeholder}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="card">
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'جاري الحفظ...' : '💾 حفظ الإعدادات'}
          </button>
          <button className="btn btn-secondary" onClick={load}>🔄 استرجاع</button>
        </div>
      </div>
    </div>
  );
}
