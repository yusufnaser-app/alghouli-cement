import { useEffect, useState } from 'react';
import client, { handleError } from '../../api/client';
import { downloadFile } from '../../utils/files';

const fmt = (n) => (parseFloat(n) || 0).toLocaleString('en-US');
const SEGMENTS = [
  ['all', 'كل العملاء'],
  ['new', 'جدد'],
  ['active', 'نشطون'],
  ['big', 'كبار'],
  ['trader', 'تجار'],
  ['distributor', 'موزعون'],
  ['contractor', 'مقاولون'],
  ['low_activity', 'انخفاض نشاط'],
  ['inactive', 'غير نشطين'],
];
const LABEL = Object.fromEntries(SEGMENTS);
const COLOR = { new: '#2196F3', active: '#28A745', big: '#6A1B9A', low_activity: '#F57F17', inactive: '#DC3545' };

export default function Crm() {
  const [segment, setSegment] = useState('all');
  const [search, setSearch] = useState('');
  const [data, setData] = useState({ summary: {}, customers: [], config: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async (seg = segment, q = search) => {
    setLoading(true);
    setError('');
    try {
      const r = await client.get('/crm/customers', { params: { segment: seg, search: q || undefined } });
      setData(r.data.data);
    } catch (err) { setError(handleError(err)); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(segment); }, [segment]);

  const cfg = data.config || {};

  return (
    <div>
      <div className="card mb-2">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {SEGMENTS.map(([key, label]) => (
            <button key={key} className={`btn ${segment === key ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setSegment(key)}>
              {label} ({data.summary?.[key] ?? 0})
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
          <input className="form-input" style={{ maxWidth: 280 }} placeholder="🔍 بحث بالاسم أو الهاتف"
            value={search} onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()} />
          <button className="btn btn-secondary" onClick={() => load()}>بحث</button>
          <button className="btn btn-secondary"
            onClick={() => downloadFile('/crm/customers.csv', 'crm-customers.csv', { segment, search: search || undefined })
              .catch((e) => setError(handleError(e)))}>
            📥 تصدير Excel
          </button>
        </div>
        <p style={{ fontSize: 12, color: '#666', marginTop: 10 }}>
          التصنيف تلقائي من الطلبات: غير نشط = بلا طلب منذ {cfg.inactive_days} يومًا،
          انخفاض نشاط = طلبات آخر 30 يومًا أقل من {Math.round((cfg.drop_ratio || 0) * 100)}% من معدله الشهري السابق،
          كبير = ضمن أعلى {cfg.big_top_n} بمشتريات آخر سنة. الحدود قابلة للتعديل من الإعدادات (مفاتيح crm_...).
        </p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="loading"><div className="spinner"></div></div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr><th>العميل</th><th>الهاتف</th><th>التصنيف</th><th>الطلبات</th><th>إجمالي المشتريات</th><th>آخر طلب</th></tr>
            </thead>
            <tbody>
              {data.customers.length === 0 ? (
                <tr><td colSpan="6" style={{ textAlign: 'center', color: '#999' }}>لا يوجد عملاء</td></tr>
              ) : data.customers.map((c) => (
                <tr key={c.id}>
                  <td>{c.full_name}</td>
                  <td dir="ltr">{c.phone}</td>
                  <td>
                    {c.segments.filter((s) => COLOR[s]).map((s) => (
                      <span key={s} style={{ background: COLOR[s], color: '#fff', borderRadius: 10, padding: '2px 8px', fontSize: 11, marginInlineEnd: 4 }}>
                        {LABEL[s]}
                      </span>
                    ))}
                  </td>
                  <td>{c.orders_count}</td>
                  <td>{fmt(c.total_amount)}</td>
                  <td style={{ fontSize: 12 }}>
                    {c.last_order_at ? `منذ ${c.days_since_last_order} يومًا` : 'لا طلبات'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
