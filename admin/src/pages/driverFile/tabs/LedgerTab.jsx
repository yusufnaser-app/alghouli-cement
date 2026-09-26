import { useEffect, useState } from 'react';
import client, { handleError } from '../../../api/client';

export default function LedgerTab({ driverId, profile }) {
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState('all');

  useEffect(() => { load(); }, [driverId, range]);

  const load = async () => {
    setLoading(true);
    try {
      let url = '/driver-file/' + driverId + '/activity';
      const res = await client.get(url);
      // فلتر: نعرض فقط الحركات المالية
      const all = res.data.data || [];
      const ledgerOnly = all
        .filter(a => a.type === 'ledger')
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setLedger(ledgerOnly);
    } catch (err) {
      alert(handleError(err));
    } finally {
      setLoading(false);
    }
  };

  const fmt = (n) => (parseFloat(n) || 0).toLocaleString('en-US');

  const totalDues = parseFloat(profile.total_dues || 0);
  const totalPaid = parseFloat(profile.total_paid || 0);
  const totalAdvances = parseFloat(profile.total_advances || 0);
  const totalDeductions = parseFloat(profile.total_deductions || 0);
  const remaining = parseFloat(profile.current_balance || 0);

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div>
      {/* بطاقات الإحصائيات */}
      <div className="stat-grid mb-2">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#E8F5E9', color: '#2E7D32' }}>📈</div>
          <div className="stat-info">
            <h3>إجمالي أجور النقل</h3>
            <div className="value">{fmt(totalDues)}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#E3F2FD', color: '#1565C0' }}>✅</div>
          <div className="stat-info">
            <h3>المدفوع</h3>
            <div className="value">{fmt(totalPaid)}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#FFF9C4', color: '#F57F17' }}>📉</div>
          <div className="stat-info">
            <h3>السلف</h3>
            <div className="value">{fmt(totalAdvances)}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#FFEBEE', color: '#C62828' }}>💸</div>
          <div className="stat-info">
            <h3>الخصومات</h3>
            <div className="value">{fmt(totalDeductions)}</div>
          </div>
        </div>
        <div className="stat-card" style={{ background: '#E8F5E9', border: '2px solid #2E7D32' }}>
          <div className="stat-icon" style={{ background: '#2E7D32', color: 'white' }}>💰</div>
          <div className="stat-info">
            <h3 style={{ color: '#2E7D32' }}>الرصيد المتبقي</h3>
            <div className="value" style={{ color: '#2E7D32' }}>{fmt(remaining)}</div>
          </div>
        </div>
      </div>

      {/* جدول كشف الحساب */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3>💰 كشف حساب السائق</h3>
          <button className="btn btn-secondary btn-sm" onClick={load}>تحديث</button>
        </div>

        {ledger.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">💰</div>
            <p>لا توجد عمليات مالية</p>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>البيان</th>
                  <th>المرجع</th>
                  <th>مدين</th>
                  <th>دائن</th>
                  <th>الرصيد</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((t) => {
                  const isDebit = parseFloat(t.amount || 0) > 0 &&
                    (t.description?.includes('تقييد مستحق') ||
                     t.description?.includes('سلفة') ||
                     t.description?.includes('خصم'));
                  const isCredit = t.description?.includes('تحويل') ||
                    t.description?.includes('دفعة');
                  const amount = Math.abs(parseFloat(t.amount || 0));

                  return (
                    <tr key={t.ref_id}>
                      <td style={{ fontSize: 12 }}>
                        {t.created_at?.substring(0, 10)}
                      </td>
                      <td style={{ fontSize: 13 }}>{t.description || '—'}</td>
                      <td style={{ fontSize: 11 }}>
                        {t.fax_number ? (
                          <code style={{ background: '#E3F2FD', padding: '2px 6px', borderRadius: 4 }}>
                            {t.fax_number}
                          </code>
                        ) : '—'}
                      </td>
                      <td className="text-danger">
                        {isDebit ? fmt(amount) : '—'}
                      </td>
                      <td className="text-success">
                        {isCredit ? fmt(amount) : '—'}
                      </td>
                      <td><strong>{fmt(amount)}</strong></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
