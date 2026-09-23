import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';

export default function Traders() {
  const [traders, setTraders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await client.get('/admin/customers');
      const all = res.data.data || [];
      setTraders(all.filter((c) => ['trader', 'distributor', 'contractor'].includes(c.customer_type)));
    } catch (_) {}
    setLoading(false);
  };

  const fmt = (n) => (parseFloat(n) || 0).toLocaleString('en-US');

  const filtered = traders.filter((t) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (t.full_name || '').toLowerCase().includes(q) || (t.phone || '').includes(q);
  });

  const totalDebt = traders.reduce((s, t) => s + parseFloat(t.current_balance || 0), 0);

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div>
      <div className="stat-grid mb-2">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#E3F2FD', color: '#1565C0' }}>👥</div>
          <div className="stat-info">
            <h3>إجمالي التجار</h3>
            <div className="value">{traders.length}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#FFEBEE', color: '#C62828' }}>💰</div>
          <div className="stat-info">
            <h3>إجمالي الديون</h3>
            <div className="value">{fmt(totalDebt)}</div>
          </div>
        </div>
      </div>

      <div className="card mb-2">
        <input className="form-input" placeholder="🔍 ابحث..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="table-container">
        <div className="table-header">
          <h3>الموزعون ({filtered.length})</h3>
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state"><p>لا يوجد موزعون</p></div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>الاسم</th>
                <th>الهاتف</th>
                <th>النوع</th>
                <th>الرصيد</th>
                <th>الحد</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id}>
                  <td><strong>{t.full_name}</strong></td>
                  <td>{t.phone}</td>
                  <td>
                    <span className="badge badge-info">
                      {{ trader: 'تاجر', distributor: 'موزع', contractor: 'مقاول' }[t.customer_type] || t.customer_type}
                    </span>
                  </td>
                  <td><strong className="text-primary">{fmt(t.current_balance)} ر.ي</strong></td>
                  <td>{fmt(t.credit_limit)} ر.ي</td>
                  <td>
                    <button className="btn btn-primary btn-sm" onClick={() => navigate(`/traders/${t.id}`)}>
                      📋 كشف
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
