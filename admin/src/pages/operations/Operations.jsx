import { useEffect, useState } from 'react';
import client, { handleError } from '../../api/client';

const STATUS_AR = {
  REQUESTED: 'بانتظار الاعتماد',
  APPROVED: 'معتمد',
  ISSUED: 'صادر',
  USED: 'استُخدم',
  CANCELLED: 'ملغي',
};

const STATUS_COLOR = {
  REQUESTED: 'badge-pending',
  APPROVED: 'badge-info',
  ISSUED: 'badge-transit',
  USED: 'badge-completed',
  CANCELLED: 'badge-cancelled',
};

export default function Operations() {
  const [tab, setTab] = useState('pending');
  const [pending, setPending] = useState([]);
  const [routePrice, setRoutePrice] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => { load(); }, [tab]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      if (tab === 'pending') {
        const r = await client.get('/faxes/pending');
        setPending(r.data.data || []);
      } else if (tab === 'route-price') {
        const r = await client.get('/faxes/pending-route-price');
        setRoutePrice(r.data.data || []);
      }
    } catch (err) {
      setError(handleError(err));
    } finally {
      setLoading(false);
    }
  };

  const openDetails = (fax) => setSelected(fax);

  const approve = async (id) => {
    if (!window.confirm('اعتماد هذا الفاكس؟')) return;
    try {
      await client.patch(`/faxes/${id}/approve`);
      alert('✅ تم الاعتماد');
      setSelected(null);
      load();
    } catch (err) { alert(handleError(err)); }
  };

  const issue = async (id) => {
    const num = window.prompt('أدخل رقم الفاكس:');
    if (!num) return;
    try {
      await client.patch(`/faxes/${id}/issue-and-notify`, { faxNumber: num });
      alert('✅ تم الإصدار وإرسال SMS للسائق');
      setSelected(null);
      load();
    } catch (err) { alert(handleError(err)); }
  };

  const setRoute = async (id) => {
    const route = window.prompt('أدخل خط السير:\n(مثال: عمران ← صنعاء ← السبعين)');
    if (!route) return;
    try {
      await client.patch(`/faxes/${id}/route`, { route });
      alert('✅ تم تحديد خط السير');
      setSelected(null);
      load();
    } catch (err) { alert(handleError(err)); }
  };

  const setTransport = async (id) => {
    const rate = window.prompt('أدخل سعر النقل (ريال/كيس):');
    if (!rate) return;
    const rateNum = parseFloat(rate);
    if (isNaN(rateNum) || rateNum <= 0) { alert('سعر غير صحيح'); return; }
    try {
      await client.patch(`/faxes/${id}/transport`, {
        rate: rateNum,
        unit: 'bag',
        baseOn: 'approved_quantity',
      });
      alert('✅ تم تحديد سعر النقل');
      setSelected(null);
      load();
    } catch (err) { alert(handleError(err)); }
  };

  const fmt = (n) => (parseFloat(n) || 0).toLocaleString('en-US');

  const currentList = tab === 'pending' ? pending : routePrice;

  return (
    <div>
      {/* الأزرار العلوية */}
      <div className="card mb-2">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            className={`btn ${tab === 'pending' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab('pending')}
          >
            📋 الفاكسات النشطة ({pending.length})
          </button>
          <button
            className={`btn ${tab === 'route-price' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab('route-price')}
          >
            ⚙️ بحاجة خط سير/سعر ({routePrice.length})
          </button>
          <div style={{ flex: 1 }}></div>
          <button className="btn btn-success" onClick={() => setShowCreate(true)}>
            ➕ إنشاء فاكس مباشر
          </button>
          <button className="btn btn-secondary" onClick={load}>🔄 تحديث</button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="loading"><div className="spinner"></div></div>
      ) : currentList.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">✅</div>
            <p>لا توجد فاكسات في هذه القائمة</p>
          </div>
        </div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>السائق</th>
                <th>القاطرة</th>
                <th>المصنع</th>
                <th>الكمية</th>
                <th>رقم الفاكس</th>
                <th>الحالة</th>
                <th>خط السير</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {currentList.map((f) => (
                <tr key={f.id}>
                  <td>
                    <div><strong>{f.driver_name || '—'}</strong></div>
                    <div style={{ fontSize: 11, color: '#999' }}>{f.driver_phone || ''}</div>
                  </td>
                  <td>{f.plate_number || '—'}</td>
                  <td>{f.factory_name || '—'}</td>
                  <td><strong>{fmt(f.requested_quantity)}</strong> كيس</td>
                  <td>
                    {f.fax_number ? (
                      <code style={{ background: '#E8F5E9', padding: '2px 6px', borderRadius: 4 }}>
                        {f.fax_number}
                      </code>
                    ) : '—'}
                  </td>
                  <td>
                    <span className={`badge ${STATUS_COLOR[f.status] || 'badge-info'}`}>
                      {STATUS_AR[f.status] || f.status}
                    </span>
                  </td>
                  <td style={{ fontSize: 11, maxWidth: 150 }}>
                    {f.route || <span style={{ color: '#999' }}>لم يُحدد</span>}
                  </td>
                  <td>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => openDetails(f)}
                    >
                      👁 فتح
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* نافذة التفاصيل */}
      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 700 }}>
            <div className="modal-header">
              <h3>تفاصيل الفاكس</h3>
              <button className="modal-close" onClick={() => setSelected(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="grid-2">
                <div className="card">
                  <h4 style={{ marginBottom: 12 }}>السائق والقاطرة</h4>
                  <p><strong>السائق:</strong> {selected.driver_name || '—'}</p>
                  <p><strong>الهاتف:</strong> {selected.driver_phone || '—'}</p>
                  <p><strong>القاطرة:</strong> {selected.plate_number || '—'}</p>
                  <p><strong>نوع السائق:</strong> {
                    selected.driver_type_snapshot === 'trader_driver' ? 'تاجر' :
                    selected.driver_type_snapshot === 'institution_driver' ? 'مؤسسة' :
                    selected.driver_type_snapshot === 'transport_driver' ? 'مستقل' : '—'
                  }</p>
                </div>
                <div className="card">
                  <h4 style={{ marginBottom: 12 }}>الرحلة</h4>
                  <p><strong>المصنع:</strong> {selected.factory_name || '—'}</p>
                  <p><strong>الكمية:</strong> {fmt(selected.requested_quantity)} كيس</p>
                  <p><strong>الحالة:</strong> {STATUS_AR[selected.status]}</p>
                  <p><strong>رقم الفاكس:</strong> {selected.fax_number || '—'}</p>
                </div>
              </div>

              {selected.route && (
                <div className="card mt-2">
                  <h4 style={{ marginBottom: 12 }}>خط السير</h4>
                  <p>{selected.route}</p>
                </div>
              )}

              {selected.transport_rate && (
                <div className="card mt-2">
                  <h4 style={{ marginBottom: 12 }}>النقل</h4>
                  <p><strong>السعر:</strong> {fmt(selected.transport_rate)} ريال / {selected.transport_rate_unit === 'ton' ? 'طن' : 'كيس'}</p>
                  <p><strong>الإجمالي:</strong> {fmt(selected.transport_total)} ريال</p>
                  {!selected.is_managed_by_institution && (
                    <div className="alert alert-info" style={{ marginTop: 8 }}>
                      ⚠️ سائق تاجر — لا يوجد سجل مالي في المؤسسة
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ flexWrap: 'wrap', gap: 8 }}>
              <button className="btn btn-secondary" onClick={() => setSelected(null)}>إغلاق</button>
              {selected.status === 'REQUESTED' && (
                <button className="btn btn-primary" onClick={() => approve(selected.id)}>
                  ✅ اعتماد
                </button>
              )}
              {selected.status === 'APPROVED' && (
                <button className="btn btn-success" onClick={() => issue(selected.id)}>
                  📄 إصدار + إشعار SMS
                </button>
              )}
              {selected.status === 'ISSUED' && !selected.route && (
                <button className="btn btn-warning" onClick={() => setRoute(selected.id)}>
                  🗺️ تحديد خط السير
                </button>
              )}
              {selected.status === 'ISSUED' && !selected.transport_rate && (
                <button className="btn btn-warning" onClick={() => setTransport(selected.id)}>
                  💰 تحديد سعر النقل
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* نافذة الإنشاء المباشر */}
      {showCreate && (
        <CreateFaxModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}
    </div>
  );
}

// === نافذة إنشاء فاكس مباشر ===
function CreateFaxModal({ onClose, onCreated }) {
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [factories, setFactories] = useState([]);
  const [form, setForm] = useState({
    driverId: '', vehicleId: '', factoryId: '',
    quantity: '', notes: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadOptions(); }, []);

  const loadOptions = async () => {
    try {
      const [d, v, f] = await Promise.all([
        client.get('/drivers'),
        client.get('/vehicles'),
        client.get('/sources'),
      ]);
      setDrivers(d.data.data || []);
      setVehicles(v.data.data || []);
      setFactories(f.data.data || []);
    } catch (err) { console.error(err); }
  };

  const save = async () => {
    if (!form.driverId || !form.vehicleId || !form.factoryId || !form.quantity) {
      alert('يرجى ملء كل الحقول المطلوبة');
      return;
    }
    setSaving(true);
    try {
      await client.post('/faxes/staff/create', {
        driverId: form.driverId,
        vehicleId: form.vehicleId,
        factoryId: form.factoryId,
        quantity: parseFloat(form.quantity),
        notes: form.notes,
      });
      alert('✅ تم إنشاء الفاكس');
      onCreated();
    } catch (err) {
      alert(handleError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600 }}>
        <div className="modal-header">
          <h3>إنشاء فاكس مباشر</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="alert alert-info" style={{ marginBottom: 16 }}>
            💡 استخدم هذه الشاشة عندما يكون السائق أو التاجر غير متاح على التطبيق.
          </div>

          <div className="form-group">
            <label className="form-label">السائق *</label>
            <select className="form-select" value={form.driverId}
              onChange={(e) => setForm({ ...form, driverId: e.target.value })}>
              <option value="">اختر سائقًا</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name} — {d.phone}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">القاطرة *</label>
            <select className="form-select" value={form.vehicleId}
              onChange={(e) => setForm({ ...form, vehicleId: e.target.value })}>
              <option value="">اختر قاطرة</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate_number} — {v.vehicle_type}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">المصنع *</label>
            <select className="form-select" value={form.factoryId}
              onChange={(e) => setForm({ ...form, factoryId: e.target.value })}>
              <option value="">اختر مصنعًا</option>
              {factories.map((f) => (
                <option key={f.id} value={f.id}>{f.name_ar}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">الكمية (بالكيس) *</label>
            <input type="number" className="form-input" value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              placeholder="1000" />
          </div>

          <div className="form-group">
            <label className="form-label">ملاحظات</label>
            <textarea className="form-textarea" value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>إلغاء</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? '...' : '💾 إنشاء الفاكس'}
          </button>
        </div>
      </div>
    </div>
  );
}
