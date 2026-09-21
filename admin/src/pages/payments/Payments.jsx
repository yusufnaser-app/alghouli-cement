import { useEffect, useState } from 'react';
import client, { handleError } from '../../api/client';

export default function Payments() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rejecting, setRejecting] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await client.get('/payments/pending');
      setPayments(res.data.data || []);
    } catch (_) {}
    setLoading(false);
  };

  const approve = async (id) => {
    if (!window.confirm('اعتماد هذه الدفعة؟')) return;
    try {
      await client.patch(`/payments/${id}/approve`);
      alert('✅ تم اعتماد الدفع');
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
      await client.patch(`/payments/${rejecting}/reject`, { reason: rejectReason });
      setRejecting(null);
      setRejectReason('');
      alert('تم رفض الدفع');
      load();
    } catch (err) {
      alert(handleError(err));
    }
  };

  const fmt = (n) => (parseFloat(n) || 0).toLocaleString('en-US');

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div>
      <div className="card mb-2">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3>💳 دفعات بانتظار المراجعة</h3>
            <p style={{ color: '#999', fontSize: 13, marginTop: 4 }}>
              عدد: {payments.length}
            </p>
          </div>
          <button className="btn btn-secondary" onClick={load}>🔄 تحديث</button>
        </div>
      </div>

      {payments.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">✅</div>
            <p>لا توجد دفعات معلقة</p>
          </div>
        </div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>المرجع</th>
                <th>الطلب</th>
                <th>العميل</th>
                <th>المبلغ</th>
                <th>رقم العملية</th>
                <th>التاريخ</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td><strong>{p.reference_code}</strong></td>
                  <td>{p.order_number}</td>
                  <td>
                    <div>{p.customer_name}</div>
                    <div style={{ fontSize: 11, color: '#999' }}>{p.customer_phone}</div>
                  </td>
                  <td>
                    <div><strong className="text-primary">{fmt(p.amount_transferred)} ر.ي</strong></div>
                    <div style={{ fontSize: 11, color: '#999' }}>مطلوب: {fmt(p.amount_due)}</div>
                  </td>
                  <td>
                    <code style={{ fontSize: 11, background: '#F0F0F0', padding: '2px 6px', borderRadius: 4 }}>
                      {p.transaction_ref || '—'}
                    </code>
                  </td>
                  <td>{p.transfer_date?.substring(0, 10)}</td>
                  <td>
                    <button
                      className="btn btn-success btn-sm"
                      onClick={() => approve(p.id)}
                      style={{ marginLeft: 4 }}
                    >
                      ✅ اعتماد
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => setRejecting(p.id)}
                    >
                      ❌ رفض
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rejecting && (
        <div className="modal-overlay" onClick={() => setRejecting(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h3>سبب رفض الدفع</h3>
              <button className="modal-close" onClick={() => setRejecting(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">السبب *</label>
                <textarea
                  className="form-textarea"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="مثال: المبلغ غير مطابق"
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
