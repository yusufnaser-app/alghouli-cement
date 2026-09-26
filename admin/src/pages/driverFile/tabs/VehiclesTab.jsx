import { useState } from 'react';
import client, { handleError } from '../../../api/client';

export default function VehiclesTab({ profile, onReload }) {
  const vehicles = profile.vehicles || [];
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    plateNumber: '',
    vehicleType: 'truck_10t',
    capacityTons: 10,
  });
  const [saving, setSaving] = useState(false);

  const addVehicle = async () => {
    if (!form.plateNumber.trim()) {
      alert('رقم اللوحة مطلوب');
      return;
    }
    setSaving(true);
    try {
      await client.post('/vehicles', {
        plateNumber: form.plateNumber,
        vehicleType: form.vehicleType,
        capacityTons: parseFloat(form.capacityTons),
        currentDriverId: profile.id,
        ownerType: profile.driver_type === 'trader_driver' ? 'trader' : 'company',
      });
      alert('تم إضافة القاطرة');
      setShowAdd(false);
      setForm({ plateNumber: '', vehicleType: 'truck_10t', capacityTons: 10 });
      onReload();
    } catch (err) {
      alert(handleError(err));
    } finally {
      setSaving(false);
    }
  };

  const vehicleTypeAr = (t) => ({
    'truck_10t': 'شاحنة 10 طن',
    'truck_20t': 'شاحنة 20 طن',
    'tanker': 'صهريج سائب',
    'pickup': 'بيك أب',
  }[t] || t);

  const statusAr = (s) => ({
    'available': 'متاحة',
    'awaiting_loading': 'بانتظار التحميل',
    'inside_factory': 'داخل المصنع',
    'loaded': 'محمّلة',
    'in_transit': 'في الطريق',
    'out_of_service': 'خارج الخدمة',
  }[s] || s || 'متاحة');

  const statusColor = (s) => ({
    'available': '#28A745',
    'awaiting_loading': '#FFA000',
    'inside_factory': '#17A2B8',
    'loaded': '#2196F3',
    'in_transit': '#1565C0',
    'out_of_service': '#9E9E9E',
  }[s] || '#28A745');

  return (
    <div>
      <div className="card mb-2" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>🚛 القاطرات المرتبطة</h3>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
          + إضافة قاطرة
        </button>
      </div>

      {vehicles.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">🚛</div>
            <p>لا توجد قاطرات مرتبطة بهذا السائق</p>
          </div>
        </div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>رقم اللوحة</th>
                <th>النوع</th>
                <th>السعة</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => (
                <tr key={v.id}>
                  <td><strong style={{ fontFamily: 'monospace', fontSize: 15 }}>{v.plate_number}</strong></td>
                  <td>{vehicleTypeAr(v.vehicle_type)}</td>
                  <td>{parseFloat(v.capacity_tons)} طن</td>
                  <td>
                    <span className="badge" style={{
                      background: statusColor(v.operating_status),
                      color: 'white',
                    }}>
                      {statusAr(v.operating_status)}
                    </span>
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
              <h3>إضافة قاطرة</h3>
              <button className="modal-close" onClick={() => setShowAdd(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">رقم اللوحة *</label>
                <input className="form-input" value={form.plateNumber}
                  onChange={(e) => setForm({ ...form, plateNumber: e.target.value })}
                  placeholder="ABC-1234" />
              </div>
              <div className="form-group">
                <label className="form-label">نوع القاطرة</label>
                <select className="form-select" value={form.vehicleType}
                  onChange={(e) => setForm({ ...form, vehicleType: e.target.value })}>
                  <option value="truck_10t">شاحنة 10 طن</option>
                  <option value="truck_20t">شاحنة 20 طن</option>
                  <option value="tanker">صهريج سائب</option>
                  <option value="pickup">بيك أب</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">السعة (طن)</label>
                <input type="number" className="form-input" value={form.capacityTons}
                  onChange={(e) => setForm({ ...form, capacityTons: e.target.value })} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAdd(false)}>إلغاء</button>
              <button className="btn btn-primary" onClick={addVehicle} disabled={saving}>
                {saving ? '...' : 'حفظ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
