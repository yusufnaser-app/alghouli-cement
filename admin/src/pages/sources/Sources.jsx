import { useEffect, useState } from 'react';
import client, { handleError } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

export default function Sources() {
  const { hasRole } = useAuth();
  const [sources, setSources] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    code: '',
    nameAr: '',
    governorate: '',
    area: '',
    supportsBagged: true,
    supportsBulk: true,
    displayOrder: 0,
    categoryIds: [],
  });

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [s, c] = await Promise.all([
        client.get('/sources'),
        client.get('/categories'),
      ]);
      setSources(s.data.data);
      setCategories(c.data.data);
    } catch (err) {
      setError(handleError(err));
    } finally {
      setLoading(false);
    }
  };

  const openAdd = () => {
    setEditing(null);
    setForm({
      code: '', nameAr: '', governorate: '', area: '',
      supportsBagged: true, supportsBulk: true, displayOrder: 0, categoryIds: [],
    });
    setShowModal(true);
  };

  const openEdit = (s) => {
    setEditing(s);
    setForm({
      code: s.code || '',
      nameAr: s.name_ar || '',
      governorate: s.governorate || '',
      area: s.area || '',
      supportsBagged: s.supports_bagged,
      supportsBulk: s.supports_bulk,
      displayOrder: s.display_order || 0,
      categoryIds: (s.categories || []).map((c) => c.code),
    });
    setShowModal(true);
  };

  const save = async () => {
    if (!form.code || !form.nameAr) {
      alert('الرمز والاسم مطلوبان');
      return;
    }
    try {
      const payload = {
        code: form.code,
        nameAr: form.nameAr,
        governorate: form.governorate || null,
        area: form.area || null,
        supportsBagged: form.supportsBagged,
        supportsBulk: form.supportsBulk,
        displayOrder: parseInt(form.displayOrder) || 0,
      };
      if (editing) {
        // للتبسيط نرسل categoryIds كما هي
        await client.put(`/sources/${editing.id}`, payload);
      } else {
        await client.post('/sources', payload);
      }
      setShowModal(false);
      load();
    } catch (err) {
      alert(handleError(err));
    }
  };

  const remove = async (s) => {
    if (!window.confirm(`حذف ${s.name_ar}؟`)) return;
    try {
      await client.delete(`/sources/${s.id}`);
      load();
    } catch (err) {
      alert(handleError(err));
    }
  };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="table-container">
        <div className="table-header">
          <h3>المصانع ({sources.length})</h3>
          {hasRole('admin') && (
            <button className="btn btn-primary" onClick={openAdd}>
              ➕ إضافة مصنع
            </button>
          )}
        </div>

        {sources.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🏭</div>
            <p>لا توجد مصانع</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>الرمز</th>
                <th>الاسم</th>
                <th>المحافظة</th>
                <th>الأنواع</th>
                <th>الحالة</th>
                {hasRole('admin') && <th>إجراءات</th>}
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id}>
                  <td><strong>{s.code}</strong></td>
                  <td>{s.name_ar}</td>
                  <td>{s.governorate || '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {(s.categories || []).map((c) => (
                        <span
                          key={c.code}
                          className="badge"
                          style={{ background: c.color || '#6c757d', color: c.code === 'WPC' ? '#000' : '#fff' }}
                        >
                          {c.code}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${s.status === 'active' ? 'badge-approved' : 'badge-cancelled'}`}>
                      {s.status === 'active' ? 'نشط' : 'موقوف'}
                    </span>
                  </td>
                  {hasRole('admin') && (
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(s)} style={{ marginLeft: 4 }}>
                        ✏️ تعديل
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => remove(s)}>
                        🗑
                      </button>
                    </td>
                  )}
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
              <h3>{editing ? 'تعديل مصنع' : 'إضافة مصنع'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">الرمز *</label>
                  <input
                    className="form-input"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                    placeholder="AMR"
                    disabled={!!editing}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">الاسم *</label>
                  <input
                    className="form-input"
                    value={form.nameAr}
                    onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
                    placeholder="مصنع عمران للأسمنت"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">المحافظة</label>
                  <input
                    className="form-input"
                    value={form.governorate}
                    onChange={(e) => setForm({ ...form, governorate: e.target.value })}
                    placeholder="عمران"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">المنطقة</label>
                  <input
                    className="form-input"
                    value={form.area}
                    onChange={(e) => setForm({ ...form, area: e.target.value })}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 20, marginTop: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={form.supportsBagged}
                    onChange={(e) => setForm({ ...form, supportsBagged: e.target.checked })}
                  />
                  يدعم الأكياس
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={form.supportsBulk}
                    onChange={(e) => setForm({ ...form, supportsBulk: e.target.checked })}
                  />
                  يدعم السائب
                </label>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>إلغاء</button>
              <button className="btn btn-primary" onClick={save}>
                {editing ? 'تحديث' : 'إضافة'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
