import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useState, useEffect } from 'react';
import client from '../api/client';

const menuItems = [
  { section: 'الرئيسية', items: [
    { path: '/', label: 'لوحة المعلومات', icon: '📊', roles: [] },
    { path: '/operations', label: 'مركز التشغيل', icon: '⚡', roles: ['transport', 'admin', 'sales'], badge: 'faxes' },
  ]},
  { section: 'العمليات', items: [
    { path: '/orders', label: 'الطلبات', icon: '📦', roles: ['sales', 'admin'] },
    { path: '/pending-credit', label: 'طلبات بانتظار الموافقة', icon: '⏳', roles: ['admin'], badge: 'pending' },
    { path: '/payments', label: 'المدفوعات', icon: '💰', roles: ['accountant', 'admin'] },
  ]},
  { section: 'الإدارة', items: [
    { path: '/products', label: 'المنتجات', icon: '📋', roles: ['admin', 'inventory'] },
    { path: '/sources', label: 'المصانع', icon: '🏭', roles: ['admin'] },
    { path: '/categories', label: 'الأنواع', icon: '🎨', roles: ['admin'] },
    { path: '/traders', label: 'الموزعون', icon: '👥', roles: ['sales', 'accountant', 'admin'] },
    { path: '/drivers', label: 'السائقون', icon: '🧑‍✈️', roles: ['transport', 'admin'] },
    { path: '/vehicles', label: 'الشاحنات', icon: '🚛', roles: ['transport', 'admin'] },
  ]},
  { section: 'التحليلات', items: [
    { path: '/reports', label: 'التقارير', icon: '📈', roles: ['accountant', 'admin', 'sales'] },
  ]},
  { section: 'النظام', items: [
    { path: '/settings', label: 'الإعدادات', icon: '⚙️', roles: ['admin'] },
  ]},
];

const pageTitles = {
  '/': { title: 'لوحة المعلومات', subtitle: 'نظرة عامة على النشاط' },
  '/operations': { title: 'مركز التشغيل', subtitle: 'إدارة الفاكسات والرحلات' },
  '/orders': { title: 'الطلبات', subtitle: 'إدارة ومتابعة الطلبات' },
  '/pending-credit': { title: 'طلبات بانتظار الموافقة', subtitle: 'الموافقة على الطلبات الآجلة' },
  '/payments': { title: 'المدفوعات', subtitle: 'مراجعة واعتماد الدفعات' },
  '/products': { title: 'المنتجات', subtitle: 'إدارة الأسمنت والأسعار' },
  '/sources': { title: 'المصانع', subtitle: 'إدارة المصانع' },
  '/categories': { title: 'الأنواع', subtitle: 'أنواع الأسمنت والألوان' },
  '/traders': { title: 'الموزعون', subtitle: 'التجار وأرصدتهم' },
  '/drivers': { title: 'السائقون', subtitle: 'إدارة السائقين' },
  '/vehicles': { title: 'الشاحنات', subtitle: 'إدارة الشاحنات' },
  '/reports': { title: 'التقارير', subtitle: 'تحليلات المبيعات' },
  '/settings': { title: 'الإعدادات', subtitle: 'إعدادات النظام' },
};

export default function Layout({ children }) {
  const { user, logout, hasRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [faxCount, setFaxCount] = useState(0);

  useEffect(() => {
    const loadCounts = async () => {
      try {
        if (hasRole('admin')) {
          const r = await client.get('/orders/admin/pending-credit');
          setPendingCount((r.data.data || []).length);
        }
        if (hasRole('transport', 'admin', 'sales')) {
          const r = await client.get('/faxes/pending');
          setFaxCount((r.data.data || []).length);
        }
      } catch (_) {}
    };
    loadCounts();
    const iv = setInterval(loadCounts, 30000);
    return () => clearInterval(iv);
  }, [location.pathname]);

  const pageInfo = pageTitles[location.pathname] || { title: 'لوحة الإدارة', subtitle: '' };

  const handleLogout = () => {
    if (window.confirm('هل تريد تسجيل الخروج؟')) {
      logout();
      navigate('/login');
    }
  };

  const initials = user?.fullName
    ? user.fullName.split(' ').slice(0, 2).map((n) => n[0]).join('')
    : 'م';

  const userRolesAr = (user?.roles || [])
    .map((r) => ({
      admin: 'مدير',
      sales: 'مبيعات',
      accountant: 'محاسب',
      transport: 'نقل',
      inventory: 'مخزون',
      pos: 'نقطة بيع',
    }[r] || r))
    .join(' • ');

  const getBadge = (badgeType) => {
    if (badgeType === 'pending' && pendingCount > 0) return pendingCount;
    if (badgeType === 'faxes' && faxCount > 0) return faxCount;
    return 0;
  };

  return (
    <div className="layout">
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <div className="sidebar-brand-icon">🏢</div>
          <div className="sidebar-brand-text">
            <h3>مؤسسة الغولي</h3>
            <p>لوحة الإدارة</p>
          </div>
        </div>
        <nav className="sidebar-nav">
          {menuItems.map((section) => {
            const visible = section.items.filter((item) =>
              item.roles.length === 0 || hasRole(...item.roles)
            );
            if (visible.length === 0) return null;
            return (
              <div key={section.section}>
                <div className="nav-section-title">{section.section}</div>
                {visible.map((item) => {
                  const badgeCount = item.badge ? getBadge(item.badge) : 0;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      end={item.path === '/'}
                      className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                      onClick={() => setSidebarOpen(false)}
                    >
                      <span className="nav-icon">{item.icon}</span>
                      <span style={{ flex: 1 }}>{item.label}</span>
                      {badgeCount > 0 && (
                        <span style={{
                          background: '#DC3545', color: 'white', borderRadius: 12,
                          padding: '2px 8px', fontSize: 11, fontWeight: 'bold',
                          minWidth: 24, textAlign: 'center',
                        }}>{badgeCount}</span>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            );
          })}
          <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.15)' }}>
            <button className="nav-item" onClick={handleLogout}>
              <span className="nav-icon">🚪</span>
              <span>تسجيل الخروج</span>
            </button>
          </div>
        </nav>
      </aside>

      <main className="main-content">
        <div className="topbar">
          <div className="topbar-title">
            <h2>{pageInfo.title}</h2>
            {pageInfo.subtitle && <p>{pageInfo.subtitle}</p>}
          </div>
          <div className="topbar-user">
            <div className="user-info" style={{ textAlign: 'left' }}>
              <h4>{user?.fullName || 'مستخدم'}</h4>
              <p>{userRolesAr || 'بدون دور'}</p>
            </div>
            <div className="user-avatar">{initials}</div>
          </div>
        </div>
        <div className="page-content">{children}</div>
      </main>
    </div>
  );
}
