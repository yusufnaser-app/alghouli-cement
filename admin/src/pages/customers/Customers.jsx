import { useEffect, useState } from 'react';
import client, { handleError } from '../../api/client';

const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
const fmtMoney = (n) => (parseFloat(n) || 0).toLocaleString('en-US');
const PERIOD = { daily: 'يومي', monthly: 'شهري' };
const ACTION = { reject: 'منع الطلب', request_approval: 'طلب موافقة استثنائية' };

/** نافذة الائتمان والسقوف لعميل واحد (تُفتح من أمام اسمه في الجدول). */
function LimitsModal({ customer, onClose, onChanged }) {
  const [rules, setRules] = useState([]);
  const [credit, setCredit] = useState(String(customer.credit_limit ?? '0'));
  const [action, setAction] = useState(customer.ceiling_action || 'reject');
  const [reason, setReason] = useState('');
  const [form, setForm] = useState({ nameAr: '', period: 'daily', maxBags: '', maxAmount: '', maxOrders: '', maxVehicles: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const loadRules = async () => {
    const r = await client.get('/ceilings/rules');
    setRules((r.data.data || []).filter((x) => x.customer_id === customer.id));
  };
  useEffect(() => { loadRules().catch((e) => setErr(handleError(e))); }, [customer.id]);

  const run = async (fn, ok) => {
    setBusy(true); setErr(''); setMsg('');
    try { await fn(); setMsg(ok); onChanged(); }
    catch (e) { setErr(handleError(e)); }
    finally { setBusy(false); }
  };

  const saveCredit = () => run(async () => {
    const v = Number(credit);
    if (!Number.isFinite(v) || v < 0) throw new Error('حد الائتمان يجب أن يكون رقمًا صفرًا أو أكبر');
    if (reason.trim().length < 3) throw new Error('اكتب سببًا للتغيير (3 أحرف على الأقل)');
    await client.patch(`/admin/customers/${customer.id}/credit`, { creditLimit: v, reason: reason.trim() });
  }, 'تم حفظ حد الائتمان');

  const saveAction = () => run(async () => {
    await client.patch(`/ceilings/customers/${customer.id}/action`, { action, reason: reason.trim() || undefined });
  }, 'تم حفظ إجراء تجاوز السقف');

  const addRule = () => run(async () => {
    const body = {
      nameAr: form.nameAr.trim(), period: form.period, customerId: customer.id,
      maxBags: num(form.maxBags), maxAmount: num(form.maxAmount),
      maxOrders: num(form.maxOrders), maxVehicles: num(form.maxVehicles),
    };
    if (body.nameAr.length < 2) throw new Error('اسم السقف مطلوب');
    if ([body.maxBags, body.maxAmount, body.maxOrders, body.maxVehicles].every((x) => x === null)) {
      throw new Error('حدد حدًا واحدًا على الأقل: كيس أو قيمة أو عدد طلبات أو قاطرات');
    }
    await client.post('/ceilings/rules', body);
    setForm({ nameAr: '', period: 'daily', maxBags: '', maxAmount: '', maxOrders: '', maxVehicles: '' });
    await loadRules();
  }, 'تمت إضافة السقف');

  const toggleRule = (r) => run(async () => {
    await client.put(`/ceilings/rules/${r.id}`, { isActive: !r.is_active });
    await loadRules();
  }, 'تم تحديث السقف');

  const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, overflowY: 'auto', zIndex: 1000 };
  const box = { background: '#fff', borderRadius: 10, width: 'min(760px, 100%)', padding: 18, margin: '24px 0' };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={box} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>الائتمان والسقوف — {customer.full_name}</h3>
          <button className="btn btn-secondary" onClick={onClose}>إغلاق</button>
        </div>

        {err && <div className="alert alert-error mt-2">{err}</div>}
        {msg && <div className="alert mt-2" style={{ background: '#e8f5e9' }}>{msg}</div>}

        <div className="card mt-2">
          <h4>حد الائتمان (ريال)</h4>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input className="form-control" type="number" min="0" style={{ width: 200 }} value={credit} onChange={(e) => setCredit(e.target.value)} />
            <input className="form-control" style={{ flex: 1, minWidth: 220 }} placeholder="سبب التغيير (إلزامي، يُسجَّل في التدقيق)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <button className="btn btn-primary" disabled={busy} onClick={saveCredit}>حفظ الحد</button>
          </div>
          <p style={{ fontSize: 12, color: '#666' }}>0 = بلا حد ائتماني. الحالي: {fmtMoney(customer.credit_limit)} ر.ي</p>
        </div>

        <div className="card mt-2">
          <h4>عند تجاوز السقف</h4>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select className="form-control" style={{ width: 260 }} value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="reject">{ACTION.reject}</option>
              <option value="request_approval">{ACTION.request_approval}</option>
            </select>
            <button className="btn btn-secondary" disabled={busy} onClick={saveAction}>حفظ الإجراء</button>
          </div>
        </div>

        <div className="card mt-2">
          <h4>السقوف الخاصة بهذا العميل</h4>
          {rules.length === 0 ? <p style={{ color: '#666' }}>لا توجد سقوف خاصة بهذا العميل.</p> : (
            <table>
              <thead><tr><th>الاسم</th><th>الفترة</th><th>كيس</th><th>قيمة</th><th>طلبات</th><th>قاطرات</th><th>الحالة</th><th /></tr></thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name_ar}</td>
                    <td>{PERIOD[r.period] || r.period}</td>
                    <td>{r.max_bags ?? '—'}</td>
                    <td>{r.max_amount ? fmtMoney(r.max_amount) : '—'}</td>
                    <td>{r.max_orders ?? '—'}</td>
                    <td>{r.max_vehicles ?? '—'}</td>
                    <td>{r.is_active ? 'فعّال' : 'معطّل'}</td>
                    <td><button className="btn btn-secondary" disabled={busy} onClick={() => toggleRule(r)}>{r.is_active ? 'تعطيل' : 'تفعيل'}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h4 className="mt-2">إضافة سقف لهذا العميل</h4>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input className="form-control" style={{ minWidth: 200 }} placeholder="اسم السقف" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} />
            <select className="form-control" style={{ width: 120 }} value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })}>
              <option value="daily">يومي</option>
              <option value="monthly">شهري</option>
            </select>
            <input className="form-control" style={{ width: 110 }} type="number" min="0" placeholder="كيس" value={form.maxBags} onChange={(e) => setForm({ ...form, maxBags: e.target.value })} />
            <input className="form-control" style={{ width: 130 }} type="number" min="0" placeholder="قيمة ر.ي" value={form.maxAmount} onChange={(e) => setForm({ ...form, maxAmount: e.target.value })} />
            <input className="form-control" style={{ width: 110 }} type="number" min="0" placeholder="عدد الطلبات" value={form.maxOrders} onChange={(e) => setForm({ ...form, maxOrders: e.target.value })} />
            <input className="form-control" style={{ width: 110 }} type="number" min="0" placeholder="عدد القاطرات" value={form.maxVehicles} onChange={(e) => setForm({ ...form, maxVehicles: e.target.value })} />
            <button className="btn btn-primary" disabled={busy} onClick={addRule}>إضافة السقف</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await client.get('/admin/customers');
      setCustomers(res.data.data || []);
    } catch (_) {}
    setLoading(false);
  };

  const fmt = (n) => (parseFloat(n) || 0).toLocaleString('en-US');

  const filtered = customers.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (c.full_name || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q)
    );
  });

  // تحديث صامت بعد الحفظ: لا نخفي الجدول والنافذة إن كانت القائمة محمّلة
  if (loading && customers.length === 0) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div>
      <div className="card mb-2">
        <div style={{ display: 'flex', gap: 12 }}>
          <input
            className="form-input"
            placeholder="🔍 ابحث بالاسم أو الهاتف..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="btn btn-secondary" onClick={load}>🔄 تحديث</button>
        </div>
      </div>

      <div className="table-container">
        <div className="table-header">
          <h3>العملاء ({filtered.length})</h3>
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">👥</div>
            <p>لا يوجد عملاء</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>الاسم</th>
                <th>الهاتف</th>
                <th>النوع</th>
                <th>المنطقة</th>
                <th>الطلبات</th>
                <th>الإجمالي</th>
                <th>الائتمان</th>
                <th>السقوف</th>
                <th>الحالة</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td><strong>{c.full_name}</strong></td>
                  <td>{c.phone}</td>
                  <td>
                    <span className="badge badge-info">
                      {{
                        individual: 'فرد',
                        trader: 'تاجر',
                        distributor: 'موزع',
                        contractor: 'مقاول',
                      }[c.customer_type] || c.customer_type}
                    </span>
                  </td>
                  <td>{c.governorate}{c.area ? ` - ${c.area}` : ''}</td>
                  <td>{c.orders_count || 0}</td>
                  <td><strong className="text-primary">{fmt(c.total_spent)} ر.ي</strong></td>
                  <td>{parseFloat(c.credit_limit) > 0 ? `${fmt(c.credit_limit)} ر.ي` : 'بلا حد'}</td>
                  <td>
                    {c.ceilings_count ? <span className="badge badge-info">{c.ceilings_count}</span> : <span style={{ color: '#888' }}>—</span>}
                    {c.ceiling_action === 'request_approval' && <span style={{ fontSize: 11, marginRight: 4 }}>(موافقة)</span>}
                  </td>
                  <td>
                    <span className={`badge ${c.status === 'active' ? 'badge-approved' : 'badge-cancelled'}`}>
                      {c.status === 'active' ? 'نشط' : 'موقوف'}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setSelected(c)}>
                      الائتمان والسقوف
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected && (
        <LimitsModal
          customer={selected}
          onClose={() => setSelected(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
