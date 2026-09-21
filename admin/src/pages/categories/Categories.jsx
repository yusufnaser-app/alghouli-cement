import { useEffect, useState } from 'react';
import client, { handleError } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

export default function Categories() {
  const { hasRole } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    code: '',
    nameAr: '',
    colorCode: '#28A745',
    colorNameAr: 'أخضر',
    description: '',
    usageAr: '',
    displayOrder: 0,
  });

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await client.get('/categories');
      setItems(res.data.data);
    } catch (_) {}
    setLoading(false);
  };

  const openAdd = () => {
    setEditing(null);
    setForm({
      code: '', nameAr: '', colorCode: '#28A745', colorNameAr: 'أخضر',
      description: '', usageAr: '', displayOrder: 0,
    });
    setShowModal(true);
  };

  const openEdit = (c) => {
    setEditing(c);
    setForm({
      code: c.code,
      nameAr: c.name_ar,
      colorCode: c.color_code,
      colorNameAr: c.color_name_ar,
      description: c.description || '',
      usageAr: c.usage_ar || '',
      displayOrder: c.display_order || 0,
    });
    setShowModal(true);
  };

  const save = async () => {
    if (!form.code || !form.nameAr) {
      alert('الرمز والاسم مطلوبان');
      return;
    }
    try {
      if (editing) {
        await client.put(`/categories/${editing.id}`, form);
      } else {
        await client.post('/categories', form);
      }
      setShowModal(false);
      load();
    } catch (err) {
      alert(handleError(err));
    }
  };

  const remove = async (c) => {
    if (!window.confirm(`حذف ${c.name_ar}؟`)) return;
    try {
      await client.delete(`/categories/${c.id}`);
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
          <h3>أنواع الأسمنت ({items.length})</h3>
          {hasRole('admin') && (
            <button className="btn btn-primary" onClick={openAdd}>➕ إضافة نوع</button>
          )}
        </div>

        <div style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {items.map((c) => (
            <div
              key={c.id}
              style={{
                padding: 20,
                borderRadius: 14,
                background: 'white',
                border: `2px solid ${c.color_code}`,
                position: 'relative',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    background: c.color_code,
                    border: '1px solid rgba(0,0,0,0.1)',
                  }}
                />
                <div>
                  <h4 style={{ fontSize: 16 }}>{c.name_ar}</h4>
                  <p style={{ fontSize: 12, color: '#757575' }}>
                    {c.code} • {c.color_name_ar}
                  </p>
                </div>
              </div>
              {c.usage_ar && (
                <p style={{ fontSize: 12, color: '#757575', marginBottom: 12 }}>
                  {c.usage_ar}
                </p>
              )}
              {hasRole('admin') && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => openEdit(c)}>✏️ تعديل</button>
                  <button className="btn btn-danger btn-sm" onClick={() => remove(c)}>🗑</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editing ? 'تعديل نوع' : 'إضافة نوع'}</h3>
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
                    placeholder="OPC"
                    disabled={!!editing}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">الاسم *</label>
                  <input
                    className="form-input"
                    value={form.nameAr}
                    onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">اللون *</label>
                  <input
                    type="color"
                    className="form-input"
                    value={form.colorCode}
                    onChange={(e) => setForm({ ...form, colorCode: e.target.value })}
                    style={{ height: 50 }}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">اسم اللون *</label>
                  <input
                    className="form-input"
                    value={form.colorNameAr}
                    onChange={(e) => setForm({ ...form, colorNameAr: e.target.value })}
                    placeholder="أخضر"
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">الاستخدامات</label>
                <textarea
                  className="form-textarea"
                  value={form.usageAr}
                  onChange={(e) => setForm({ ...form, usageAr: e.target.value })}
                />
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
