import { useEffect, useState } from 'react';
import client, { handleError } from '../../api/client';

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await client.get('/admin/customers');
      setCustomers(res.data.data || []);
    } catch (_) {}
    setLoading(false);
  };

  const fmt = (n) => (parseFloat(n) || 0).toLocaleString('en-US');

  const filtered = customers.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (c.full_name || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q)
    );
  });

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div>
      <div className="card mb-2">
        <div style={{ display: 'flex', gap: 12 }}>
          <input
            className="form-input"
            placeholder="🔍 ابحث بالاسم أو الهاتف..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="btn btn-secondary" onClick={load}>🔄 تحديث</button>
        </div>
      </div>

      <div className="table-container">
        <div className="table-header">
          <h3>العملاء ({filtered.length})</h3>
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">👥</div>
            <p>لا يوجد عملاء</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>الاسم</th>
                <th>الهاتف</th>
                <th>النوع</th>
                <th>المنطقة</th>
                <th>الطلبات</th>
                <th>الإجمالي</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td><strong>{c.full_name}</strong></td>
                  <td>{c.phone}</td>
                  <td>
                    <span className="badge badge-info">
                      {{
                        individual: 'فرد',
                        trader: 'تاجر',
                        distributor: 'موزع',
                        contractor: 'مقاول',
                      }[c.customer_type] || c.customer_type}
                    </span>
                  </td>
                  <td>{c.governorate}{c.area ? ` - ${c.area}` : ''}</td>
                  <td>{c.orders_count || 0}</td>
                  <td><strong className="text-primary">{fmt(c.total_spent)} ر.ي</strong></td>
                  <td>
                    <span className={`badge ${c.status === 'active' ? 'badge-approved' : 'badge-cancelled'}`}>
                      {c.status === 'active' ? 'نشط' : 'موقوف'}
                    </span>
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
