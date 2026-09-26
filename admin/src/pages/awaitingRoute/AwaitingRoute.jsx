import { useEffect, useState } from 'react';
import client, { handleError } from '../../api/client';

export default function AwaitingRoute() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({
    route: '',
    deliveryGovernorate: '',
    deliveryArea: '',
    deliveryAddress: '',
    rate: '',
    unit: 'bag',
    baseOn: 'loaded_quantity',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await client.get('/faxes/admin/awaiting-route');
      setItems(res.data.data || []);
    } catch (err) {
      alert(handleError(err));
    } finally {
      setLoading(false);
    }
  };

  const openFax = (f) => {
    setSelected(f);
    setForm({
      route: '',
      deliveryGovernorate: '',
      deliveryArea: '',
      deliveryAddress: '',
      rate: '',
      unit: 'bag',
      baseOn: 'loaded_quantity',
    });
  };

  const save = async () => {
    if (!form.route.trim()) { alert('خط السير مطلوب'); return; }
    if (!form.rate || parseFloat(form.rate) <= 0) { alert('سعر النقل مطلوب'); return; }

    setSaving(true);
    try {
      await client.patch(`/faxes/${selected.id}/route-transport`, {
        route: form.route,
        deliveryGovernorate: form.deliveryGovernorate,
        deliveryArea: form.deliveryArea,
        deliveryAddress: form.deliveryAddress,
        rate: parseFloat(form.rate),
        unit: form.unit,
        baseOn: form.baseOn,
      });
      alert('✅ تم تحديد خط السير والأجرة');
      setSelected(null);
      load();
    } catch (err) {
      alert(handleError(err));
    } finally {
      setSaving(false);
    }
  };

  const fmt = (n) => (parseFloat(n) || 0).toLocaleString('en-US');

  const getBaseQty = () => {
    if (!selected) return 0;
    const b = form.baseOn;
    if (b === 'requested_quantity') return parseFloat(selected.requested_quantity || 0);
    if (b === 'delivered_quantity') return parseFloat(selected.delivered_quantity || selected.loaded_quantity || 0);
    return parseFloat(selected.loaded_quantity || selected.requested_quantity || 0);
  };

  const totalTransport = (parseFloat(form.rate) || 0) * getBaseQty();

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div>
      <div className="card mb-2">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3>🚛 قاطرات بانتظار خط السير</h3>
            <p style={{ color: '#999', fontSize: 13, marginTop: 4 }}>
              عدد: {items.length} — تم تحميلها وتحتاج تحديد الوجهة والأجرة
            </p>
          </div>
          <button className="btn btn-secondary" onClick={load}>🔄 تحديث</button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">✅</div>
            <p>لا توجد قاطرات بانتظار خط السير</p>
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
                <th>المطلوب</th>
                <th>المحمل</th>
                <th>الفرق</th>
                <th>وقت التحميل</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {items.map((f) => {
                const diff = parseFloat(f.quantity_discrepancy || 0);
                return (
                  <tr key={f.id}>
                    <td>
                      <div><strong>{f.driver_name}</strong></div>
                      <div style={{ fontSize: 11, color: '#999' }}>{f.driver_phone}</div>
                    </td>
                    <td>{f.plate_number || '—'}</td>
                    <td>{f.factory_name || '—'}</td>
                    <td>{fmt(f.requested_quantity)}</td>
                    <td>
                      <strong style={{ color: '#2E7D32' }}>
                        {fmt(f.loaded_quantity)}
                      </strong>
                    </td>
                    <td>
                      <span className={`badge ${Math.abs(diff) > 0.01 ? 'badge-pending' : 'badge-approved'}`}>
                        {diff > 0 ? '+' : ''}{fmt(diff)}
                      </span>
                    </td>
                    <td style={{ fontSize: 11 }}>
                      {f.used_at?.substring(11, 16) || '—'}
                    </td>
                    <td>
                      <button className="btn btn-primary btn-sm" onClick={() => openFax(f)}>
                        📍 تحديد الخط
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 700 }}>
            <div className="modal-header">
              <h3>📍 تحديد خط السير والأجرة</h3>
              <button className="modal-close" onClick={() => setSelected(null)}>×</button>
            </div>
            <div className="modal-body">
              {/* الملخص */}
              <div style={{ background: '#F8F9FA', padding: 14, borderRadius: 10, marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13 }}>
                  <span><strong>السائق:</strong> {selected.driver_name}</span>
                  <span><strong>القاطرة:</strong> {selected.plate_number}</span>
                  <span><strong>المصنع:</strong> {selected.factory_name}</span>
                </div>
                <div style={{ marginTop: 8, fontSize: 13 }}>
                  <span style={{ marginLeft: 16 }}><strong>المطلوب:</strong> {fmt(selected.requested_quantity)} كيس</span>
                  <span><strong>المحمل:</strong> <span style={{ color: '#2E7D32', fontWeight: 'bold' }}>{fmt(selected.loaded_quantity)} كيس</span></span>
                </div>
              </div>

              {/* خط السير */}
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
                  <label className="form-label">المحافظة</label>
                  <input
                    className="form-input"
                    value={form.deliveryGovernorate}
                    onChange={(e) => setForm({ ...form, deliveryGovernorate: e.target.value })}
                    placeholder="صنعاء"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">المنطقة</label>
                  <input
                    className="form-input"
                    value={form.deliveryArea}
                    onChange={(e) => setForm({ ...form, deliveryArea: e.target.value })}
                    placeholder="السبعين"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">العنوان التفصيلي</label>
                <textarea
                  className="form-textarea"
                  value={form.deliveryAddress}
                  onChange={(e) => setForm({ ...form, deliveryAddress: e.target.value })}
                  placeholder="شارع تعز - جوار جامع النور"
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

              <div className="form-group">
                <label className="form-label">أساس احتساب الأجرة</label>
                <select
                  className="form-select"
                  value={form.baseOn}
                  onChange={(e) => setForm({ ...form, baseOn: e.target.value })}
                >
                  <option value="loaded_quantity">الكمية المحملة</option>
                  <option value="requested_quantity">الكمية المطلوبة</option>
                  <option value="delivered_quantity">الكمية المسلمة</option>
                </select>
              </div>

              {/* الملخص المالي */}
              {form.rate && parseFloat(form.rate) > 0 && (
                <div style={{
                  padding: 14,
                  background: '#E8F5E9',
                  borderRadius: 10,
                  marginTop: 12,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                    <span>الكمية الأساس:</span>
                    <strong>{fmt(getBaseQty())} {form.unit === 'ton' ? 'طن' : 'كيس'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginTop: 6 }}>
                    <span>سعر النقل:</span>
                    <strong>{fmt(form.rate)} ريال</strong>
                  </div>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 18,
                    marginTop: 10,
                    paddingTop: 10,
                    borderTop: '1px solid #A5D6A7',
                  }}>
                    <span>إجمالي الأجرة:</span>
                    <strong style={{ color: '#2E7D32' }}>{fmt(totalTransport)} ريال</strong>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setSelected(null)}>إلغاء</button>
              <button className="btn btn-success" onClick={save} disabled={saving}>
                {saving ? '...' : '💾 حفظ وتقييد المستحق'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
