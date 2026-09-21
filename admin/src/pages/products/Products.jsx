import { useEffect, useState } from 'react';
import client, { handleError } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

export default function Products() {
  const { hasRole } = useAuth();
  const [products, setProducts] = useState([]);
  const [sources, setSources] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState({ source: '', category: '', packaging: '' });
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    nameAr: '',
    sourceId: '',
    categoryId: '',
    grade: '',
    packagingType: 'bagged',
    bagWeightKg: 50,
    minOrderQty: 10,
    status: 'available',
    initialQty: 0,
  });

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [p, s, c] = await Promise.all([
        client.get('/products'),
        client.get('/sources'),
        client.get('/categories'),
      ]);
      setProducts(p.data.data);
      setSources(s.data.data);
      setCategories(c.data.data);
    } catch (err) {
      setError(handleError(err));
    } finally {
      setLoading(false);
    }
  };

  const filtered = products.filter((p) => {
    if (filter.source && p.source_code !== filter.source) return false;
    if (filter.category && p.category_code !== filter.category) return false;
    if (filter.packaging && p.packaging_type !== filter.packaging) return false;
    return true;
  });

  const openAdd = () => {
    setEditing(null);
    setForm({
      nameAr: '',
      sourceId: sources[0]?.id || '',
      categoryId: categories[0]?.id || '',
      grade: '42.5',
      packagingType: 'bagged',
      bagWeightKg: 50,
      minOrderQty: 10,
      status: 'available',
      initialQty: 0,
    });
    setShowModal(true);
  };

  const openEdit = (p) => {
    setEditing(p);
    setForm({
      nameAr: p.name_ar || '',
      sourceId: p.source_id || '',
      categoryId: p.category_id || '',
      grade: p.grade || '',
      packagingType: p.packaging_type || 'bagged',
      bagWeightKg: parseFloat(p.bag_weight_kg) || 50,
      minOrderQty: p.min_order_qty || 10,
      status: p.status || 'available',
      initialQty: 0,
    });
    setShowModal(true);
  };

  const save = async () => {
    if (!form.nameAr) { alert('الاسم مطلوب'); return; }
    if (!form.sourceId || !form.categoryId) { alert('المصنع والنوع مطلوبان'); return; }

    try {
      const payload = {
        nameAr: form.nameAr,
        sourceId: form.sourceId,
        categoryId: form.categoryId,
        grade: form.grade || null,
        packagingType: form.packagingType,
        bagWeightKg: form.packagingType === 'bagged' ? parseFloat(form.bagWeightKg) : null,
        minOrderQty: parseInt(form.minOrderQty) || 1,
        status: form.status,
      };

      if (editing) {
        await client.put(`/products/${editing.id}`, payload);
      } else {
        payload.initialQty = parseFloat(form.initialQty) || 0;
        await client.post('/products', payload);
      }

      setShowModal(false);
      load();
    } catch (err) {
      alert(handleError(err));
    }
  };

  const remove = async (p) => {
    if (!window.confirm(`حذف ${p.name_ar}؟`)) return;
    try {
      await client.delete(`/products/${p.id}`);
      load();
    } catch (err) {
      alert(handleError(err));
    }
  };

  const fmt = (n) => {
    const v = parseFloat(n) || 0;
    return v.toLocaleString('en-US');
  };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="card mb-2">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <select
            className="form-select"
            style={{ maxWidth: 200 }}
            value={filter.source}
            onChange={(e) => setFilter({ ...filter, source: e.target.value })}
          >
            <option value="">كل المصانع</option>
            {sources.map((s) => (
              <option key={s.id} value={s.code}>{s.name_ar}</option>
            ))}
          </select>

          <select
            className="form-select"
            style={{ maxWidth: 150 }}
            value={filter.category}
            onChange={(e) => setFilter({ ...filter, category: e.target.value })}
          >
            <option value="">كل الأنواع</option>
            {categories.map((c) => (
              <option key={c.id} value={c.code}>{c.name_ar}</option>
            ))}
          </select>

          <select
            className="form-select"
            style={{ maxWidth: 150 }}
            value={filter.packaging}
            onChange={(e) => setFilter({ ...filter, packaging: e.target.value })}
          >
            <option value="">الكل</option>
            <option value="bagged">أكياس</option>
            <option value="bulk">سائب</option>
          </select>

          <div style={{ flex: 1 }}></div>
          {hasRole('admin', 'inventory') && (
            <button className="btn btn-primary" onClick={openAdd}>➕ إضافة منتج</button>
          )}
        </div>
      </div>

      <div className="table-container">
        <div className="table-header">
          <h3>المنتجات ({filtered.length})</h3>
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <p>لا توجد منتجات</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>المنتج</th>
                <th>المصنع</th>
                <th>النوع</th>
                <th>التعبئة</th>
                <th>السعر</th>
                <th>المخزون</th>
                <th>الحالة</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const price = p.prices?.[0]?.price || 0;
                return (
                  <tr key={p.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.name_ar}</div>
                      {p.grade && <div style={{ fontSize: 11, color: '#999' }}>درجة {p.grade}</div>}
                    </td>
                    <td>{p.source_name}</td>
                    <td>
                      <span
                        className="badge"
                        style={{ background: p.category_color, color: p.category_code === 'WPC' ? '#000' : '#fff' }}
                      >
                        {p.category_code}
                      </span>
                    </td>
                    <td>{p.packaging_type === 'bagged' ? '📦 أكياس' : '🚛 سائب'}</td>
                    <td><strong className="text-primary">{fmt(price)} ر.ي</strong></td>
                    <td>{fmt(p.available_qty)} {p.unit === 'bag' ? 'كيس' : 'طن'}</td>
                    <td>
                      <span className={`badge ${p.status === 'available' ? 'badge-approved' : 'badge-cancelled'}`}>
                        {p.status === 'available' ? 'متوفر' : 'موقوف'}
                      </span>
                    </td>
                    <td>
                      {hasRole('admin', 'inventory') && (
                        <>
                          <button className="btn btn-secondary btn-sm" onClick={() => openEdit(p)} style={{ marginLeft: 4 }}>
                            ✏️
                          </button>
                          {hasRole('admin') && (
                            <button className="btn btn-danger btn-sm" onClick={() => remove(p)}>🗑</button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 700 }}>
            <div className="modal-header">
              <h3>{editing ? 'تعديل منتج' : 'إضافة منتج'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">اسم المنتج *</label>
                <input
                  className="form-input"
                  value={form.nameAr}
                  onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
                  placeholder="أسمنت عمران بورتلاندي 42.5 - كيس 50 كجم"
                />
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">المصنع *</label>
                  <select
                    className="form-select"
                    value={form.sourceId}
                    onChange={(e) => setForm({ ...form, sourceId: e.target.value })}
                  >
                    <option value="">اختر مصنعًا</option>
                    {sources.map((s) => (
                      <option key={s.id} value={s.id}>{s.name_ar}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">النوع *</label>
                  <select
                    className="form-select"
                    value={form.categoryId}
                    onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                  >
                    <option value="">اختر نوعًا</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name_ar}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">الدرجة</label>
                  <input
                    className="form-input"
                    value={form.grade}
                    onChange={(e) => setForm({ ...form, grade: e.target.value })}
                    placeholder="42.5"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">التعبئة *</label>
                  <select
                    className="form-select"
                    value={form.packagingType}
                    onChange={(e) => setForm({ ...form, packagingType: e.target.value })}
                  >
                    <option value="bagged">أكياس</option>
                    <option value="bulk">سائب</option>
                  </select>
                </div>

                {form.packagingType === 'bagged' && (
                  <div className="form-group">
                    <label className="form-label">وزن الكيس (كجم)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={form.bagWeightKg}
                      onChange={(e) => setForm({ ...form, bagWeightKg: e.target.value })}
                    />
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">الحد الأدنى للطلب</label>
                  <input
                    type="number"
                    className="form-input"
                    value={form.minOrderQty}
                    onChange={(e) => setForm({ ...form, minOrderQty: e.target.value })}
                  />
                </div>

                {!editing && (
                  <div className="form-group">
                    <label className="form-label">المخزون الابتدائي</label>
                    <input
                      type="number"
                      className="form-input"
                      value={form.initialQty}
                      onChange={(e) => setForm({ ...form, initialQty: e.target.value })}
                    />
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">الحالة</label>
                  <select
                    className="form-select"
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                  >
                    <option value="available">متوفر</option>
                    <option value="unavailable">غير متوفر</option>
                    <option value="suspended">موقوف</option>
                  </select>
                </div>
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
