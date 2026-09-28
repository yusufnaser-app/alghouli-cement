import { useEffect, useState } from 'react';
import client, { handleError } from '../../api/client';
import { downloadFile } from '../../utils/files';

const fmt = (n) => (parseFloat(n) || 0).toLocaleString('en-US');
const UNIT_AR = { bag: 'لكل كيس', ton: 'لكل طن' };
const PERIOD_AR = { monthly: 'شهري', yearly: 'سنوي' };
const emptyRule = { nameAr: '', period: 'monthly', unit: 'bag', ratePerUnit: '', sourceId: '' };

export default function Incentives() {
  const now = new Date();
  const [tab, setTab] = useState('report');
  const [rules, setRules] = useState([]);
  const [sources, setSources] = useState([]);
  const [report, setReport] = useState(null);
  const [q, setQ] = useState({ period: 'monthly', year: now.getFullYear(), month: now.getMonth() + 1 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyRule);
  const [saving, setSaving] = useState(false);

  const params = () => ({
    period: q.period,
    year: q.year,
    ...(q.period === 'monthly' ? { month: q.month } : {}),
  });

  const loadRules = async () => {
    try {
      const r = await client.get('/incentives/rules');
      setRules(r.data.data || []);
    } catch (err) { setError(handleError(err)); }
  };

  const loadReport = async () => {
    setLoading(true);
    setError('');
    try {
      const r = await client.get('/incentives/report', { params: params() });
      setReport(r.data.data);
    } catch (err) { setError(handleError(err)); }
    finally { setLoading(false); }
  };

  const loadSources = async () => {
    try {
      const r = await client.get('/sources');
      setSources(r.data.data || []);
    } catch (err) { setError(handleError(err)); }
  };

  const sourceName = (id) => (sources.find((s) => s.id === id) || {}).name_ar || '—';

  useEffect(() => { loadRules(); loadSources(); }, []);
  useEffect(() => { if (tab === 'report') loadReport(); }, [tab]);

  const saveRule = async () => {
    if (!form.nameAr.trim()) { setError('اسم القاعدة مطلوب'); return; }
    const rate = parseFloat(form.ratePerUnit);
    if (isNaN(rate) || rate < 0) { setError('سعر الوحدة غير صحيح'); return; }
    setSaving(true);
    setError('');
    try {
      await client.post('/incentives/rules', {
        nameAr: form.nameAr.trim(),
        period: form.period,
        unit: form.unit,
        ratePerUnit: rate,
        sourceId: form.sourceId || null,
      });
      setShowForm(false);
      setForm(emptyRule);
      loadRules();
    } catch (err) { setError(handleError(err)); }
    finally { setSaving(false); }
  };

  const toggleRule = async (r) => {
    try {
      await client.put(`/incentives/rules/${r.id}`, { isActive: !r.is_active });
      loadRules();
    } catch (err) { setError(handleError(err)); }
  };

  return (
    <div>
      <div className="card mb-2">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className={`btn ${tab === 'report' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('report')}>
            📊 تقرير الحوافز
          </button>
          <button className={`btn ${tab === 'rules' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('rules')}>
            ⚙️ القواعد ({rules.length})
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {tab === 'report' && (
        <>
          <div className="card mb-2">
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <label className="form-label">الفترة</label>
                <select className="form-select" value={q.period} onChange={(e) => setQ({ ...q, period: e.target.value })}>
                  <option value="monthly">شهري</option>
                  <option value="yearly">سنوي</option>
                </select>
              </div>
              <div>
                <label className="form-label">السنة</label>
                <input type="number" className="form-input" style={{ width: 100 }} value={q.year}
                  onChange={(e) => setQ({ ...q, year: parseInt(e.target.value, 10) || now.getFullYear() })} />
              </div>
              {q.period === 'monthly' && (
                <div>
                  <label className="form-label">الشهر</label>
                  <select className="form-select" value={q.month} onChange={(e) => setQ({ ...q, month: parseInt(e.target.value, 10) })}>
                    {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
                  </select>
                </div>
              )}
              <button className="btn btn-primary" onClick={loadReport}>عرض</button>
              <button className="btn btn-secondary"
                onClick={() => downloadFile('/incentives/report.csv', `incentives-${q.year}${q.period === 'monthly' ? '-' + q.month : ''}.csv`, params())
                  .catch((e) => setError(handleError(e)))}>
                📥 تصدير Excel
              </button>
            </div>
          </div>

          {loading ? (
            <div className="loading"><div className="spinner"></div></div>
          ) : report && (
            <>
              {report.note && <div className="alert alert-info">{report.note}</div>}
              <div className="card mb-2">
                <strong>إجمالي حوافز المصانع المستحقة للمؤسسة: </strong>
                <span style={{ color: '#2E7D32', fontSize: 20 }}>{fmt(report.grand_total)} ريال</span>
              </div>
              <div className="table-container">
                <table>
                  <thead>
                    <tr><th>المصنع</th><th>الرحلات</th><th>الأكياس</th><th>الأطنان</th><th>القواعد المطبقة</th><th>الحافز</th></tr>
                  </thead>
                  <tbody>
                    {report.factories.length === 0 ? (
                      <tr><td colSpan="6" style={{ textAlign: 'center', color: '#999' }}>لا توجد كميات مسحوبة في هذه الفترة</td></tr>
                    ) : report.factories.map((d) => (
                      <tr key={d.source_id}>
                        <td>{d.factory_name}</td>
                        <td>{d.trips}</td>
                        <td>{fmt(d.total_bags)}</td>
                        <td>{fmt(d.total_tons)}</td>
                        <td style={{ fontSize: 12 }}>
                          {d.applied_rules.length === 0 ? '—' : d.applied_rules.map((a) => (
                            <div key={a.rule_id}>{a.rule_name}: {fmt(a.quantity)} × {fmt(a.rate)}</div>
                          ))}
                        </td>
                        <td><strong>{fmt(d.total_incentive)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {tab === 'rules' && (
        <>
          <div className="card mb-2">
            <button className="btn btn-success" onClick={() => { setShowForm(true); setError(''); }}>➕ إضافة قاعدة حافز</button>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr><th>الاسم</th><th>الفترة</th><th>الوحدة</th><th>السعر</th><th>المصنع</th><th>الحالة</th><th></th></tr>
              </thead>
              <tbody>
                {rules.length === 0 ? (
                  <tr><td colSpan="7" style={{ textAlign: 'center', color: '#999' }}>لا توجد قواعد بعد</td></tr>
                ) : rules.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name_ar}</td>
                    <td>{PERIOD_AR[r.period]}</td>
                    <td>{UNIT_AR[r.unit]}</td>
                    <td>{fmt(r.rate_per_unit)}</td>
                    <td style={{ fontSize: 12 }}>{r.source_id ? sourceName(r.source_id) : 'كل المصانع'}</td>
                    <td>{r.is_active ? '✅ فعّالة' : '⏸ معطّلة'}</td>
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => toggleRule(r)}>
                        {r.is_active ? 'تعطيل' : 'تفعيل'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3>➕ قاعدة حافز جديدة</h3>
              <button className="modal-close" onClick={() => setShowForm(false)}>×</button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-error">{error}</div>}
              <div className="form-group">
                <label className="form-label">اسم القاعدة *</label>
                <input className="form-input" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} placeholder="مثال: حافز مصنع عمران الشهري" />
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">الفترة</label>
                  <select className="form-select" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })}>
                    <option value="monthly">شهري</option>
                    <option value="yearly">سنوي</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">الوحدة</label>
                  <select className="form-select" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                    <option value="bag">لكل كيس</option>
                    <option value="ton">لكل طن</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">سعر الوحدة (ريال) *</label>
                <input type="number" className="form-input" value={form.ratePerUnit} onChange={(e) => setForm({ ...form, ratePerUnit: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">المصنع</label>
                <select className="form-select" value={form.sourceId} onChange={(e) => setForm({ ...form, sourceId: e.target.value })}>
                  <option value="">كل المصانع</option>
                  {sources.map((s) => <option key={s.id} value={s.id}>{s.name_ar}</option>)}
                </select>
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
