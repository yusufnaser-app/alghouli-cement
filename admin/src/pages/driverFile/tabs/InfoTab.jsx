import { useState } from 'react';
import client, { handleError } from '../../../api/client';

export default function InfoTab({ profile, onReload }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    fullName: profile.full_name || '',
    phone: profile.phone || '',
    nationalId: profile.national_id || '',
    address: profile.address || '',
    licenseNumber: profile.license_number || '',
    notes: profile.notes || '',
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await client.put('/driver-file/' + profile.id + '/profile', form);
      alert('تم الحفظ');
      setEditing(false);
      onReload();
    } catch (err) {
      alert(handleError(err));
    } finally {
      setSaving(false);
    }
  };

  const driverTypeAr = (t) => ({
    'institution_driver': 'سائق مؤسسة',
    'transport_driver': 'سائق نقل مستقل',
    'trader_driver': 'سائق تاجر',
  }[t] || t);

  const approvalAr = (s) => ({
    'pending_approval': 'بانتظار الاعتماد',
    'active': 'نشط',
    'rejected': 'مرفوض',
    'suspended': 'موقوف',
  }[s] || s);

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3>👤 المعلومات الأساسية</h3>
        {!editing ? (
          <button className="btn btn-primary btn-sm" onClick={() => setEditing(true)}>
            تعديل البيانات
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>
              إلغاء
            </button>
            <button className="btn btn-success btn-sm" onClick={save} disabled={saving}>
              {saving ? '...' : 'حفظ'}
            </button>
          </div>
        )}
      </div>

      {!editing ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
          <InfoRow label="الاسم الكامل" value={profile.full_name} icon="👤" />
          <InfoRow label="رقم الهاتف" value={profile.phone} icon="📱" />
          <InfoRow label="رقم الهوية" value={profile.national_id} icon="🆔" />
          <InfoRow label="العنوان" value={profile.address} icon="📍" />
          <InfoRow label="رقم الرخصة" value={profile.license_number} icon="📄" />
          <InfoRow label="نوع السائق" value={driverTypeAr(profile.driver_type)} icon="🚛" />
          <InfoRow label="حالة الاعتماد" value={approvalAr(profile.approval_status)} icon="✅" />
          <InfoRow label="حالة العمل" value={profile.status} icon="🟢" />
          <InfoRow label="إجمالي الرحلات" value={profile.total_trips || 0} icon="📊" />
          <InfoRow label="الرحلات النشطة" value={profile.active_trips || 0} icon="🔄" />
          <InfoRow label="تاريخ التسجيل" value={profile.created_at?.substring(0, 10)} icon="📅" />
          <InfoRow label="آخر دخول" value={profile.last_login_at?.substring(0, 16) || '—'} icon="🕐" />
        </div>
      ) : (
        <div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">الاسم الكامل</label>
              <input className="form-input" value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">رقم الهاتف</label>
              <input className="form-input" value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">رقم الهوية</label>
              <input className="form-input" value={form.nationalId}
                onChange={(e) => setForm({ ...form, nationalId: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">رقم الرخصة</label>
              <input className="form-input" value={form.licenseNumber}
                onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">العنوان</label>
            <input className="form-input" value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">ملاحظات إدارية</label>
            <textarea className="form-textarea" value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value, icon }) {
  return (
    <div style={{ padding: 12, background: '#F8F9FA', borderRadius: 10 }}>
      <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600 }}>
        {value || '—'}
      </div>
    </div>
  );
}
