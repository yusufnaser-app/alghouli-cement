import { useEffect, useState } from 'react';
import client, { handleError } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

export default function Vehicles() {
  const { hasRole } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    plateNumber: '',
    vehicleType: 'truck_10t',
    supportsBagged: true,
    supportsBulk: false,
    capacityTons: 10,
    capacityBags: 200,
    ownerName: '',
    ownerType: 'company',
    notes: '',
  });

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await client.get('/vehicles');
      setItems(res.data.data || []);
    } catch (_) {}
    setLoading(false);
  };

  const openAdd = () => {
    setEditing(null);
    setForm({
      plateNumber: '', vehicleType: 'truck_10t',
      supportsBagged: true, supportsBulk: false,
      capacityTons: 10, capacityBags: 200,
      ownerName: '', ownerType: 'company', notes: '',
    });
    setShowModal(true);
  };

  const openEdit = (v) => {
    setEditing(v);
    setForm({
      plateNumber: v.plate_number || '',
      vehicleType: v.vehicle_type || 'truck_10t',
      supportsBagged: v.supports_bagged,
      supportsBulk: v.supports_bulk,
      capacityTons: parseFloat(v.capacity_tons) || 10,
      capacityBags: v.capacity_bags || 200,
      ownerName: v.owner_name || '',
      ownerType: v.owner_type || 'company',
      notes: v.notes || '',
    });
    setShowModal(true);
  };

  const save = async () => {
    if (!form.plateNumber) {
      alert('رقم اللوحة مطلوب');
      return;
    }
    try {
      if (editing) {
        await client.put(`/vehicles/${editing.id}`, form);
      } else {
        await client.post('/vehicles', form);
      }
      setShowModal(false);
      load();
    } catch (err) {
      alert(handleError(err));
    }
  };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div>
      <div className="table-container">
        <div className="table-header">
          <h3>الشاحنات ({items.length})</h3>
          {hasRole('transport', 'admin') && (
            <button className="btn btn-primary" onClick={openAdd}>➕ إضافة شاحنة</button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🚛</div>
            <p>لا توجد شاحنات</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>اللوحة</th>
                <th>النوع</th>
                <th>الحمولة</th>
                <th>يدعم</th>
                <th>الحالة</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {items.map((v) => (
                <tr key={v.id}>
                  <td><strong>{v.plate_number}</strong></td>
                  <td>{v.vehicle_type}</td>
                  <td>{parseFloat(v.capacity_tons)} طن</td>
                  <td>
                    {v.supports_bagged && <span className="badge badge-info">📦 أكياس</span>}
                    {v.supports_bulk && <span className="badge badge-pending" style={{ marginRight: 4 }}>🚛 سائب</span>}
                  </td>
                  <td>
                    <span className={`badge ${v.status === 'available' ? 'badge-approved' : 'badge-cancelled'}`}>
                      {v.status === 'available' ? 'متاحة' : 'غير متاحة'}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn-secondary btn-sm" onClick={() => openEdit(v)}>✏️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editing ? 'تعديل شاحنة' : 'إضافة شاحنة'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">رقم اللوحة *</label>
                  <input className="form-input" value={form.plateNumber} onChange={(e) => setForm({ ...form, plateNumber: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">النوع</label>
                  <select className="form-select" value={form.vehicleType} onChange={(e) => setForm({ ...form, vehicleType: e.target.value })}>
                    <option value="truck_10t">شاحنة 10 طن</option>
                    <option value="truck_20t">شاحنة 20 طن</option>
                    <option value="tanker">صهريج سائب</option>
                    <option value="pickup">بيك أب</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">الحمولة (طن)</label>
                  <input type="number" className="form-input" value={form.capacityTons} onChange={(e) => setForm({ ...form, capacityTons: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">عدد الأكياس</label>
                  <input type="number" className="form-input" value={form.capacityBags} onChange={(e) => setForm({ ...form, capacityBags: e.target.value })} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 20, marginTop: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={form.supportsBagged} onChange={(e) => setForm({ ...form, supportsBagged: e.target.checked })} />
                  يدعم الأكياس
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={form.supportsBulk} onChange={(e) => setForm({ ...form, supportsBulk: e.target.checked })} />
                  يدعم السائب
                </label>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>إلغاء</button>
              <button className="btn btn-primary" onClick={save}>{editing ? 'تحديث' : 'إضافة'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
