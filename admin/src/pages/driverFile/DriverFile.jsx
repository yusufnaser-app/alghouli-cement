import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import client, { handleError } from '../../api/client';
import InfoTab from './tabs/InfoTab';
import VehiclesTab from './tabs/VehiclesTab';
import TripsTab from './tabs/TripsTab';
import LedgerTab from './tabs/LedgerTab';
import TransfersTab from './tabs/TransfersTab';
import ActivityTab from './tabs/ActivityTab';

export default function DriverFile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState('info');
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [id]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await client.get('/driver-file/' + id + '/profile');
      setProfile(res.data.data);
    } catch (err) {
      alert(handleError(err));
    } finally {
      setLoading(false);
    }
  };

  const fmt = (n) => (parseFloat(n) || 0).toLocaleString('en-US');

  const statusColor = (s) => ({
    'available': '#28A745',
    'busy': '#FFA000',
    'inactive': '#9E9E9E',
  }[s] || '#9E9E9E');

  const statusAr = (s) => ({
    'available': 'متاح',
    'busy': 'مشغول',
    'inactive': 'غير نشط',
  }[s] || s);

  if (loading) return <div className="loading"><div className="spinner"></div></div>;
  if (!profile) return <div className="empty-state"><p>السائق غير موجود</p></div>;

  const totalDue = parseFloat(profile.total_dues || 0);
  const totalPaid = parseFloat(profile.total_paid || 0);
  const totalAdvances = parseFloat(profile.total_advances || 0);
  const totalDeductions = parseFloat(profile.total_deductions || 0);
  const remaining = parseFloat(profile.current_balance || 0);

  const tabs = [
    { key: 'info', label: 'المعلومات', icon: '👤' },
    { key: 'vehicles', label: 'القاطرات', icon: '🚛' },
    { key: 'trips', label: 'الرحلات', icon: '📄' },
    { key: 'ledger', label: 'الحساب المالي', icon: '💰' },
    { key: 'transfers', label: 'التحويلات', icon: '💳' },
    { key: 'activity', label: 'السجل', icon: '🕒' },
  ];

  return (
    <div>
      {/* زر الرجوع */}
      <div style={{ marginBottom: 16 }}>
        <button className="btn btn-secondary btn-sm" onClick={() => navigate('/drivers')}>
          ← رجوع للسائقين
        </button>
      </div>

      {/* رأس الصفحة */}
      <div className="card mb-2" style={{
        background: 'linear-gradient(135deg, #1A3A5C, #2E5984)',
        color: 'white',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
          {/* الصورة والاسم */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, minWidth: 280 }}>
            <div style={{
              width: 80, height: 80, borderRadius: 20,
              background: 'white', color: '#1A3A5C',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 40,
            }}>👤</div>
            <div>
              <h2 style={{ color: 'white', fontSize: 22, marginBottom: 4 }}>
                {profile.full_name}
              </h2>
              <div style={{ fontSize: 13, opacity: 0.85 }}>📱 {profile.phone}</div>
              {profile.vehicles?.[0] && (
                <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>
                  🚛 القاطرة: {profile.vehicles[0].plate_number}
                </div>
              )}
              <div style={{
                display: 'inline-block', padding: '4px 12px', borderRadius: 20,
                background: statusColor(profile.status),
                fontSize: 11, fontWeight: 'bold', marginTop: 8,
              }}>
                {statusAr(profile.status)}
              </div>
            </div>
          </div>

          {/* الإحصائيات */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, minWidth: 300 }}>
            <div style={{ background: 'rgba(255,255,255,0.15)', padding: 12, borderRadius: 10 }}>
              <div style={{ fontSize: 11, opacity: 0.8 }}>إجمالي المستحق</div>
              <div style={{ fontSize: 18, fontWeight: 'bold' }}>{fmt(totalDue)}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.15)', padding: 12, borderRadius: 10 }}>
              <div style={{ fontSize: 11, opacity: 0.8 }}>المدفوع</div>
              <div style={{ fontSize: 18, fontWeight: 'bold' }}>{fmt(totalPaid)}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.15)', padding: 12, borderRadius: 10 }}>
              <div style={{ fontSize: 11, opacity: 0.8 }}>المتبقي</div>
              <div style={{ fontSize: 18, fontWeight: 'bold', color: '#FFD54F' }}>
                {fmt(remaining)}
              </div>
            </div>
          </div>
        </div>

        {/* إحصائيات إضافية */}
        <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap', fontSize: 13, opacity: 0.9 }}>
          <span>📄 {profile.total_trips || 0} رحلة</span>
          <span>🟢 {profile.active_trips || 0} نشطة</span>
          <span>📉 سلف: {fmt(totalAdvances)}</span>
          <span>💸 خصومات: {fmt(totalDeductions)}</span>
        </div>
      </div>

      {/* التبويبات */}
      <div className="card mb-2" style={{ padding: 8 }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {tabs.map((t) => (
            <button
              key={t.key}
              className={'btn ' + (tab === t.key ? 'btn-primary' : 'btn-secondary')}
              onClick={() => setTab(t.key)}
              style={{ fontSize: 13, padding: '8px 16px' }}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* المحتوى */}
      <div>
        {tab === 'info' && <InfoTab profile={profile} onReload={load} />}
        {tab === 'vehicles' && <VehiclesTab profile={profile} onReload={load} />}
        {tab === 'trips' && <TripsTab driverId={id} />}
        {tab === 'ledger' && <LedgerTab driverId={id} profile={profile} />}
        {tab === 'transfers' && <TransfersTab driverId={id} profile={profile} onReload={load} />}
        {tab === 'activity' && <ActivityTab driverId={id} />}
      </div>
    </div>
  );
}
