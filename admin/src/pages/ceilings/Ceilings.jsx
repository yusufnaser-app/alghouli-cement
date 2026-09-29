import { useEffect, useState } from 'react';
import client, { handleError } from '../../api/client';

const fmt = (n) => (parseFloat(n) || 0).toLocaleString('en-US');
const emptyRule = { nameAr: '', period: 'daily', customerId: '', sourceId: '', maxBags: '', maxAmount: '' };

export default function Ceilings() {
  const [tab, setTab] = useState('rules');
  const [rules, setRules] = useState([]);
  const [overrides, setOverrides] = useState([]);
  const [sources, setSources] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyRule);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [r, ov, s, c] = await Promise.all([
        client.get('/ceilings/rules'),
        client.get('/ceilings/overrides', { params: { status: 'PENDING' } }),
        client.get('/sources'),
        client.get('/admin/customers'),
      ]);
      setRules(r.data.data || []);
      setOverrides(ov.data.data || []);
      setSources(s.data.data || []);
      setCustomers(c.data.data || []);
    } catch (err) { setError(handleError(err)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const sourceName = (id) => (sources.find((s) => s.id === id) || {}).name_ar || 'كل المصانع';
  const customerName = (id) => {
    const c = customers.find((x) => x.id === id);
    return c ? c.full_name : 'كل العملاء';
  };

  const saveRule = async () => {
    if (!form.nameAr.trim()) { setError('اسم السقف مطلوب'); return; }
    const maxBags = form.maxBags ? parseFloat(form.maxBags) : null;
    const maxAmount = form.maxAmount ? parseFloat(form.maxAmount) : null;
    if (!maxBags && !maxAmount) { setError('حدد سقفًا بالكيس أو بالقيمة على الأقل'); return; }
    setSaving(true);
    setError('');
    try {
      await client.post('/ceilings/rules', {
        nameAr: form.nameAr.trim(), period: form.period,
        customerId: form.customerId || null, sourceId: form.sourceId || null,
        maxBags, maxAmount,
      });
      setShowForm(false);
      setForm(emptyRule);
      load();
    } catch (err) { setError(handleError(err)); }
    finally { setSaving(false); }
  };

  const toggleRule = async (r) => {
    try { await client.put(`/ceilings/rules/${r.id}`, { isActive: !r.is_active }); load(); }
    catch (err) { setError(handleError(err)); }
  };

  const decide = async (id, approve) => {
    try { await client.patch(`/ceilings/overrides/${id}/decide`, { approve }); load(); }
    catch (err) { setError(handleError(err)); }
  };

  return (
    <div>
      <div className="card mb-2">
        <div style={{ display: 'flex', gap: 12 }}>
          <button className={`btn ${tab === 'rules' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('rules')}>
            🚧 السقوف ({rules.length})
          </button>
          <button className={`btn ${tab === 'overrides' ? 'btn-danger' : 'btn-secondary'}`} onClick={() => setTab('overrides')}>
            ⏳ طلبات موافقة استثنائية ({overrides.length})
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? <div className="loading"><div className="spinner"></div></div> : tab === 'rules' ? (
        <>
          <div className="card mb-2">
            <button className="btn btn-success" onClick={() => { setShowForm(true); setError(''); }}>➕ إضافة سقف</button>
          </div>
          <div className="table-container">
            <table>
              <thead><tr><th>الاسم</th><th>الفترة</th><th>العميل</th><th>المصنع</th><th>الحد بالكيس</th><th>الحد بالقيمة</th><th>الحالة</th><th></th></tr></thead>
              <tbody>
                {rules.length === 0 ? (
                  <tr><td colSpan="8" style={{ textAlign: 'center', color: '#999' }}>لا توجد سقوف بعد — كل الطلبات تُقبل بلا حد</td></tr>
                ) : rules.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name_ar}</td>
                    <td>{r.period === 'daily' ? 'يومي' : 'شهري'}</td>
                    <td style={{ fontSize: 12 }}>{r.customer_id ? customerName(r.customer_id) : 'الكل'}</td>
                    <td style={{ fontSize: 12 }}>{r.source_id ? sourceName(r.source_id) : 'الكل'}</td>
                    <td>{r.max_bags ? fmt(r.max_bags) : '—'}</td>
                    <td>{r.max_amount ? fmt(r.max_amount) : '—'}</td>
                    <td>{r.is_active ? '✅' : '⏸'}</td>
                    <td><button className="btn btn-secondary btn-sm" onClick={() => toggleRule(r)}>{r.is_active ? 'تعطيل' : 'تفعيل'}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="table-container">
          <table>
            <thead><tr><th>العميل</th><th>الهاتف</th><th>المطلوب (كيس)</th><th>المطلوب (ريال)</th><th>السبب</th><th></th></tr></thead>
            <tbody>
              {overrides.length === 0 ? (
                <tr><td colSpan="6" style={{ textAlign: 'center', color: '#999' }}>لا توجد طلبات معلّقة</td></tr>
              ) : overrides.map((o) => (
                <tr key={o.id}>
                  <td>{o.customer_name}</td>
                  <td dir="ltr">{o.customer_phone}</td>
                  <td>{o.requested_bags ? fmt(o.requested_bags) : '—'}</td>
                  <td>{o.requested_amount ? fmt(o.requested_amount) : '—'}</td>
                  <td style={{ fontSize: 12 }}>{o.reason || '—'}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-success btn-sm" onClick={() => decide(o.id, true)}>✅ موافقة</button>
                    <button className="btn btn-danger btn-sm" onClick={() => decide(o.id, false)}>❌ رفض</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-header"><h3>➕ سقف جديد</h3><button className="modal-close" onClick={() => setShowForm(false)}>×</button></div>
            <div className="modal-body">
              {error && <div className="alert alert-error">{error}</div>}
              <div className="form-group">
                <label className="form-label">الاسم *</label>
                <input className="form-input" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} placeholder="مثال: سقف يومي — مصنع عمران" />
              </div>
              <div className="form-group">
                <label className="form-label">الفترة</label>
                <select className="form-select" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })}>
                  <option value="daily">يومي</option>
                  <option value="monthly">شهري</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">العميل (اختياري — فارغ = كل العملاء)</label>
                <select className="form-select" value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
                  <option value="">كل العملاء</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">المصنع (اختياري — فارغ = كل المصانع)</label>
                <select className="form-select" value={form.sourceId} onChange={(e) => setForm({ ...form, sourceId: e.target.value })}>
                  <option value="">كل المصانع</option>
                  {sources.map((s) => <option key={s.id} value={s.id}>{s.name_ar}</option>)}
                </select>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">الحد بالكيس</label>
                  <input type="number" className="form-input" value={form.maxBags} onChange={(e) => setForm({ ...form, maxBags: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">الحد بالقيمة (ريال)</label>
                  <input type="number" className="form-input" value={form.maxAmount} onChange={(e) => setForm({ ...form, maxAmount: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowForm(false)}>إلغاء</button>
              <button className="btn btn-success" onClick={saveRule} disabled={saving}>{saving ? '...' : '💾 حفظ'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
