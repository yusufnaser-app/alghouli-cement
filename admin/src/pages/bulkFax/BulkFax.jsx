import { useEffect, useState } from 'react';
import client, { handleError } from '../../api/client';

export default function BulkFax() {
  const [drivers, setDrivers] = useState([]);
  const [factories, setFactories] = useState([]);
  const [selected, setSelected] = useState({});
  const [defaultFactory, setDefaultFactory] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [d, f] = await Promise.all([
        client.get('/bulk-faxes/suggestions'),
        client.get('/sources'),
      ]);
      setDrivers(d.data.data || []);
      setFactories(f.data.data || []);
    } catch (err) {
      alert(handleError(err));
    } finally {
      setLoading(false);
    }
  };

  const toggleDriver = (d) => {
    const n = { ...selected };
    if (n[d.driver_id]) {
      delete n[d.driver_id];
    } else {
      n[d.driver_id] = {
        driverId: d.driver_id,
        driverName: d.full_name,
        vehicleId: d.vehicle_id,
        factoryId: d.last_factory_id || defaultFactory,
        quantity: parseFloat(d.last_quantity || 0),
        notes: '',
      };
    }
    setSelected(n);
  };

  const updateItem = (driverId, field, value) => {
    setSelected({
      ...selected,
      [driverId]: { ...selected[driverId], [field]: value },
    });
  };

  const selectAll = () => {
    const all = {};
    for (const d of drivers) {
      if (d.vehicle_id) {
        all[d.driver_id] = {
          driverId: d.driver_id,
          driverName: d.full_name,
          vehicleId: d.vehicle_id,
          factoryId: d.last_factory_id || defaultFactory,
          quantity: parseFloat(d.last_quantity || 0),
          notes: '',
        };
      }
    }
    setSelected(all);
  };

  const create = async () => {
    const items = Object.values(selected).filter((x) => x.quantity > 0 && x.factoryId && x.vehicleId);
    if (items.length === 0) {
      alert('يرجى تحديد سائق واحد على الأقل');
      return;
    }
    if (!window.confirm('سيتم إنشاء ' + items.length + ' فاكس. متابعة؟')) return;

    setCreating(true);
    try {
      const res = await client.post('/bulk-faxes/create', { items });
      setResult(res.data.data);
      setSelected({});
      load();
    } catch (err) {
      alert(handleError(err));
    } finally {
      setCreating(false);
    }
  };

  const fmt = (n) => (parseFloat(n) || 0).toLocaleString('en-US');
  const selectedCount = Object.keys(selected).length;

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div>
      <div className="card mb-2">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <h3>📄 فاكس جماعي</h3>
            <p style={{ color: '#999', fontSize: 13, marginTop: 4 }}>
              اختر السائقين، حدد الكميات، أنشئ الفاكسات دفعة واحدة
            </p>
          </div>
          <select className="form-select" value={defaultFactory}
            onChange={(e) => setDefaultFactory(e.target.value)}
            style={{ maxWidth: 220 }}>
            <option value="">— اختر مصنعًا افتراضيًا —</option>
            {factories.map((f) => (
              <option key={f.id} value={f.id}>{f.name_ar}</option>
            ))}
          </select>
          <button className="btn btn-secondary" onClick={selectAll}>تحديد الكل</button>
          <button className="btn btn-secondary" onClick={() => setSelected({})}>مسح</button>
          <button className="btn btn-success" onClick={create} disabled={creating || selectedCount === 0}>
            {creating ? '...' : '💾 إنشاء ' + selectedCount + ' فاكس'}
          </button>
        </div>
      </div>

      {result && (
        <div className="card mb-2" style={{ background: '#E8F5E9' }}>
          <h4 style={{ color: '#2E7D32' }}>✅ النتائج</h4>
          <p>تم إنشاء: <strong>{result.created.length}</strong> فاكس</p>
          {result.failed.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <p style={{ color: '#C62828' }}>فشل: <strong>{result.failed.length}</strong></p>
              <ul style={{ paddingRight: 20, fontSize: 13 }}>
                {result.failed.map((f, i) => (
                  <li key={i}>{f.driverName || f.driverId} — {f.reason}</li>
                ))}
              </ul>
            </div>
          )}
          <button className="btn btn-secondary mt-2" onClick={() => setResult(null)}>إغلاق</button>
        </div>
      )}

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th style={{ width: 40 }}>✓</th>
              <th>السائق</th>
              <th>القاطرة</th>
              <th>آخر رحلة</th>
              <th>آخر كمية</th>
              <th>المصنع</th>
              <th>الكمية الجديدة</th>
            </tr>
          </thead>
          <tbody>
            {drivers.map((d) => {
              const item = selected[d.driver_id];
              const isSelected = !!item;
              return (
                <tr key={d.driver_id} style={{ background: isSelected ? '#E3F2FD' : 'white' }}>
                  <td>
                    <input type="checkbox" checked={isSelected}
                      onChange={() => toggleDriver(d)}
                      style={{ width: 18, height: 18 }} />
                  </td>
                  <td>
                    <div><strong>{d.full_name}</strong></div>
                    <div style={{ fontSize: 11, color: '#999' }}>{d.phone}</div>
                  </td>
                  <td>{d.plate_number || <span className="text-danger">لا توجد قاطرة</span>}</td>
                  <td>
                    {d.last_trip_at ? (
                      <span style={{ fontSize: 11 }}>{d.last_trip_at.substring(0, 10)}</span>
                    ) : <span style={{ color: '#999' }}>—</span>}
                  </td>
                  <td>{d.last_quantity ? fmt(d.last_quantity) : '—'}</td>
                  <td>
                    {isSelected ? (
                      <select className="form-select" value={item.factoryId || ''}
                        onChange={(e) => updateItem(d.driver_id, 'factoryId', e.target.value)}
                        style={{ minWidth: 160 }}>
                        <option value="">— اختر —</option>
                        {factories.map((f) => (
                          <option key={f.id} value={f.id}>{f.name_ar}</option>
                        ))}
                      </select>
                    ) : (
                      <span style={{ fontSize: 12, color: '#666' }}>{d.last_factory_name || '—'}</span>
                    )}
                  </td>
                  <td>
                    {isSelected ? (
                      <input type="number" className="form-input"
                        value={item.quantity || ''}
                        onChange={(e) => updateItem(d.driver_id, 'quantity', parseFloat(e.target.value) || 0)}
                        style={{ width: 120 }}
                        placeholder="0" />
                    ) : <span style={{ color: '#999' }}>—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
