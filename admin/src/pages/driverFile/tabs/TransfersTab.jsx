import { useEffect, useState } from 'react';
import client, { handleError } from '../../../api/client';

export default function TransfersTab({ driverId, profile, onReload }) {
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    amount: '',
    method: 'cash',
    reference: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, [driverId]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await client.get('/driver-file/' + driverId + '/transfers');
      setTransfers(res.data.data || []);
    } catch (err) {
      alert(handleError(err));
    } finally {
      setLoading(false);
    }
  };

  const submit = async () => {
    if (!form.amount || parseFloat(form.amount) <= 0) {
      alert('المبلغ مطلوب');
      return;
    }
    if (parseFloat(form.amount) > parseFloat(profile.current_balance || 0)) {
      alert('المبلغ أكبر من الرصيد المتاح');
      return;
    }

    setSaving(true);
    try {
      await client.post('/driver-file/' + driverId + '/transfers', {
        amount: parseFloat(form.amount),
        method: form.method,
        reference: form.reference,
        notes: form.notes,
      });
      alert('تم تسجيل التحويل');
      setShowAdd(false);
      setForm({ amount: '', method: 'cash', reference: '', notes: '' });
      load();
      onReload();
    } catch (err) {
      alert(handleError(err));
    } finally {
      setSaving(false);
    }
  };

  const fmt = (n) => (parseFloat(n) || 0).toLocaleString('en-US');

  const methodAr = (m) => ({
    'cash': 'نقدي',
    'bank_transfer': 'تحويل بنكي',
    'wallet': 'محفظة إلكترونية',
    'exchange': 'شركة صرافة',
  }[m] || m);

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  const totalTransferred = transfers.reduce(
    (s, t) => s + parseFloat(t.amount || 0), 0
  );

  return (
    <div>
      {/* إحصائيات */}
      <div className="stat-grid mb-2">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#E3F2FD', color: '#1565C0' }}>💳</div>
          <div className="stat-info">
            <h3>عدد التحويلات</h3>
            <div className="value">{transfers.length}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#E8F5E9', color: '#2E7D32' }}>✅</div>
          <div className="stat-info">
            <h3>إجمالي المحوّل</h3>
            <div className="value">{fmt(totalTransferred)}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#FFEBEE', color: '#C62828' }}>💰</div>
          <div className="stat-info">
            <h3>الرصيد الحالي</h3>
            <div className="value">{fmt(profile.current_balance)}</div>
          </div>
        </div>
      </div>

      <div className="card mb-2" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>💳 تحويلات السائق</h3>
        <button
          className="btn btn-success btn-sm"
          onClick={() => setShowAdd(true)}
          disabled={parseFloat(profile.current_balance || 0) <= 0}
        >
          + تسجيل تحويل
        </button>
      </div>

      {transfers.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">💳</div>
            <p>لا توجد تحويلات سابقة</p>
          </div>
        </div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>المبلغ</th>
                <th>البيان</th>
                <th>المرجع</th>
                <th>الرصيد بعد</th>
                <th>بواسطة</th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((t) => (
                <tr key={t.id}>
                  <td style={{ fontSize: 12 }}>{t.created_at?.substring(0, 10)}</td>
                  <td>
                    <strong style={{ color: '#1565C0', fontSize: 15 }}>
                      {fmt(t.amount)}
                    </strong>
                  </td>
                  <td style={{ fontSize: 12 }}>{t.description || '—'}</td>
                  <td>
                    {t.reference_code ? (
                      <code style={{ background: '#F0F0F0', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>
                        {t.reference_code}
                      </code>
                    ) : '—'}
                  </td>
                  <td><strong>{fmt(t.balance_after)}</strong></td>
                  <td style={{ fontSize: 11, color: '#666' }}>
                    {t.created_by_name || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h3>تسجيل تحويل جديد</h3>
              <button className="modal-close" onClick={() => setShowAdd(false)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: 16, padding: 12, background: '#E3F2FD', borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: '#666' }}>الرصيد المتاح</div>
                <div style={{ fontSize: 22, fontWeight: 'bold', color: '#1565C0' }}>
                  {fmt(profile.current_balance)} ريال
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">المبلغ *</label>
                <input
                  type="number"
                  className="form-input"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="100000"
                  max={profile.current_balance}
                />
              </div>

              <div className="form-group">
                <label className="form-label">طريقة التحويل</label>
                <select
                  className="form-select"
                  value={form.method}
                  onChange={(e) => setForm({ ...form, method: e.target.value })}
                >
                  <option value="cash">💵 نقدي</option>
                  <option value="bank_transfer">🏦 تحويل بنكي</option>
                  <option value="wallet">📱 محفظة إلكترونية</option>
                  <option value="exchange">💱 شركة صرافة</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">رقم العملية / المرجع</label>
                <input
                  className="form-input"
                  value={form.reference}
                  onChange={(e) => setForm({ ...form, reference: e.target.value })}
                  placeholder="TXN-123456"
                />
              </div>

              <div className="form-group">
                <label className="form-label">ملاحظات</label>
                <textarea
                  className="form-textarea"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAdd(false)}>إلغاء</button>
              <button className="btn btn-success" onClick={submit} disabled={saving}>
                {saving ? '...' : 'تسجيل التحويل'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
