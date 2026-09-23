import { useEffect, useState } from 'react';
import client, { handleError } from '../../api/client';

export default function PendingCredit() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [details, setDetails] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await client.get('/orders/admin/pending-credit');
      setOrders(res.data.data || []);
    } catch (_) {}
    setLoading(false);
  };

  const openDetails = async (order) => {
    setSelected(order);
    setDetails(null);
    try {
      const res = await client.get(`/orders/${order.id}`);
      setDetails(res.data.data);
    } catch (err) {
      alert(handleError(err));
    }
  };

  const approve = async (id) => {
    if (!window.confirm('الموافقة على هذا الطلب؟')) return;
    setProcessing(true);
    try {
      await client.patch(`/orders/admin/${id}/approve-credit`);
      alert('✅ تمت الموافقة');
      setSelected(null);
      load();
    } catch (err) {
      alert(handleError(err));
    } finally {
      setProcessing(false);
    }
  };

  const reject = async () => {
    if (!rejectReason.trim()) { alert('سبب الرفض مطلوب'); return; }
    setProcessing(true);
    try {
      await client.patch(`/orders/admin/${rejecting}/reject-credit`, { reason: rejectReason });
      alert('تم الرفض');
      setRejecting(null);
      setRejectReason('');
      setSelected(null);
      load();
    } catch (err) {
      alert(handleError(err));
    } finally {
      setProcessing(false);
    }
  };

  const fmt = (n) => (parseFloat(n) || 0).toLocaleString('en-US');

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div>
      <div className="card mb-2">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3>⏳ طلبات آجلة بانتظار الموافقة</h3>
            <p style={{ color: '#999', fontSize: 13, marginTop: 4 }}>عدد: {orders.length}</p>
          </div>
          <button className="btn btn-secondary" onClick={load}>🔄 تحديث</button>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">✅</div>
            <p>لا توجد طلبات</p>
          </div>
        </div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>رقم الطلب</th>
                <th>العميل</th>
                <th>التاريخ</th>
                <th>الإجمالي</th>
                <th>رصيد العميل</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const balance = parseFloat(o.current_balance || 0);
                const total = parseFloat(o.total_amount || 0);
                const after = balance + total;
                return (
                  <tr key={o.id}>
                    <td><strong>{o.order_number}</strong></td>
                    <td>
                      <div>{o.customer_name}</div>
                      <div style={{ fontSize: 11, color: '#999' }}>{o.customer_phone}</div>
                    </td>
                    <td>{o.created_at?.substring(0, 10)}</td>
                    <td><strong className="text-primary">{fmt(o.total_amount)}</strong></td>
                    <td>{fmt(after)}</td>
                    <td>
                      <button className="btn btn-primary btn-sm" onClick={() => openDetails(o)}>👁 مراجعة</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="modal-overlay" onClick={() => { setSelected(null); setDetails(null); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 800 }}>
            <div className="modal-header">
              <h3>مراجعة {selected.order_number}</h3>
              <button className="modal-close" onClick={() => { setSelected(null); setDetails(null); }}>×</button>
            </div>
            <div className="modal-body">
              {!details ? (
                <div className="loading"><div className="spinner"></div></div>
              ) : (
                <>
                  <div className="card mb-2">
                    <h4>العميل</h4>
                    <p><strong>الاسم:</strong> {details.customer_name}</p>
                    <p><strong>الهاتف:</strong> {details.customer_phone}</p>
                    <p><strong>الرصيد الحالي:</strong> {fmt(details.current_balance)} ر.ي</p>
                    <p><strong>الحد الائتماني:</strong> {fmt(details.credit_limit)} ر.ي</p>
                  </div>
                  <div className="card mb-2">
                    <h4>المنتجات</h4>
                    <table>
                      <thead><tr><th>المنتج</th><th>الكمية</th><th>الإجمالي</th></tr></thead>
                      <tbody>
                        {(details.items || []).map((it, i) => (
                          <tr key={i}>
                            <td>{it.product_name}</td>
                            <td>{it.quantity} {it.unit === 'ton' ? 'طن' : 'كيس'}</td>
                            <td>{fmt(it.line_total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="card">
                    <p><strong>الإجمالي:</strong> <span className="text-primary">{fmt(details.total_amount)} ر.ي</span></p>
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => { setSelected(null); setDetails(null); }}>إغلاق</button>
              <button className="btn btn-danger" onClick={() => setRejecting(selected.id)}>❌ رفض</button>
              <button className="btn btn-success" onClick={() => approve(selected.id)} disabled={processing}>
                {processing ? '...' : '✅ موافقة'}
              </button>
            </div>
          </div>
        </div>
      )}

      {rejecting && (
        <div className="modal-overlay" onClick={() => setRejecting(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h3>سبب الرفض</h3>
              <button className="modal-close" onClick={() => setRejecting(null)}>×</button>
            </div>
            <div className="modal-body">
              <textarea className="form-textarea" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="السبب..." />
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setRejecting(null)}>إلغاء</button>
              <button className="btn btn-danger" onClick={reject}>تأكيد</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
