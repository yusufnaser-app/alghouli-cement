import { useState } from 'react';
import client, { handleError } from '../../api/client';

// عرض فقط: كل الأرقام تأتي جاهزة من Backend كنصوص عشرية ولا تُحسب هنا.
const fmt = (s) => { const [i, f] = String(s ?? '0.00').split('.'); return `${i.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${f || '00'}`; };
const SEV = { high: '#c62828', medium: '#ef6c00', low: '#555' };

export default function AccountingAudit() {
  const [tab, setTab] = useState('statement');
  const [customerId, setCustomerId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [statement, setStatement] = useState(null);
  const [rebuild, setRebuild] = useState(null);
  const [integrity, setIntegrity] = useState(null);
  const [audit, setAudit] = useState(null);
  const [auditAction, setAuditAction] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (fn) => { setBusy(true); setError(''); try { await fn(); } catch (e) { setError(handleError(e)); } finally { setBusy(false); } };
  const qs = () => { const p = new URLSearchParams(); if (from) p.set('from', from); if (to) p.set('to', to); return p.toString(); };

  const loadStatement = () => run(async () => {
    const r = await client.get(`/accounting/customer/${customerId.trim()}/statement?${qs()}`);
    setStatement(r.data.data);
    const b = await client.get(`/accounting/customer/${customerId.trim()}/rebuild`).catch(() => null);
    setRebuild(b ? b.data.data : null);
  });
  const printStatement = async () => run(async () => {
    const r = await client.get(`/accounting/customer/${customerId.trim()}/statement/print?${qs()}`, { responseType: 'text' });
    const w = window.open('', '_blank'); w.document.write(r.data); w.document.close(); setTimeout(() => w.print(), 400);
  });
  const runIntegrity = () => run(async () => { const r = await client.get('/accounting/integrity-check'); setIntegrity(r.data.data); });
  const loadAudit = () => run(async () => { const r = await client.get(`/accounting/audit-log?limit=200${auditAction ? `&action=${auditAction}` : ''}`); setAudit(r.data.data); });

  return (
    <div>
      <div className="card mb-2" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[['statement', '🧾 كشف حساب عميل'], ['integrity', '🛡️ فحص سلامة الحسابات'], ['audit', '📜 سجل التدقيق']].map(([k, l]) => (
          <button key={k} className={`btn ${tab === k ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {error && <div className="alert alert-error">{error}</div>}

      {tab === 'statement' && (
        <div className="card">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <input className="form-control" style={{ minWidth: 300 }} placeholder="معرّف العميل (UUID)" value={customerId} onChange={(e) => setCustomerId(e.target.value)} />
            <input type="date" className="form-control" value={from} onChange={(e) => setFrom(e.target.value)} />
            <input type="date" className="form-control" value={to} onChange={(e) => setTo(e.target.value)} />
            <button className="btn btn-primary" disabled={busy || !customerId} onClick={loadStatement}>عرض</button>
            <button className="btn btn-secondary" disabled={busy || !statement} onClick={printStatement}>🖨️ طباعة / PDF</button>
          </div>
          {statement && (
            <>
              <h3>{statement.customer.full_name} — {statement.customer.account_ref}</h3>
              {statement.no_movements && <p>لا توجد حركات.</p>}
              {statement.sections.map((s) => (
                <div key={s.currency} className="card mt-2">
                  <h4>العملة: {s.currency}</h4>
                  <div className="table-container"><table>
                    <thead><tr><th>التاريخ</th><th>البيان</th><th>المرجع</th><th>مدين</th><th>دائن</th><th>الرصيد</th></tr></thead>
                    <tbody>
                      <tr style={{ fontWeight: 'bold' }}><td /><td>الرصيد الافتتاحي</td><td /><td /><td /><td>{fmt(s.opening_balance)}</td></tr>
                      {s.rows.map((r) => (
                        <tr key={r.id} style={r.is_reversal ? { color: '#c62828' } : undefined}>
                          <td>{String(r.date).slice(0, 10)}</td><td>{r.description}{r.reason ? ` — ${r.reason}` : ''}</td><td>{r.reference || r.order_number || '—'}</td>
                          <td>{r.debit === '0.00' ? '' : fmt(r.debit)}</td><td>{r.credit === '0.00' ? '' : fmt(r.credit)}</td><td>{fmt(r.balance)}</td>
                        </tr>
                      ))}
                      <tr style={{ fontWeight: 'bold' }}><td colSpan="3">الإجمالي</td><td>{fmt(s.total_debit)}</td><td>{fmt(s.total_credit)}</td><td /></tr>
                      <tr style={{ fontWeight: 'bold', background: '#f6f6f6' }}><td colSpan="5">الرصيد الختامي ({s.closing_side})</td><td>{fmt(s.closing_balance)} {s.currency}</td></tr>
                    </tbody>
                  </table></div>
                </div>
              ))}
              {rebuild && rebuild.accounts.some((a) => !a.matches) && (
                <div className="alert alert-error mt-2">
                  <strong>فرق بين الرصيد المخزّن والدفتر:</strong>
                  {rebuild.accounts.filter((a) => !a.matches).map((a) => (
                    <div key={a.currency}>{a.currency}: المخزّن {fmt(a.stored_balance)} — المحسوب {fmt(a.calculated_balance)} — الفرق {fmt(a.difference)} — {a.probable_cause}</div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'integrity' && (
        <div className="card">
          <button className="btn btn-primary" disabled={busy} onClick={runIntegrity}>{busy ? 'جاري الفحص...' : 'تشغيل الفحص'}</button>
          {integrity && (
            <div className="mt-2">
              <p>{integrity.ok ? '✅ لا توجد مشاكل' : `⚠️ عدد الملاحظات: ${integrity.summary.total}`} — قيود: {integrity.counts.ledger_entries} — طلبات: {integrity.counts.orders} — دفعات: {integrity.counts.payments}</p>
              {Object.entries(integrity.summary.by_code).map(([k, n]) => <span key={k} className="badge" style={{ marginInlineEnd: 6 }}>{k}: {n}</span>)}
              <div className="table-container mt-2"><table>
                <thead><tr><th>الخطورة</th><th>الرمز</th><th>الوصف</th><th>التفاصيل</th></tr></thead>
                <tbody>{integrity.findings.map((f, i) => (
                  <tr key={i}><td style={{ color: SEV[f.severity], fontWeight: 'bold' }}>{f.severity}</td><td>{f.code}</td><td>{f.message}</td>
                    <td style={{ fontSize: 12, direction: 'ltr', textAlign: 'left' }}>{JSON.stringify(Object.fromEntries(Object.entries(f).filter(([k]) => !['code', 'severity', 'message'].includes(k))))}</td></tr>
                ))}</tbody>
              </table></div>
            </div>
          )}
        </div>
      )}

      {tab === 'audit' && (
        <div className="card">
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input className="form-control" placeholder="نوع العملية (مثال: PAYMENT_APPROVED)" value={auditAction} onChange={(e) => setAuditAction(e.target.value)} />
            <button className="btn btn-primary" disabled={busy} onClick={loadAudit}>عرض</button>
          </div>
          {audit && <div className="table-container"><table>
            <thead><tr><th>التاريخ</th><th>المستخدم</th><th>العملية</th><th>الكيان</th><th>السبب</th><th>قبل</th><th>بعد</th></tr></thead>
            <tbody>{audit.map((a) => (
              <tr key={a.id}><td>{String(a.created_at).replace('T', ' ').slice(0, 19)}</td><td>{a.user_name || '—'}</td><td>{a.action}</td>
                <td>{a.entity_type} {a.entity_ref || ''}</td><td>{a.reason || ''}</td>
                <td style={{ fontSize: 11, direction: 'ltr' }}>{a.old_values ? JSON.stringify(a.old_values).slice(0, 120) : ''}</td>
                <td style={{ fontSize: 11, direction: 'ltr' }}>{a.new_values ? JSON.stringify(a.new_values).slice(0, 120) : ''}</td></tr>
            ))}</tbody>
          </table></div>}
        </div>
      )}
    </div>
  );
}
