import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import client, { handleError } from '../../api/client';

export default function TraderDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    method: 'cash',
    reference: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, [id]);

  const load = async () => {
    setLoading(true);
    try {
      const [s, l] = await Promise.all([
        client.get(`/customers/${id}/summary`),
        client.get(`/customers/${id}/ledger?limit=100`),
      ]);
      setSummary(s.data.data);
      setLedger(l.data.data || []);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const savePayment = async () => {
    const amount = parseFloat(paymentForm.amount);
    if (!amount || amount <= 0) {
      alert('يرجى إدخال مبلغ صحيح');
      return;
    }
    setSaving(true);
    try {
      await client.post(`/customers/${id}/payments`, {
        amount,
        method: paymentForm.method,
        reference: paymentForm.reference,
        notes: paymentForm.notes,
      });
      alert('✅ تم تسجيل الدفعة');
      setShowPaymentModal(false);
      setPaymentForm({ amount: '', method: 'cash', reference: '', notes: '' });
      load();
    } catch (err) {
      alert(handleError(err));
    } finally {
      setSaving(false);
    }
  };

  const fmt = (n) => (parseFloat(n) || 0).toLocaleString('en-US');

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div>
      {/* رأس الصفحة */}
      <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
        <button className="btn btn-secondary btn-sm" onClick={() => navigate('/traders')}>
          → رجوع
        </button>
      </div>

      {/* البطاقات */}
      <div className="stat-grid mb-2">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#FFEBEE', color: '#C62828' }}>💰</div>
          <div className="stat-info">
            <h3>الرصيد الحالي</h3>
            <div className="value">{fmt(summary?.current_balance)}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#FFF3E0', color: '#EF6C00' }}>🎯</div>
          <div className="stat-info">
            <h3>الحد الائتماني</h3>
            <div className="value">{fmt(summary?.credit_limit)}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#E8F5E9', color: '#2E7D32' }}>📈</div>
          <div className="stat-info">
            <h3>إجمالي المشتريات</h3>
            <div className="value">{fmt(summary?.total_purchases)}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#E3F2FD', color: '#1565C0' }}>✅</div>
          <div className="stat-info">
            <h3>إجمالي المدفوعات</h3>
            <div className="value">{fmt(summary?.total_payments)}</div>
          </div>
        </div>
      </div>

      {/* زر تسجيل دفعة */}
      <div className="card mb-2" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3>💵 سجل الدفعات والعمليات</h3>
          <p style={{ color: '#999', fontSize: 13, marginTop: 4 }}>
            عدد العمليات: {ledger.length}
          </p>
        </div>
        <button className="btn btn-success" onClick={() => setShowPaymentModal(true)}>
          ➕ تسجيل دفعة
        </button>
      </div>

      {/* الجدول */}
      <div className="table-container">
        {ledger.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <p>لا توجد عمليات</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>النوع</th>
                <th>المرجع</th>
                <th>الوصف</th>
                <th>مدين</th>
                <th>دائن</th>
                <th>الرصيد</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((t) => (
                <tr key={t.id}>
                  <td>{t.created_at?.substring(0, 10)}</td>
                  <td>
                    <span className={`badge ${
                      t.transaction_type === 'purchase' ? 'badge-warning' :
                      t.transaction_type === 'payment' ? 'badge-approved' :
                      'badge-info'
                    }`}>
                      {{
                        purchase: 'طلب',
                        payment: 'دفعة',
                        cancellation: 'إلغاء',
                        adjustment: 'تسوية',
                      }[t.transaction_type] || t.transaction_type}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontSize: 11 }}>
                      {t.reference_code || t.order_number || '—'}
                    </span>
                  </td>
                  <td>{t.description || '—'}</td>
                  <td className="text-danger">
                    {parseFloat(t.debit) > 0 ? fmt(t.debit) : '—'}
                  </td>
                  <td className="text-success">
                    {parseFloat(t.credit) > 0 ? fmt(t.credit) : '—'}
                  </td>
                  <td><strong>{fmt(t.balance_after)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal تسجيل دفعة */}
      {showPaymentModal && (
        <div className="modal-overlay" onClick={() => setShowPaymentModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h3>تسجيل دفعة</h3>
              <button className="modal-close" onClick={() => setShowPaymentModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="alert alert-info" style={{ marginBottom: 16 }}>
                الرصيد الحالي: <strong>{fmt(summary?.current_balance)} ر.ي</strong>
              </div>

              <div className="form-group">
                <label className="form-label">المبلغ المدفوع *</label>
                <input
                  type="number"
                  className="form-input"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                  placeholder="1000000"
                />
              </div>

              <div className="form-group">
                <label className="form-label">طريقة الدفع</label>
                <select
                  className="form-select"
                  value={paymentForm.method}
                  onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })}
                >
                  <option value="cash">💵 نقدي</option>
                  <option value="bank_transfer">🏦 تحويل بنكي</option>
                  <option value="e_wallet">📱 محفظة إلكترونية</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">رقم المرجع (اختياري)</label>
                <input
                  className="form-input"
                  value={paymentForm.reference}
                  onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })}
                  placeholder="TXN-123456"
                />
              </div>

              <div className="form-group">
                <label className="form-label">ملاحظات (اختياري)</label>
                <textarea
                  className="form-textarea"
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                  placeholder="دفعة جزئية"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowPaymentModal(false)}>إلغاء</button>
              <button className="btn btn-success" onClick={savePayment} disabled={saving}>
                {saving ? 'جاري الحفظ...' : '💾 تسجيل الدفعة'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
