import { useEffect, useState } from 'react';
import client, { handleError } from '../../api/client';

const STATUS_AR = { pending: 'بانتظار الإرسال', sending: 'جارٍ الإرسال', sent: 'أُرسلت', delivered: 'وصلت', failed: 'فاشلة' };
const STATUS_COLOR = { pending: '#F57F17', sending: '#2196F3', sent: '#28A745', delivered: '#28A745', failed: '#DC3545' };

export default function Sms() {
  const [tab, setTab] = useState('messages');
  const [status, setStatus] = useState('');
  const [data, setData] = useState({ messages: [], summary: {} });
  const [templates, setTemplates] = useState([]);
  const [providerNote, setProviderNote] = useState(null);
  const [edit, setEdit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [m, t, s] = await Promise.all([
        client.get('/sms/messages', { params: { status: status || undefined } }),
        client.get('/sms/templates'),
        client.get('/sms/status'),
      ]);
      setData(m.data.data);
      setTemplates(t.data.data || []);
      setProviderNote(s.data.data);
    } catch (err) { setError(handleError(err)); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [status]);

  const retry = async (id) => {
    setInfo(''); setError('');
    try {
      await client.post(`/sms/messages/${id}/retry`);
      setInfo('تم الإرسال');
    } catch (err) { setError(handleError(err)); }
    load();
  };

  const saveTemplate = async () => {
    setError('');
    try {
      await client.put(`/sms/templates/${edit.id}`, { bodyTemplate: edit.body_template, isActive: edit.is_active });
      setEdit(null);
      load();
    } catch (err) { setError(handleError(err)); }
  };

  const s = data.summary || {};

  return (
    <div>
      {providerNote && !providerNote.configured && (
        <div className="alert alert-warning" style={{ marginBottom: 12 }}>⚠️ {providerNote.note}</div>
      )}
      <div className="card mb-2">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className={`btn ${tab === 'messages' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('messages')}>
            ✉️ الرسائل ({Object.values(s).reduce((a, b) => a + b, 0)})
          </button>
          <button className={`btn ${tab === 'templates' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('templates')}>
            📝 القوالب ({templates.length})
          </button>
          <div style={{ flex: 1 }}></div>
          <button className="btn btn-secondary" onClick={load}>🔄 تحديث</button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {info && <div className="alert alert-info">{info}</div>}

      {loading ? <div className="loading"><div className="spinner"></div></div> : tab === 'messages' ? (
        <>
          <div className="card mb-2" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className={`btn ${status === '' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setStatus('')}>الكل</button>
            {Object.keys(STATUS_AR).map((k) => (
              <button key={k} className={`btn ${status === k ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setStatus(k)}>
                {STATUS_AR[k]} ({s[k] || 0})
              </button>
            ))}
          </div>
          <div className="table-container">
            <table>
              <thead><tr><th>الهاتف</th><th>الرسالة</th><th>النوع</th><th>الحالة</th><th>المحاولات</th><th>الخطأ</th><th></th></tr></thead>
              <tbody>
                {data.messages.length === 0 ? (
                  <tr><td colSpan="7" style={{ textAlign: 'center', color: '#999' }}>لا توجد رسائل</td></tr>
                ) : data.messages.map((m) => (
                  <tr key={m.id}>
                    <td dir="ltr">{m.phone}</td>
                    <td style={{ maxWidth: 320, fontSize: 12 }}>{m.message}</td>
                    <td style={{ fontSize: 11 }}>{m.message_type}</td>
                    <td><span style={{ color: STATUS_COLOR[m.status] || '#555', fontWeight: 'bold' }}>{STATUS_AR[m.status] || m.status}</span></td>
                    <td>{m.retry_count ?? 0}</td>
                    <td style={{ fontSize: 11, color: '#DC3545', maxWidth: 200 }}>{m.error_message || ''}</td>
                    <td>
                      {['failed', 'pending'].includes(m.status) && (
                        <button className="btn btn-secondary btn-sm" onClick={() => retry(m.id)}>🔁 إعادة</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="table-container">
          <table>
            <thead><tr><th>المفتاح</th><th>النص</th><th>المتغيرات</th><th>الحالة</th><th></th></tr></thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id}>
                  <td style={{ fontSize: 12 }}>{t.template_key}</td>
                  <td style={{ fontSize: 12, maxWidth: 360 }}>{t.body_template}</td>
                  <td style={{ fontSize: 11 }} dir="ltr">{(t.variables || []).map((v) => `{${v}}`).join(' ')}</td>
                  <td>{t.is_active ? '✅' : '⏸'}</td>
                  <td><button className="btn btn-secondary btn-sm" onClick={() => setEdit({ ...t })}>✏️ تعديل</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {edit && (
        <div className="modal-overlay" onClick={() => setEdit(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h3>📝 {edit.template_key}</h3>
              <button className="modal-close" onClick={() => setEdit(null)}>×</button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-error">{error}</div>}
              <div className="form-group">
                <label className="form-label">نص الرسالة</label>
                <textarea className="form-input" rows={4} value={edit.body_template}
                  onChange={(e) => setEdit({ ...edit, body_template: e.target.value })} />
              </div>
              <p style={{ fontSize: 12, color: '#666' }} dir="ltr">
                {(edit.variables || []).map((v) => `{${v}}`).join('  ')}
              </p>
              <label style={{ fontSize: 13 }}>
                <input type="checkbox" checked={!!edit.is_active} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} /> القالب فعّال
              </label>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setEdit(null)}>إلغاء</button>
              <button className="btn btn-success" onClick={saveTemplate}>💾 حفظ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
