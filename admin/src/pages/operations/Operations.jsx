import { useEffect, useState } from 'react';
import client, { handleError } from '../../api/client';
import { downloadFile } from '../../utils/files';

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
  const [tab, setTab] = useState('alerts');
  const [pending, setPending] = useState([]);
  const [routePrice, setRoutePrice] = useState([]);
  const [alerts, setAlerts] = useState({ urgent: [], needs_follow_up: [], normal: [], summary: {} });
  const [traders, setTraders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showIssue, setShowIssue] = useState(false);
  const [showRouteModal, setShowRouteModal] = useState(false);

  useEffect(() => { load(); }, [tab]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      if (tab === 'alerts') {
        const r = await client.get('/faxes/operations-center');
        setAlerts(r.data.data || { urgent: [], needs_follow_up: [], normal: [], summary: {} });
      } else if (tab === 'pending') {
        const r = await client.get('/faxes/pending');
        setPending(r.data.data || []);
      } else if (tab === 'route-price') {
        const [r, tradersRes] = await Promise.all([
          client.get('/faxes/pending-route-price'),
          client.get('/admin/customers'),
        ]);
        setRoutePrice(r.data.data || []);
        setTraders((tradersRes.data.data || []).filter(
          (c) => c.customer_type === 'trader' || c.customer_type === 'distributor'
        ));
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

  const fmt = (n) => (parseFloat(n) || 0).toLocaleString('en-US');

  const currentList = tab === 'pending' ? pending : tab === 'route-price' ? routePrice : [];

  return (
    <div>
      {/* الأزرار العلوية */}
      <div className="card mb-2">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            className={`btn ${tab === 'alerts' ? 'btn-danger' : 'btn-secondary'}`}
            onClick={() => setTab('alerts')}
          >
            🔴 يحتاج تدخل {alerts.summary?.urgent_count > 0 ? `(${alerts.summary.urgent_count})` : ''}
          </button>
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
          <button
            className="btn btn-secondary"
            onClick={() => downloadFile('/faxes/export', `faxes-${new Date().toISOString().slice(0, 10)}.csv`).catch((e) => alert(handleError(e)))}
          >
            📥 تصدير Excel
          </button>
          <button className="btn btn-secondary" onClick={load}>🔄 تحديث</button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="loading"><div className="spinner"></div></div>
      ) : tab === 'alerts' ? (
        <OperationsAlertsView
          alerts={alerts}
          fmt={fmt}
          onOpen={openDetails}
        />
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
                    {f.trader_name && (
                      <div style={{ fontSize: 10, color: '#1565C0', marginTop: 2 }}>
                        🏢 {f.trader_name}
                      </div>
                    )}
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
                <button className="btn btn-success" onClick={() => setShowIssue(true)}>
                  📄 إصدار + إشعار SMS
                </button>
              )}
              {(selected.status === 'ISSUED' || selected.status === 'USED') && (!selected.route || !selected.transport_rate) && (
                <button className="btn btn-warning" onClick={() => setShowRouteModal(true)}>
                  🗺️ تحديد خط السير والأجرة
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* نافذة إصدار الفاكس */}
      {showIssue && selected && (
        <IssueFaxModal
          fax={selected}
          onClose={() => setShowIssue(false)}
          onIssued={() => { setShowIssue(false); setSelected(null); load(); }}
        />
      )}

      {/* نافذة تحديد خط السير والأجرة (نفس منطق "بانتظار خط السير" بما فيه من يتحمل الأجرة) */}
      {showRouteModal && selected && (
        <RouteTransportModal
          fax={selected}
          traders={traders}
          onClose={() => setShowRouteModal(false)}
          onSaved={() => { setShowRouteModal(false); setSelected(null); load(); }}
        />
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

// === مركز العمليات: يحتاج تدخل / يحتاج متابعة / طبيعي ===
function OperationsAlertsView({ alerts, fmt, onOpen }) {
  const urgent = alerts.urgent || [];
  const followUp = alerts.needs_follow_up || [];
  const normal = alerts.normal || [];

  const followUpLabel = (reason) =>
    reason === 'AWAITING_ISSUE' ? 'بانتظار الاعتماد/الإصدار' : 'بانتظار خط السير أو الأجرة';

  return (
    <div>
      {/* يحتاج تدخل — الأهم */}
      <div className="card mb-2" style={{ borderRight: '4px solid #DC3545' }}>
        <h3 style={{ color: '#DC3545', marginBottom: 12 }}>
          🔴 يحتاج تدخل — رحلات متأخرة ({urgent.length})
        </h3>
        {urgent.length === 0 ? (
          <p style={{ color: '#666', fontSize: 13 }}>لا توجد رحلات متأخرة حاليًا. 👍</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {urgent.map((f) => (
              <div
                key={f.id}
                onClick={() => onOpen(f)}
                style={{
                  padding: 12, background: '#FFF5F5', border: '1px solid #FFCDD2',
                  borderRadius: 8, cursor: 'pointer',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8,
                }}
              >
                <div>
                  <strong>{f.plate_number || '—'}</strong> — {f.driver_name || '—'}
                  <div style={{ fontSize: 12, color: '#666' }}>
                    داخل مصنع {f.factory_name || '—'} منذ {f.minutes_elapsed} دقيقة دون تسجيل تحميل
                  </div>
                </div>
                <span className="badge badge-cancelled">{f.minutes_elapsed} د</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* يحتاج متابعة */}
      <div className="card mb-2" style={{ borderRight: '4px solid #FFC107' }}>
        <h3 style={{ color: '#F57F17', marginBottom: 12 }}>
          🟡 يحتاج متابعة — فاكسات لم تُقيَّد/تُسعَّر بعد ({followUp.length})
        </h3>
        {followUp.length === 0 ? (
          <p style={{ color: '#666', fontSize: 13 }}>لا يوجد شيء بانتظار المتابعة حاليًا. 👍</p>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>السائق</th>
                  <th>القاطرة</th>
                  <th>المصنع</th>
                  <th>الكمية</th>
                  <th>السبب</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {followUp.map((f) => (
                  <tr key={f.id}>
                    <td>{f.driver_name || '—'}</td>
                    <td>{f.plate_number || '—'}</td>
                    <td>{f.factory_name || '—'}</td>
                    <td>{fmt(f.requested_quantity)} كيس</td>
                    <td style={{ fontSize: 12 }}>{followUpLabel(f.follow_up_reason)}</td>
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => onOpen(f)}>👁 فتح</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* طبيعي */}
      <div className="card" style={{ borderRight: '4px solid #28A745' }}>
        <h3 style={{ color: '#2E7D32', marginBottom: 4 }}>
          🟢 طبيعي — رحلات في الطريق ({normal.length})
        </h3>
        <p style={{ color: '#666', fontSize: 12 }}>
          خط السير والأجرة محدَّدان لهذه الرحلات ولا تحتاج أي تدخل حاليًا.
        </p>
      </div>
    </div>
  );
}

// === نافذة إصدار فاكس (بديل window.prompt) ===
function IssueFaxModal({ fax, onClose, onIssued }) {
  const [faxNumber, setFaxNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!faxNumber.trim()) { setError('رقم الفاكس مطلوب'); return; }
    setSaving(true);
    setError('');
    try {
      await client.patch(`/faxes/${fax.id}/issue-and-notify`, { faxNumber: faxNumber.trim() });
      onIssued();
    } catch (err) {
      setError(handleError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <h3>📄 إصدار الفاكس</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {error && <div className="alert alert-error">{error}</div>}
          <div className="form-group">
            <label className="form-label">رقم الفاكس *</label>
            <input
              className="form-input"
              value={faxNumber}
              autoFocus
              onChange={(e) => setFaxNumber(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              placeholder="مثال: FX-2026-00012"
            />
          </div>
          <div className="alert alert-info" style={{ marginTop: 8 }}>
            سيصل السائق إشعارًا داخل التطبيق ورسالة SMS فور الإصدار.
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>إلغاء</button>
          <button className="btn btn-success" onClick={save} disabled={saving}>
            {saving ? '...' : '✅ إصدار وإشعار السائق'}
          </button>
        </div>
      </div>
    </div>
  );
}

// === نافذة تحديد خط السير والأجرة — تستخدم /route-transport الموحّد والآمن فقط ===
function RouteTransportModal({ fax, traders, onClose, onSaved }) {
  const [form, setForm] = useState({
    route: fax.route || '',
    deliveryGovernorate: fax.delivery_governorate || '',
    deliveryArea: fax.delivery_area || '',
    deliveryAddress: fax.delivery_address || '',
    rate: fax.transport_rate || '',
    unit: fax.transport_rate_unit || 'bag',
    baseOn: 'requested_quantity',
    transportPayer: 'institution',
    transportPayerTraderId: '',
    transportPayerNote: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fmt = (n) => (parseFloat(n) || 0).toLocaleString('en-US');
  const baseQty = parseFloat(fax.requested_quantity || 0);
  const totalTransport = (parseFloat(form.rate) || 0) * baseQty;

  const save = async () => {
    if (!form.route.trim()) { setError('خط السير مطلوب'); return; }
    if (!form.rate || parseFloat(form.rate) <= 0) { setError('سعر النقل مطلوب'); return; }
    if (form.transportPayer === 'trader' && !form.transportPayerTraderId) {
      setError('يرجى اختيار التاجر الذي يتحمل الأجرة');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await client.patch(`/faxes/${fax.id}/route-transport`, {
        route: form.route,
        deliveryGovernorate: form.deliveryGovernorate,
        deliveryArea: form.deliveryArea,
        deliveryAddress: form.deliveryAddress,
        rate: parseFloat(form.rate),
        unit: form.unit,
        baseOn: form.baseOn,
        transportPayer: form.transportPayer,
        transportPayerTraderId: form.transportPayer === 'trader' ? form.transportPayerTraderId : undefined,
        transportPayerNote: form.transportPayerNote,
      });
      onSaved();
    } catch (err) {
      setError(handleError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 700 }}>
        <div className="modal-header">
          <h3>🗺️ تحديد خط السير والأجرة</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {error && <div className="alert alert-error">{error}</div>}

          <div style={{ background: '#F8F9FA', padding: 14, borderRadius: 10, marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13 }}>
              <span><strong>السائق:</strong> {fax.driver_name}</span>
              <span><strong>القاطرة:</strong> {fax.plate_number}</span>
              <span><strong>المصنع:</strong> {fax.factory_name}</span>
              <span><strong>الكمية المطلوبة:</strong> {fmt(fax.requested_quantity)} كيس</span>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">خط السير *</label>
            <input
              className="form-input"
              value={form.route}
              onChange={(e) => setForm({ ...form, route: e.target.value })}
              placeholder="مثال: عمران ← صنعاء ← السبعين"
            />
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">أجرة النقل (ريال) *</label>
              <input
                type="number"
                className="form-input"
                value={form.rate}
                onChange={(e) => setForm({ ...form, rate: e.target.value })}
                placeholder="150"
              />
            </div>
            <div className="form-group">
              <label className="form-label">الوحدة</label>
              <select
                className="form-select"
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
              >
                <option value="bag">ريال / كيس</option>
                <option value="ton">ريال / طن</option>
              </select>
            </div>
          </div>

          {/* من يدفع أجور النقل */}
          <div className="form-group" style={{
            padding: 14, background: '#FFF9C4', borderRadius: 10, border: '2px solid #FFC107',
          }}>
            <label className="form-label" style={{ color: '#F57F17', fontWeight: 'bold', fontSize: 14, marginBottom: 12 }}>
              💰 من يتحمل أجور النقل؟
            </label>
            <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
              <button
                type="button"
                className={'btn ' + (form.transportPayer === 'institution' ? 'btn-primary' : 'btn-secondary')}
                onClick={() => setForm({ ...form, transportPayer: 'institution', transportPayerTraderId: '' })}
                style={{ flex: 1, minWidth: 140, padding: '10px 16px' }}
              >
                🏢 المؤسسة
              </button>
              <button
                type="button"
                className={'btn ' + (form.transportPayer === 'trader' ? 'btn-primary' : 'btn-secondary')}
                onClick={() => setForm({ ...form, transportPayer: 'trader' })}
                style={{ flex: 1, minWidth: 140, padding: '10px 16px' }}
              >
                👤 التاجر
              </button>
            </div>

            {form.transportPayer === 'trader' && (
              <select
                className="form-select"
                value={form.transportPayerTraderId}
                onChange={(e) => setForm({ ...form, transportPayerTraderId: e.target.value })}
              >
                <option value="">— اختر التاجر —</option>
                {traders.map((t) => (
                  <option key={t.id} value={t.id}>{t.full_name} — {t.phone}</option>
                ))}
              </select>
            )}
          </div>

          {form.rate && parseFloat(form.rate) > 0 && (
            <div style={{ padding: 14, background: '#E8F5E9', borderRadius: 10, marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18 }}>
                <span>إجمالي الأجرة:</span>
                <strong style={{ color: '#2E7D32' }}>{fmt(totalTransport)} ريال</strong>
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>إلغاء</button>
          <button className="btn btn-success" onClick={save} disabled={saving}>
            {saving ? '...' : '💾 حفظ وتقييد المستحق'}
          </button>
        </div>
      </div>
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
