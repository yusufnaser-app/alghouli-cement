import { useEffect, useState } from 'react';
import client, { handleError } from '../../../api/client';

export default function TripsTab({ driverId }) {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState(null);

  useEffect(() => { load(); }, [driverId]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await client.get('/driver-file/' + driverId + '/trips');
      setTrips(res.data.data || []);
    } catch (err) {
      alert(handleError(err));
    } finally {
      setLoading(false);
    }
  };

  const fmt = (n) => (parseFloat(n) || 0).toLocaleString('en-US');

  const statusAr = (s) => ({
    'REQUESTED': 'بانتظار الاعتماد',
    'APPROVED': 'معتمد',
    'ISSUED': 'صادر',
    'USED': 'تم التحميل',
    'READY_FOR_TRANSIT': 'جاهز للطريق',
    'CANCELLED': 'ملغي',
    'EXPIRED': 'منتهي',
  }[s] || s);

  const statusColor = (s) => ({
    'REQUESTED': '#FFA000',
    'APPROVED': '#17A2B8',
    'ISSUED': '#2196F3',
    'USED': '#28A745',
    'READY_FOR_TRANSIT': '#1565C0',
    'CANCELLED': '#9E9E9E',
  }[s] || '#6B7C8E');

  const filtered = filter ? trips.filter(t => t.status === filter) : trips;

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div>
      <div className="card mb-2">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="form-select" value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ maxWidth: 220 }}>
            <option value="">كل الحالات</option>
            <option value="REQUESTED">بانتظار الاعتماد</option>
            <option value="APPROVED">معتمد</option>
            <option value="ISSUED">صادر</option>
            <option value="USED">تم التحميل</option>
            <option value="READY_FOR_TRANSIT">جاهز للطريق</option>
          </select>
          <div style={{ flex: 1 }}></div>
          <span style={{ fontSize: 13, color: '#666' }}>
            {filtered.length} رحلة
          </span>
          <button className="btn btn-secondary btn-sm" onClick={load}>تحديث</button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">📄</div>
            <p>لا توجد رحلات</p>
          </div>
        </div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>المصنع</th>
                <th>الكمية</th>
                <th>الرقم</th>
                <th>خط السير</th>
                <th>المستحق</th>
                <th>الحالة</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const diff = parseFloat(t.quantity_discrepancy || 0);
                return (
                  <tr key={t.id}>
                    <td style={{ fontSize: 12 }}>
                      {t.requested_at?.substring(0, 10)}
                    </td>
                    <td>{t.factory_name || '—'}</td>
                    <td>
                      <div><strong>{fmt(t.requested_quantity)}</strong> كيس</div>
                      {t.loaded_quantity && (
                        <div style={{ fontSize: 11, color: '#28A745' }}>
                          محمل: {fmt(t.loaded_quantity)}
                        </div>
                      )}
                      {Math.abs(diff) > 0.01 && (
                        <div style={{ fontSize: 11, color: '#DC3545' }}>
                          فرق: {diff > 0 ? '+' : ''}{fmt(diff)}
                        </div>
                      )}
                    </td>
                    <td>
                      {t.fax_number ? (
                        <code style={{ background: '#E3F2FD', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>
                          {t.fax_number}
                        </code>
                      ) : '—'}
                    </td>
                    <td style={{ fontSize: 11, maxWidth: 140 }}>
                      {t.route || <span style={{ color: '#999' }}>لم يُحدد</span>}
                    </td>
                    <td>
                      {t.transport_total ? (
                        <strong style={{ color: '#28A745' }}>
                          {fmt(t.transport_total)}
                        </strong>
                      ) : '—'}
                    </td>
                    <td>
                      <span className="badge" style={{
                        background: statusColor(t.status),
                        color: 'white',
                        fontSize: 10,
                      }}>
                        {statusAr(t.status)}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-primary btn-sm" onClick={() => setSelected(t)}>
                        👁
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600 }}>
            <div className="modal-header">
              <h3>تفاصيل الرحلة</h3>
              <button className="modal-close" onClick={() => setSelected(null)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gap: 12 }}>
                <Row label="المصنع" value={selected.factory_name} />
                <Row label="الكمية المطلوبة" value={fmt(selected.requested_quantity) + ' كيس'} />
                {selected.loaded_quantity && (
                  <Row label="الكمية المحملة" value={fmt(selected.loaded_quantity) + ' كيس'} />
                )}
                {selected.fax_number && (
                  <Row label="رقم الفاكس" value={selected.fax_number} />
                )}
                {selected.route && (
                  <Row label="خط السير" value={selected.route} />
                )}
                {selected.transport_rate && (
                  <Row label="سعر النقل" value={fmt(selected.transport_rate) + ' ريال / ' + (selected.transport_rate_unit === 'ton' ? 'طن' : 'كيس')} />
                )}
                {selected.transport_total && (
                  <Row label="إجمالي النقل" value={fmt(selected.transport_total) + ' ريال'} highlight />
                )}
                <Row label="الحالة" value={statusAr(selected.status)} />
                <Row label="التاريخ" value={selected.requested_at?.substring(0, 16)} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setSelected(null)}>إغلاق</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, highlight }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      padding: '10px 12px', background: highlight ? '#E8F5E9' : '#F8F9FA',
      borderRadius: 8,
    }}>
      <span style={{ fontSize: 13, color: '#666' }}>{label}</span>
      <strong style={{
        fontSize: 13,
        color: highlight ? '#2E7D32' : '#1A3A5C',
      }}>
        {value || '—'}
      </strong>
    </div>
  );
}
