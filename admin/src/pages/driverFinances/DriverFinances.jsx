import { useEffect, useState } from 'react';
import client, { handleError } from '../../api/client';

export default function DriverFinances() {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [statement, setStatement] = useState(null);
  const [action, setAction] = useState(null);
  const [form, setForm] = useState({ amount: '', reference: '', description: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await client.get('/drivers-admin');
      setDrivers(res.data.data || []);
    } catch (err) {
      alert(handleError(err));
    } finally {
      setLoading(false);
    }
  };

  const openStatement = async (d) => {
    setSelected(d);
    setStatement(null);
    try {
      const res = await client.get('/drivers-admin/' + d.id + '/statement');
      setStatement(res.data.data);
    } catch (err) {
      alert(handleError(err));
    }
  };

  const submitAction = async () => {
    if (!form.amount || parseFloat(form.amount) <= 0) {
      alert('المبلغ مطلوب');
      return;
    }
    setSaving(true);
    try {
      let url = '/drivers-admin/' + selected.id;
      if (action === 'pay') url += '/payments';
      else if (action === 'advance') url += '/advances';
      else if (action === 'deduct') url += '/deductions';

      await client.post(url, {
        amount: parseFloat(form.amount),
        reference: form.reference,
        description: form.description,
      });

      alert('تم بنجاح');
      setAction(null);
      setForm({ amount: '', reference: '', description: '' });
      openStatement(selected);
      load();
    } catch (err) {
      alert(handleError(err));
    } finally {
      setSaving(false);
    }
  };

  const fmt = (n) => (parseFloat(n) || 0).toLocaleString('en-US');

  const filtered = drivers.filter((d) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (d.full_name || '').toLowerCase().includes(q) || (d.phone || '').includes(q);
  });

  const totalDebts = drivers.reduce((s, d) => s + parseFloat(d.current_balance || 0), 0);

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div>
      <div className="stat-grid mb-2">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#E3F2FD', color: '#1565C0' }}>🧑‍✈️</div>
          <div className="stat-info">
            <h3>عدد السائقين</h3>
            <div className="value">{drivers.length}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#FFEBEE', color: '#C62828' }}>💰</div>
          <div className="stat-info">
            <h3>إجمالي المستحقات</h3>
            <div className="value">{fmt(totalDebts)}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#E8F5E9', color: '#2E7D32' }}>✅</div>
          <div className="stat-info">
            <h3>سائقون نشطون</h3>
            <div className="value">{drivers.filter(d => d.approval_status === 'active').length}</div>
          </div>
        </div>
      </div>

      <div className="card mb-2">
        <div style={{ display: 'flex', gap: 12 }}>
          <input
            className="form-input"
            placeholder="ابحث بالاسم أو الهاتف..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1 }}
          />
          <button className="btn btn-secondary" onClick={load}>تحديث</button>
        </div>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>السائق</th>
              <th>القاطرة</th>
              <th>الرحلات</th>
              <th>إجمالي المستحقات</th>
              <th>المدفوع</th>
              <th>الرصيد</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d) => {
              const balance = parseFloat(d.current_balance || 0);
              return (
                <tr key={d.id}>
                  <td>
                    <div><strong>{d.full_name}</strong></div>
                    <div style={{ fontSize: 11, color: '#999' }}>{d.phone}</div>
                  </td>
                  <td>{d.plate_number || '—'}</td>
                  <td>{d.trips_count}</td>
                  <td>{fmt(d.total_dues)}</td>
                  <td>{fmt(d.total_paid)}</td>
                  <td>
                    <strong style={{ color: balance > 0 ? '#C62828' : '#2E7D32', fontSize: 14 }}>
                      {fmt(balance)}
                    </strong>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-primary btn-sm" onClick={() => openStatement(d)}>
                        كشف
                      </button>
                      <button className="btn btn-success btn-sm" onClick={() => { setSelected(d); setAction('pay'); }}>
                        دفع
                      </button>
                      <button className="btn btn-warning btn-sm" onClick={() => { setSelected(d); setAction('advance'); }}>
                        سلفة
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => { setSelected(d); setAction('deduct'); }}>
                        خصم
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {statement && selected && (
        <div className="modal-overlay" onClick={() => { setSelected(null); setStatement(null); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 900 }}>
            <div className="modal-header">
              <h3>كشف حساب: {selected.full_name}</h3>
              <button className="modal-close" onClick={() => { setSelected(null); setStatement(null); }}>×</button>
            </div>
            <div className="modal-body">
              <div className="stat-grid mb-2">
                <div className="stat-card">
                  <div className="stat-icon" style={{ background: '#E8F5E9', color: '#2E7D32' }}>💰</div>
                  <div className="stat-info">
                    <h3>المستحقات</h3>
                    <div className="value">{fmt(statement.summary.total_dues)}</div>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon" style={{ background: '#E3F2FD', color: '#1565C0' }}>✅</div>
                  <div className="stat-info">
                    <h3>المدفوع</h3>
                    <div className="value">{fmt(statement.summary.total_paid)}</div>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon" style={{ background: '#FFF9C4', color: '#F57F17' }}>📉</div>
                  <div className="stat-info">
                    <h3>السلف</h3>
                    <div className="value">{fmt(statement.summary.total_advances)}</div>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon" style={{ background: '#FFEBEE', color: '#C62828' }}>💸</div>
                  <div className="stat-info">
                    <h3>الرصيد الحالي</h3>
                    <div className="value">{fmt(statement.summary.current_balance)}</div>
                  </div>
                </div>
              </div>

              <h4 style={{ marginTop: 16, marginBottom: 12 }}>سجل العمليات</h4>
              {statement.ledger.length === 0 ? (
                <div className="empty-state"><p>لا توجد عمليات</p></div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>التاريخ</th>
                      <th>النوع</th>
                      <th>الوصف</th>
                      <th>مدين</th>
                      <th>دائن</th>
                      <th>الرصيد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statement.ledger.map((t) => (
                      <tr key={t.id}>
                        <td>{t.created_at?.substring(0, 10)}</td>
                        <td>
                          <span className={'badge ' + (
                            t.transaction_type === 'transport_due' ? 'badge-approved' :
                            t.transaction_type === 'payment' ? 'badge-info' :
                            t.transaction_type === 'advance' ? 'badge-pending' :
                            'badge-rejected'
                          )}>
                            {{
                              transport_due: 'مستحق',
                              payment: 'دفعة',
                              advance: 'سلفة',
                              deduction: 'خصم',
                            }[t.transaction_type] || t.transaction_type}
                          </span>
                        </td>
                        <td style={{ fontSize: 12 }}>{t.description || '—'}</td>
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
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => { setSelected(null); setStatement(null); }}>إغلاق</button>
              <button className="btn btn-success" onClick={() => setAction('pay')}>دفع</button>
              <button className="btn btn-warning" onClick={() => setAction('advance')}>سلفة</button>
              <button className="btn btn-danger" onClick={() => setAction('deduct')}>خصم</button>
            </div>
          </div>
        </div>
      )}

      {action && selected && (
        <div className="modal-overlay" onClick={() => setAction(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h3>
                {action === 'pay' ? 'تسجيل دفعة' :
                 action === 'advance' ? 'تسجيل سلفة' : 'تسجيل خصم'}
              </h3>
              <button className="modal-close" onClick={() => setAction(null)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: 16, padding: 12, background: '#F8F9FA', borderRadius: 8 }}>
                <div style={{ fontSize: 13 }}>
                  <strong>السائق:</strong> {selected.full_name}
                </div>
                <div style={{ fontSize: 13 }}>
                  <strong>الرصيد الحالي:</strong> {fmt(selected.current_balance)} ريال
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
                />
              </div>

              <div className="form-group">
                <label className="form-label">رقم المرجع</label>
                <input
                  className="form-input"
                  value={form.reference}
                  onChange={(e) => setForm({ ...form, reference: e.target.value })}
                  placeholder="TXN-123"
                />
              </div>

              <div className="form-group">
                <label className="form-label">ملاحظات</label>
                <textarea
                  className="form-textarea"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setAction(null)}>إلغاء</button>
              <button className="btn btn-primary" onClick={submitAction} disabled={saving}>
                {saving ? '...' : 'حفظ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
