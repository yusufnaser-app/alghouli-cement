import { useEffect, useState } from 'react';
import { api } from '../../api/client';

export default function Providers() {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState({});

  const load = async () => {
    try {
      const res = await api.providersList();
      setProviders(res.data.data || []);
    } catch (e) {
      setMsg('تعذّر التحميل: ' + (e.response?.data?.message || e.message));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const updateConfig = (name, key, value) => {
    setProviders((arr) => arr.map((p) =>
      p.name === name ? { ...p, config: { ...p.config, [key]: value } } : p
    ));
  };

  const save = async (name) => {
    setSaving((s) => ({ ...s, [name]: true }));
    setMsg('');
    try {
      const p = providers.find((x) => x.name === name);
      const res = await api.providerUpdate(name, p.config);
      setProviders(res.data.data || []);
      setMsg(`✅ تم حفظ ${p.label_ar}`);
    } catch (e) {
      setMsg('❌ ' + (e.response?.data?.message || e.message));
    } finally {
      setSaving((s) => ({ ...s, [name]: false }));
    }
  };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div className="providers-page">
      <h2 className="page-title">مزودو الخدمة</h2>

      {providers.map((p) => (
        <div key={p.name} className="card provider-card">
          <div className="provider-header">
            <div>
              <h3>{p.label_ar}</h3>
              <p className="provider-desc">{p.description_ar}</p>
            </div>
            <div className="provider-status">
              <label className="switch">
                <input
                  type="checkbox"
                  checked={!!p.config.enabled || p.enabled}
                  onChange={(e) => {
                    setProviders((arr) => arr.map((x) =>
                      x.name === p.name
                        ? { ...x, config: { ...x.config, enabled: e.target.checked }, enabled: e.target.checked }
                        : x
                    ));
                  }}
                />
                <span className="slider"></span>
              </label>
            </div>
          </div>

          <div className="provider-fields">
            {p.fields.map((f) => (
              <div key={f.key} className="form-group">
                <label>
                  {f.label}
                  {f.required && <span style={{ color: 'red' }}> *</span>}
                </label>

                {f.type === 'select' ? (
                  <select
                    value={p.config[f.key] || ''}
                    onChange={(e) => updateConfig(p.name, f.key, e.target.value)}
                    className="input"
                  >
                    <option value="">— اختر —</option>
                    {f.options.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                ) : f.type === 'textarea' ? (
                  <textarea
                    value={p.config[f.key] || ''}
                    onChange={(e) => updateConfig(p.name, f.key, e.target.value)}
                    className="input"
                    rows={5}
                  />
                ) : (
                  <input
                    type={f.type === 'password' || f.secret ? 'password' : f.type}
                    value={p.config[f.key] || ''}
                    onChange={(e) => updateConfig(p.name, f.key, e.target.value)}
                    className="input"
                    placeholder={p.config[`${f.key}_has_value`] ? '•••• (محفوظ مسبقًا)' : ''}
                  />
                )}
              </div>
            ))}
          </div>

          <div className="provider-actions">
            <button
              className="btn btn-primary"
              onClick={() => save(p.name)}
              disabled={saving[p.name]}
            >
              {saving[p.name] ? <span className="spinner"></span> : 'حفظ'}
            </button>
          </div>
        </div>
      ))}

      {msg && <div className="toast">{msg}</div>}
    </div>
  );
}
