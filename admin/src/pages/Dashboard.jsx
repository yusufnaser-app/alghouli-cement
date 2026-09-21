import { useEffect, useState } from 'react';
import client, { handleError } from '../api/client';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await client.get('/admin/dashboard');
      setData(res.data.data);
    } catch (err) {
      setError(handleError(err));
    } finally {
      setLoading(false);
    }
  };

  const fmt = (n) => {
    const v = parseFloat(n) || 0;
    return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <p>جاري التحميل...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert alert-error">
        <span>⚠️</span>
        <span>{error}</span>
      </div>
    );
  }

  const stats = [
    {
      icon: '📦',
      bg: '#E3F2FD',
      color: '#1565C0',
      label: 'طلبات اليوم',
      value: data?.today?.orders || 0,
    },
    {
      icon: '💰',
      bg: '#E8F5E9',
      color: '#2E7D32',
      label: 'مبيعات اليوم',
      value: `${fmt(data?.today?.sales)} ر.ي`,
    },
    {
      icon: '📊',
      bg: '#FFF3E0',
      color: '#EF6C00',
      label: 'طلبات الشهر',
      value: data?.month?.orders || 0,
    },
    {
      icon: '💵',
      bg: '#F3E5F5',
      color: '#6A1B9A',
      label: 'مبيعات الشهر',
      value: `${fmt(data?.month?.sales)} ر.ي`,
    },
    {
      icon: '⏳',
      bg: '#FFF9C4',
      color: '#F57F17',
      label: 'مدفوعات معلقة',
      value: data?.pending_payments || 0,
    },
    {
      icon: '⚠️',
      bg: '#FFEBEE',
      color: '#C62828',
      label: 'مخزون منخفض',
      value: data?.low_stock || 0,
    },
  ];

  const statuses = data?.orders_by_status || {};
  const statusList = [
    { key: 'PENDING_PAYMENT', label: 'بانتظار الدفع', color: 'badge-pending' },
    { key: 'PENDING_PAYMENT_REVIEW', label: 'بانتظار المراجعة', color: 'badge-pending' },
    { key: 'PAYMENT_APPROVED', label: 'تم اعتماد الدفع', color: 'badge-approved' },
    { key: 'PREPARING', label: 'قيد التجهيز', color: 'badge-info' },
    { key: 'DRIVER_ASSIGNED', label: 'تم تعيين السائق', color: 'badge-info' },
    { key: 'IN_TRANSIT', label: 'في الطريق', color: 'badge-transit' },
    { key: 'DELIVERED', label: 'تم التسليم', color: 'badge-completed' },
    { key: 'COMPLETED', label: 'مكتمل', color: 'badge-completed' },
    { key: 'CANCELLED', label: 'ملغي', color: 'badge-cancelled' },
  ];

  return (
    <div>
      <div className="stat-grid">
        {stats.map((s, i) => (
          <div key={i} className="stat-card">
            <div className="stat-icon" style={{ background: s.bg, color: s.color }}>
              {s.icon}
            </div>
            <div className="stat-info">
              <h3>{s.label}</h3>
              <div className="value">{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 16 }}>توزيع الطلبات حسب الحالة</h3>
        {Object.keys(statuses).length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📊</div>
            <p>لا توجد بيانات</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            {statusList
              .filter((s) => statuses[s.key])
              .map((s) => (
                <div
                  key={s.key}
                  style={{
                    padding: 16,
                    borderRadius: 12,
                    background: '#F8F9FA',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span>{s.label}</span>
                  <span className={`badge ${s.color}`}>{statuses[s.key]}</span>
                </div>
              ))}
          </div>
        )}
      </div>

      <div className="mt-3" style={{ textAlign: 'left' }}>
        <button className="btn btn-secondary" onClick={loadDashboard}>
          🔄 تحديث
        </button>
      </div>
    </div>
  );
}
