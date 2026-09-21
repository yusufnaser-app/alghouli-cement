import { useEffect, useState } from 'react';
import client, { handleError } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

export default function Drivers() {
  const { hasRole } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    fullName: '', phone: '', licenseNumber: '', idNumber: '', notes: '',
  });

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await client.get('/drivers');
      setItems(res.data.data || []);
    } catch (_) {}
    setLoading(false);
  };

  const openAdd = () => {
    setEditing(null);
    setForm({ fullName: '', phone: '', licenseNumber: '', idNumber: '', notes: '' });
    setShowModal(true);
  };

  const openEdit = (d) => {
    setEditing(d);
    setForm({
      fullName: d.full_name || '',
      phone: d.phone || '',
      licenseNumber: d.license_number || '',
      idNumber: d.id_number || '',
      notes: d.notes || '',
    });
    setShowModal(true);
  };

  const save = async () => {
    if (!form.fullName || !form.phone) {
      alert('الاسم والهاتف مطلوبان');
      return;
    }
    if (!/^967[0-9]{9}$/.test(form.phone)) {
      alert('رقم الهاتف بصيغة 967XXXXXXXXX');
      return;
    }
    try {
      if (editing) {
        await client.put(`/drivers/${editing.id}`, form);
      } else {
        await client.post('/drivers', form);
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
          <h3>السائقون ({items.length})</h3>
          {hasRole('transport', 'admin') && (
            <button className="btn btn-primary" onClick={openAdd}>➕ إضافة سائق</button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🧑‍✈️</div>
            <p>لا يوجد سائقون</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>الاسم</th>
                <th>الهاتف</th>
                <th>رقم الرخصة</th>
                <th>الحالة</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {items.map((d) => (
                <tr key={d.id}>
                  <td><strong>{d.full_name}</strong></td>
                  <td>{d.phone}</td>
                  <td>{d.license_number || '—'}</td>
                  <td>
                    <span className={`badge ${d.status === 'available' ? 'badge-approved' : d.status === 'busy' ? 'badge-pending' : 'badge-cancelled'}`}>
                      {d.status === 'available' ? 'متاح' : d.status === 'busy' ? 'مشغول' : 'غير نشط'}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn-secondary btn-sm" onClick={() => openEdit(d)}>✏️</button>
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
              <h3>{editing ? 'تعديل سائق' : 'إضافة سائق'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">الاسم *</label>
                  <input className="form-input" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">الهاتف *</label>
                  <input className="form-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="967771234567" />
                </div>
                <div className="form-group">
                  <label className="form-label">رقم الرخصة</label>
                  <input className="form-input" value={form.licenseNumber} onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">رقم الهوية</label>
                  <input className="form-input" value={form.idNumber} onChange={(e) => setForm({ ...form, idNumber: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">ملاحظات</label>
                <textarea className="form-textarea" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
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
