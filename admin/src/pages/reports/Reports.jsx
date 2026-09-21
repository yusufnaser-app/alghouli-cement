import { useEffect, useState } from 'react';
import client, { handleError } from '../../api/client';

const PRESETS = [
  { key: '7d', label: 'آخر 7 أيام', days: 7 },
  { key: '30d', label: 'آخر 30 يومًا', days: 30 },
  { key: '90d', label: 'آخر 3 أشهر', days: 90 },
  { key: 'year', label: 'هذا العام', days: 365 },
];

export default function Reports() {
  const [preset, setPreset] = useState('30d');
  const [summary, setSummary] = useState(null);
  const [bySource, setBySource] = useState([]);
  const [byCategory, setByCategory] = useState([]);
  const [byPackaging, setByPackaging] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [daily, setDaily] = useState([]);
  const [loading, setLoading] = useState(true);

  const getRange = () => {
    const days = PRESETS.find((p) => p.key === preset)?.days || 30;
    const to = new Date();
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return {
      from: from.toISOString().substring(0, 10),
      to: to.toISOString().substring(0, 10),
    };
  };

  useEffect(() => { load(); }, [preset]);

  const load = async () => {
    setLoading(true);
    const { from, to } = getRange();
    try {
      const [s, src, cat, pack, top, d] = await Promise.all([
        client.get(`/reports/summary?from=${from}&to=${to}`),
        client.get(`/reports/by-source?from=${from}&to=${to}`),
        client.get(`/reports/by-category?from=${from}&to=${to}`),
        client.get(`/reports/by-packaging?from=${from}&to=${to}`),
        client.get(`/reports/top-products?from=${from}&to=${to}&limit=10`),
        client.get(`/reports/daily?from=${from}&to=${to}`),
      ]);
      setSummary(s.data.data);
      setBySource(src.data.data || []);
      setByCategory(cat.data.data || []);
      setByPackaging(pack.data.data || []);
      setTopProducts(top.data.data || []);
      setDaily(d.data.data || []);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const fmt = (n) => (parseFloat(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  const maxDaily = Math.max(...daily.map((d) => parseFloat(d.total_sales) || 0), 1);

  return (
    <div>
      {/* فلاتر الفترة */}
      <div className="card mb-2">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {PRESETS.map((p) => (
            <button
              key={p.key}
              className={`btn ${preset === p.key ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setPreset(p.key)}
            >
              {p.label}
            </button>
          ))}
          <div style={{ flex: 1 }}></div>
          <button className="btn btn-secondary" onClick={load}>🔄 تحديث</button>
        </div>
      </div>

      {/* البطاقات الإحصائية */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#E3F2FD', color: '#1565C0' }}>📦</div>
          <div className="stat-info">
            <h3>إجمالي الطلبات</h3>
            <div className="value">{summary?.total_orders || 0}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#E8F5E9', color: '#2E7D32' }}>💰</div>
          <div className="stat-info">
            <h3>إجمالي المبيعات</h3>
            <div className="value">{fmt(summary?.total_sales)}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#FFF3E0', color: '#EF6C00' }}>✅</div>
          <div className="stat-info">
            <h3>مكتملة</h3>
            <div className="value">{summary?.completed_orders || 0}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#FFF9C4', color: '#F57F17' }}>⏳</div>
          <div className="stat-info">
            <h3>معلقة</h3>
            <div className="value">{summary?.pending_orders || 0}</div>
          </div>
        </div>
      </div>

      {/* الرسم البياني اليومي */}
      <div className="card mb-2">
        <h3 style={{ marginBottom: 20 }}>📈 المبيعات اليومية</h3>
        {daily.length === 0 ? (
          <div className="empty-state"><p>لا توجد بيانات</p></div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 200, padding: '0 8px' }}>
            {daily.map((d, i) => {
              const h = (parseFloat(d.total_sales) / maxDaily) * 100;
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ fontSize: 9, color: '#666' }}>{fmt(d.total_sales)}</div>
                  <div
                    style={{
                      width: '100%',
                      height: `${Math.max(h, 3)}%`,
                      background: 'linear-gradient(180deg, #4CAF50, #1B5E20)',
                      borderRadius: '6px 6px 0 0',
                      minHeight: 6,
                    }}
                  />
                  <div style={{ fontSize: 9, color: '#999' }}>{d.sale_date?.substring(5, 10)}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid-2 mb-2">
        {/* حسب المصنع */}
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>🏭 المبيعات حسب المصنع</h3>
          {bySource.filter((s) => parseFloat(s.total_sales) > 0).length === 0 ? (
            <div className="empty-state"><p>لا توجد بيانات</p></div>
          ) : (
            <table style={{ fontSize: 13 }}>
              <thead>
                <tr><th>المصنع</th><th>الطلبات</th><th>الكمية</th><th>المبيعات</th></tr>
              </thead>
              <tbody>
                {bySource.filter((s) => parseFloat(s.total_sales) > 0).map((s) => (
                  <tr key={s.code}>
                    <td><strong>{s.name_ar}</strong></td>
                    <td>{s.orders_count}</td>
                    <td>{fmt(s.total_quantity)}</td>
                    <td className="text-primary"><strong>{fmt(s.total_sales)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* حسب النوع */}
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>🎨 المبيعات حسب النوع</h3>
          {byCategory.filter((c) => parseFloat(c.total_sales) > 0).length === 0 ? (
            <div className="empty-state"><p>لا توجد بيانات</p></div>
          ) : (
            <table style={{ fontSize: 13 }}>
              <thead>
                <tr><th>النوع</th><th>الطلبات</th><th>الكمية</th><th>المبيعات</th></tr>
              </thead>
              <tbody>
                {byCategory.filter((c) => parseFloat(c.total_sales) > 0).map((c) => (
                  <tr key={c.code}>
                    <td>
                      <strong>{c.name_ar}</strong>
                      <span style={{ fontSize: 10, color: '#999', marginRight: 6 }}>
                        ({c.color_name_ar})
                      </span>
                    </td>
                    <td>{c.orders_count}</td>
                    <td>{fmt(c.total_quantity)}</td>
                    <td className="text-primary"><strong>{fmt(c.total_sales)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="grid-2">
        {/* حسب التعبئة */}
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>📦 حسب التعبئة</h3>
          {byPackaging.length === 0 ? (
            <div className="empty-state"><p>لا توجد بيانات</p></div>
          ) : (
            <table style={{ fontSize: 13 }}>
              <thead>
                <tr><th>التعبئة</th><th>الطلبات</th><th>الكمية</th><th>المبيعات</th></tr>
              </thead>
              <tbody>
                {byPackaging.map((p) => (
                  <tr key={p.packaging_type}>
                    <td><strong>{p.packaging_type === 'bagged' ? '📦 أكياس' : '🚛 سائب'}</strong></td>
                    <td>{p.orders_count}</td>
                    <td>{fmt(p.total_quantity)}</td>
                    <td className="text-primary"><strong>{fmt(p.total_sales)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* الأكثر مبيعًا */}
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>🔥 الأكثر مبيعًا</h3>
          {topProducts.length === 0 ? (
            <div className="empty-state"><p>لا توجد بيانات</p></div>
          ) : (
            <table style={{ fontSize: 13 }}>
              <thead>
                <tr><th>المنتج</th><th>الكمية</th><th>المبيعات</th></tr>
              </thead>
              <tbody>
                {topProducts.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div><strong>{p.name_ar?.substring(0, 30)}</strong></div>
                      <div style={{ fontSize: 10, color: '#999' }}>{p.source_name}</div>
                    </td>
                    <td>{fmt(p.total_quantity)}</td>
                    <td className="text-primary"><strong>{fmt(p.total_sales)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
