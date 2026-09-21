import { useEffect, useState } from 'react';
import client, { handleError } from '../../api/client';

const statusAr = {
  PENDING_PAYMENT: 'بانتظار الدفع',
  RECEIPT_UPLOADED: 'تم رفع الإيصال',
  PENDING_PAYMENT_REVIEW: 'بانتظار مراجعة الدفع',
  PAYMENT_APPROVED: 'تم اعتماد الدفع',
  PREPARING: 'قيد التجهيز',
  DRIVER_ASSIGNED: 'تم تعيين السائق',
  LOADED: 'تم التحميل',
  IN_TRANSIT: 'في الطريق',
  DELIVERED: 'تم التسليم',
  COMPLETED: 'مكتمل',
  CANCELLED: 'ملغي',
  PAYMENT_REJECTED: 'الدفع مرفوض',
};

const statusColor = (s) => {
  if (['PENDING_PAYMENT', 'PENDING_PAYMENT_REVIEW', 'RECEIPT_UPLOADED'].includes(s)) return 'badge-pending';
  if (['PAYMENT_APPROVED', 'PREPARING', 'DRIVER_ASSIGNED', 'LOADED'].includes(s)) return 'badge-approved';
  if (s === 'IN_TRANSIT') return 'badge-transit';
  if (['DELIVERED', 'COMPLETED'].includes(s)) return 'badge-completed';
  if (s === 'CANCELLED') return 'badge-cancelled';
  if (s === 'PAYMENT_REJECTED') return 'badge-rejected';
  return 'badge-info';
};

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState(null);
  const [details, setDetails] = useState(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await client.get('/admin/orders');
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

  const fmt = (n) => (parseFloat(n) || 0).toLocaleString('en-US');

  const filtered = filter
    ? orders.filter((o) => o.status === filter)
    : orders;

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div>
      <div className="card mb-2">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            className="form-select"
            style={{ maxWidth: 240 }}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="">كل الحالات</option>
            {Object.entries(statusAr).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <div style={{ flex: 1 }}></div>
          <button className="btn btn-secondary" onClick={load}>🔄 تحديث</button>
        </div>
      </div>

      <div className="table-container">
        <div className="table-header">
          <h3>الطلبات ({filtered.length})</h3>
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📦</div>
            <p>لا توجد طلبات</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>رقم الطلب</th>
                <th>العميل</th>
                <th>التاريخ</th>
                <th>الإجمالي</th>
                <th>الحالة</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <tr key={o.id}>
                  <td><strong>{o.order_number}</strong></td>
                  <td>
                    <div>{o.customer_name}</div>
                    <div style={{ fontSize: 11, color: '#999' }}>{o.customer_phone}</div>
                  </td>
                  <td>{o.created_at?.substring(0, 10)}</td>
                  <td><strong className="text-primary">{fmt(o.total_amount)} ر.ي</strong></td>
                  <td>
                    <span className={`badge ${statusColor(o.status)}`}>
                      {statusAr[o.status] || o.status}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn-secondary btn-sm" onClick={() => openDetails(o)}>
                      👁 عرض
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected && (
        <div className="modal-overlay" onClick={() => { setSelected(null); setDetails(null); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 800 }}>
            <div className="modal-header">
              <h3>الطلب {selected.order_number}</h3>
              <button className="modal-close" onClick={() => { setSelected(null); setDetails(null); }}>×</button>
            </div>
            <div className="modal-body">
              {!details ? (
                <div className="loading"><div className="spinner"></div></div>
              ) : (
                <>
                  <div className="grid-2 mb-2">
                    <div className="card">
                      <h4 style={{ marginBottom: 12 }}>بيانات العميل</h4>
                      <p><strong>الاسم:</strong> {details.customer_name}</p>
                      <p><strong>الهاتف:</strong> {details.customer_phone}</p>
                      <p><strong>النوع:</strong> {details.customer_type}</p>
                    </div>
                    <div className="card">
                      <h4 style={{ marginBottom: 12 }}>التسليم</h4>
                      <p><strong>المحافظة:</strong> {details.governorate}</p>
                      <p><strong>المنطقة:</strong> {details.area}</p>
                      <p><strong>العنوان:</strong> {details.address_text}</p>
                    </div>
                  </div>

                  <div className="card mb-2">
                    <h4 style={{ marginBottom: 12 }}>المنتجات</h4>
                    <table>
                      <thead>
                        <tr>
                          <th>المنتج</th>
                          <th>الكمية</th>
                          <th>السعر</th>
                          <th>الإجمالي</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(details.items || []).map((it, i) => (
                          <tr key={i}>
                            <td>{it.product_name}</td>
                            <td>{it.quantity} {it.unit === 'ton' ? 'طن' : 'كيس'}</td>
                            <td>{fmt(it.unit_price)}</td>
                            <td>{fmt(it.line_total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="card">
                    <h4 style={{ marginBottom: 12 }}>الملخص</h4>
                    <p><strong>الإجمالي الفرعي:</strong> {fmt(details.subtotal)} ر.ي</p>
                    <p><strong>الخصم:</strong> {fmt(details.discount_amount)} ر.ي</p>
                    <p><strong>النقل:</strong> {fmt(details.shipping_amount)} ر.ي</p>
                    <p style={{ fontSize: 20 }}><strong>الإجمالي:</strong> <span className="text-primary">{fmt(details.total_amount)} ر.ي</span></p>
                    <p><strong>المدفوع:</strong> {fmt(details.paid_amount)} ر.ي</p>
                    <p><strong>المتبقي:</strong> <span className="text-danger">{fmt(details.remaining_amount)} ر.ي</span></p>
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => { setSelected(null); setDetails(null); }}>إغلاق</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
