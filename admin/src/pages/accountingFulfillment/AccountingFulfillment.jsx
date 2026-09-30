import { useEffect, useState } from 'react';
import client, { handleError } from '../../api/client';

const fmt=(v)=>(Number(v)||0).toLocaleString('en-US');

export default function AccountingFulfillment(){
  const [rows,setRows]=useState([]),[selected,setSelected]=useState(null),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState('');
  const load=async()=>{setLoading(true);setError('');try{const r=await client.get('/accounting/fulfillment/awaiting-posting');setRows(r.data.data||[]);}catch(e){setError(handleError(e));}finally{setLoading(false);}};
  useEffect(()=>{load();},[]);
  const open=async(id)=>{try{const r=await client.get(`/accounting/fulfillment/orders/${id}`);setSelected(r.data.data);}catch(e){alert(handleError(e));}};
  const post=async()=>{if(!selected?.order?.id)return;if(!window.confirm('تثبيت وترحيل هذا الطلب محاسبيًا؟'))return;setSaving(true);try{await client.post(`/accounting/fulfillment/orders/${selected.order.id}/post`,{notes:'ترحيل من شاشة المحاسبة'});alert('تم الترحيل بنجاح');setSelected(null);load();}catch(e){alert(handleError(e));}finally{setSaving(false);}};
  if(loading)return <div className="loading"><div className="spinner"></div></div>;
  return <div>
    <div className="card mb-2"><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}><div><h3>📚 ترحيل التحميل الفعلي</h3><p style={{color:'#777',fontSize:13}}>الطلبات التي تم تحميلها ولم تُرحّل حسابيًا.</p></div><button className="btn btn-secondary" onClick={load}>🔄 تحديث</button></div></div>
    {error&&<div className="alert alert-error">{error}</div>}
    {rows.length===0?<div className="card"><div className="empty-state"><div className="empty-state-icon">✅</div><p>لا توجد عمليات بانتظار الترحيل</p></div></div>:
    <div className="table-container"><table><thead><tr><th>الطلب</th><th>التاجر</th><th>المصنع</th><th>الفاكس</th><th>المطلوب</th><th>المحمّل</th><th>الإجراء</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td><strong>{r.order_number}</strong></td><td>{r.customer_name||'—'}</td><td>{r.factory_name||'—'}</td><td>{r.fax_number||'—'}</td><td>{fmt(r.requested_quantity)}</td><td><strong>{fmt(r.loaded_quantity)}</strong></td><td><button className="btn btn-primary btn-sm" onClick={()=>open(r.id)}>👁 الحساب</button></td></tr>)}</tbody></table></div>}
    {selected&&<div className="modal-overlay" onClick={()=>setSelected(null)}><div className="modal" style={{maxWidth:850}} onClick={e=>e.stopPropagation()}><div className="modal-header"><h3>حساب الطلب {selected.order.order_number}</h3><button className="modal-close" onClick={()=>setSelected(null)}>×</button></div><div className="modal-body">
      <div className="grid-2"><div className="card"><h4>النتيجة النهائية</h4><p>الكمية المحملة: <strong>{fmt(selected.order.final_loaded_quantity)}</strong></p><p>قيمة الأسمنت: <strong>{fmt(selected.order.final_subtotal)}</strong></p><p>النقل: <strong>{fmt(selected.order.final_shipping_amount)}</strong></p><p>الإجمالي: <strong>{fmt(selected.order.final_total_amount)}</strong></p><p>المتبقي: <strong>{fmt(selected.order.final_remaining_amount)}</strong></p><p>الحالة المحاسبية: <strong>{selected.order.accounting_status}</strong></p></div>
      <div className="card"><h4>قيد المصنع</h4>{selected.factory_ledger.map(x=><p key={x.id}>{x.factory_name}: <strong>{fmt(x.quantity)}</strong> {x.unit}</p>)}{!selected.factory_ledger.length&&<p>لا يوجد</p>}<h4 style={{marginTop:16}}>أجور النقل</h4>{selected.driver_ledger.map(x=><p key={x.id}>{x.driver_name}: <strong>{fmt(x.debit)}</strong> ريال</p>)}{!selected.driver_ledger.length&&<p>لا يوجد استحقاق سائق</p>}</div></div>
      <div className="card mt-2"><h4>كشف التاجر</h4><div className="table-container"><table><thead><tr><th>النوع</th><th>مدين</th><th>دائن</th><th>الرصيد</th><th>البيان</th></tr></thead><tbody>{selected.customer_ledger.map(x=><tr key={x.id}><td>{x.transaction_type}</td><td>{fmt(x.debit)}</td><td>{fmt(x.credit)}</td><td>{fmt(x.balance_after)}</td><td>{x.description}</td></tr>)}</tbody></table></div></div>
    </div><div className="modal-footer"><button className="btn btn-secondary" onClick={()=>setSelected(null)}>إغلاق</button>{!selected.posting&&<button className="btn btn-success" disabled={saving} onClick={post}>{saving?'جاري الترحيل...':'✅ ترحيل محاسبي'}</button>}</div></div></div>}
  </div>;
}
