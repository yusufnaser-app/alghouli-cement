import { useEffect, useState } from 'react';
import client, { handleError } from '../../../api/client';

export default function ActivityTab({ driverId }) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [driverId]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await client.get('/driver-file/' + driverId + '/activity');
      setActivities(res.data.data || []);
    } catch (err) {
      alert(handleError(err));
    } finally {
      setLoading(false);
    }
  };

  const fmt = (n) => (parseFloat(n) || 0).toLocaleString('en-US');

  const iconFor = (type, desc) => {
    if (type === 'fax') {
      if (desc?.includes('طلب')) return '📄';
      if (desc?.includes('اعتماد')) return '✅';
      if (desc?.includes('إصدار')) return '📃';
      if (desc?.includes('تحميل')) return '📦';
      if (desc?.includes('إلغاء')) return '❌';
      return '📄';
    }
    if (type === 'ledger') {
      if (desc?.includes('مستحق')) return '💰';
      if (desc?.includes('تحويل')) return '💳';
      if (desc?.includes('سلفة')) return '📉';
      if (desc?.includes('خصم')) return '💸';
      return '💰';
    }
    return '📌';
  };

  const colorFor = (type, desc) => {
    if (type === 'fax') {
      if (desc?.includes('طلب')) return '#FFA000';
      if (desc?.includes('اعتماد')) return '#17A2B8';
      if (desc?.includes('إصدار')) return '#2196F3';
      if (desc?.includes('تحميل')) return '#28A745';
      if (desc?.includes('إلغاء')) return '#9E9E9E';
      return '#6B7C8E';
    }
    if (type === 'ledger') {
      if (desc?.includes('مستحق')) return '#2E7D32';
      if (desc?.includes('تحويل')) return '#1565C0';
      if (desc?.includes('سلفة')) return '#F57F17';
      if (desc?.includes('خصم')) return '#C62828';
      return '#1A3A5C';
    }
    return '#666';
  };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
        <h3>🕒 سجل نشاط السائق</h3>
        <button className="btn btn-secondary btn-sm" onClick={load}>تحديث</button>
      </div>

      {activities.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🕒</div>
          <p>لا يوجد نشاط مسجل</p>
        </div>
      ) : (
        <div style={{ position: 'relative', paddingRight: 30 }}>
          {/* الخط العمودي */}
          <div style={{
            position: 'absolute',
            right: 12,
            top: 20,
            bottom: 20,
            width: 2,
            background: '#E5EAF0',
          }} />

          {activities.map((a, i) => {
            const icon = iconFor(a.type, a.description);
            const color = colorFor(a.type, a.description);

            return (
              <div key={a.type + '-' + a.ref_id + '-' + i} style={{
                display: 'flex',
                gap: 12,
                marginBottom: 20,
                position: 'relative',
              }}>
                {/* الدائرة */}
                <div style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: 'white',
                  border: '3px solid ' + color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                  zIndex: 1,
                  flexShrink: 0,
                }}>
                  {icon}
                </div>

                {/* المحتوى */}
                <div style={{ flex: 1, paddingTop: 4 }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                    gap: 8,
                  }}>
                    <div>
                      <div style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: color,
                        marginBottom: 2,
                      }}>
                        {a.description}
                      </div>
                      {a.fax_number && (
                        <code style={{
                          background: '#F0F0F0',
                          padding: '2px 6px',
                          borderRadius: 4,
                          fontSize: 11,
                          marginLeft: 4,
                        }}>
                          #{a.fax_number}
                        </code>
                      )}
                    </div>
                    <div style={{
                      fontSize: 11,
                      color: '#999',
                      direction: 'ltr',
                    }}>
                      {a.created_at?.substring(0, 16).replace('T', ' ')}
                    </div>
                  </div>

                  {a.amount && (
                    <div style={{
                      marginTop: 6,
                      fontSize: 13,
                      color: '#666',
                    }}>
                      المبلغ:{' '}
                      <strong style={{ color: color }}>
                        {fmt(a.amount)} ريال
                      </strong>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
