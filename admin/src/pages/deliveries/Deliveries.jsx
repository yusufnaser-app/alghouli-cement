import { useEffect, useState } from 'react';
import client, { handleError } from '../../api/client';

export default function Deliveries() {
  const [orders, setOrders] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [selection, setSelection] = useState({});

  const load = async () => {
    setLoading(true);
    try {
      const [o, d, v] = await Promise.all([
        client.get('/deliveries/pending-assignment'),
        client.get('/drivers'),
        client.get('/vehicles'),
      ]);
      setOrders(o.data.data || []);
      setDrivers(d.data.data || []);
      setVehicles(v.data.data || []);
    } catch (err) { alert(handleError(err)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const assign = async (orderId) => {
    const s = selection[orderId] || {};
    if (!s.driverId || !s.vehicleId) return alert('اختر السائق والقاطرة');
    setSaving(orderId);
    try {
      await client.post(`/deliveries/order/${orderId}/assign`, { driverId: s.driverId, vehicleId: s.vehicleId });
      alert('تم تعيين السائق والقاطرة بنجاح');
      await load();
    } catch (err) { alert(handleError(err)); }
    finally { setSaving(null); }
  };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;
  return <div>
    <div className="card mb-2"><div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      <div><h3>🚚 طلبات توصيل مؤسسة الغولي</h3><p style={{color:'#777',fontSize:13}}>طلبات تم اعتماد دفعها وتحتاج تعيين سائق وقاطرة.</p></div>
      <button className="btn btn-secondary" onClick={load}>🔄 تحديث</button>
    </div></div>
    {orders.length === 0 ? <div className="card"><div className="empty-state"><div className="empty-state-icon">✅</div><p>لا توجد طلبات بانتظار التعيين</p></div></div> :
      <div className="table-container"><table><thead><tr><th>الطلب</th><th>العميل</th><th>المصنع</th><th>الكمية</th><th>العنوان</th><th>التعيين</th></tr></thead><tbody>
        {orders.map(o => { const s=selection[o.id]||{}; return <tr key={o.id}>
          <td><strong>{o.order_number}</strong>{o.fax_requested&&<div style={{fontSize:11,color:'#1976D2'}}>📄 مطلوب فاكس</div>}</td>
          <td>{o.customer_name}<div style={{fontSize:11,color:'#999'}}>{o.customer_phone}</div></td>
          <td>{o.factory_name}</td><td>{o.quantity} {o.unit==='ton'?'طن':'كيس'}</td>
          <td>{o.governorate} - {o.area}<div style={{fontSize:11,color:'#777'}}>{o.address_text}</div></td>
          <td style={{minWidth:260}}>
            <select className="form-select" value={s.driverId||''} onChange={e=>setSelection({...selection,[o.id]:{...s,driverId:e.target.value}})}><option value="">اختر السائق</option>{drivers.filter(d=>!d.owner_trader_id&&d.status!=='inactive').map(d=><option key={d.id} value={d.id}>{d.full_name} — {d.phone||''}</option>)}</select>
            <select className="form-select" style={{marginTop:6}} value={s.vehicleId||''} onChange={e=>setSelection({...selection,[o.id]:{...s,vehicleId:e.target.value}})}><option value="">اختر القاطرة</option>{vehicles.filter(v=>v.owner_trader_id==null&&v.status!=='inactive').map(v=><option key={v.id} value={v.id}>{v.plate_number} — {v.vehicle_type||''}</option>)}</select>
            <button className="btn btn-success btn-sm" style={{marginTop:6,width:'100%'}} disabled={saving===o.id} onClick={()=>assign(o.id)}>{saving===o.id?'جاري...':'🚛 تعيين وإكمال التجهيز'}</button>
          </td>
        </tr>})}
      </tbody></table></div>}
  </div>;
}
