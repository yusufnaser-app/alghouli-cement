import { useEffect, useState } from 'react';
import client, { handleError } from '../../api/client';

export default function PendingDrivers() {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rejecting, setRejecting] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await client.get('/drivers/admin/pending');
      setDrivers(res.data.data || []);
    } catch (err) {
      setError(handleError(err));
    } finally {
      setLoading(false);
    }
  };

  const approve = async (id) => {
    if (!window.confirm('اعتماد هذا السائق؟')) return;
    try {
      await client.patch(`/drivers/admin/${id}/approve`);
      alert('✅ تم اعتماد السائق');
      load();
    } catch (err) {
      alert(handleError(err));
    }
  };

  const reject = async () => {
    if (!rejectReason.trim()) {
      alert('يرجى إدخال سبب الرفض');
      return;
    }
    try {
      await client.patch(`/drivers/admin/${rejecting}/reject`, { reason: rejectReason });
      setRejecting(null);
      setRejectReason('');
      alert('تم الرفض');
      load();
    } catch (err) {
      alert(handleError(err));
    }
  };

  const driverTypeAr = (t) => ({
    institution_driver: 'سائق مؤسسة',
    transport_driver: 'سائق نقل مستقل',
    trader_driver: 'سائق تاجر',
  }[t] || t);

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div>
      <div className="card mb-2">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3>👤 سائقون بانتظار الاعتماد</h3>
            <p style={{ color: '#999', fontSize: 13, marginTop: 4 }}>
              عدد: {drivers.length}
            </p>
          </div>
          <button className="btn btn-secondary" onClick={load}>🔄 تحديث</button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {drivers.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">✅</div>
            <p>لا توجد طلبات جديدة</p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
          {drivers.map((d) => (
            <div key={d.id} className="card" style={{ padding: 20 }}>
              {/* الاسم والنوع */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{
                  width: 56, height: 56, borderRadius: 14,
                  background: '#E3F2FD', color: '#1565C0',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 24,
                }}>👤</div>
                <div style={{ flex: 1 }}>
                  <h4 style={{ fontSize: 16, marginBottom: 4 }}>{d.full_name}</h4>
                  <span className="badge badge-info">{driverTypeAr(d.driver_type)}</span>
                </div>
              </div>

              {/* البيانات */}
              <div style={{ background: '#F8F9FA', borderRadius: 10, padding: 14, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #E0E0E0' }}>
                  <span style={{ color: '#666', fontSize: 12 }}>📱 الهاتف</span>
                  <strong style={{ fontSize: 13 }}>{d.phone}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #E0E0E0' }}>
                  <span style={{ color: '#666', fontSize: 12 }}>🆔 رقم الهوية</span>
                  <strong style={{ fontSize: 13, fontFamily: 'monospace' }}>{d.national_id || '—'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                  <span style={{ color: '#666', fontSize: 12 }}>📅 التسجيل</span>
                  <strong style={{ fontSize: 12 }}>{d.created_at?.substring(0, 10)}</strong>
                </div>
              </div>

              {/* القاطرات */}
              {d.vehicles && d.vehicles.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <p style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>🚛 القاطرات:</p>
                  {d.vehicles.map((v) => (
                    <div key={v.id} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 12px', background: '#E8F5E9',
                      borderRadius: 8, marginBottom: 6,
                    }}>
                      <strong style={{ fontSize: 14, fontFamily: 'monospace' }}>{v.plate_number}</strong>
                      <span style={{ fontSize: 11, color: '#666' }}>{v.vehicle_type} • {v.capacity_tons} طن</span>
                    </div>
                  ))}
                </div>
              )}

              {/* الأزرار */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-success"
                  onClick={() => approve(d.id)}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  ✅ اعتماد
                </button>
                <button
                  className="btn btn-danger"
                  onClick={() => setRejecting(d.id)}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  ❌ رفض
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal رفض */}
      {rejecting && (
        <div className="modal-overlay" onClick={() => setRejecting(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h3>سبب الرفض</h3>
              <button className="modal-close" onClick={() => setRejecting(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">السبب *</label>
                <textarea
                  className="form-textarea"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="مثال: معلومات غير صحيحة"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setRejecting(null)}>إلغاء</button>
              <button className="btn btn-danger" onClick={reject}>تأكيد الرفض</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
