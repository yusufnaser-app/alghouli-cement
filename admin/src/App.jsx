import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Sources from './pages/sources/Sources';
import Categories from './pages/categories/Categories';
import Products from './pages/products/Products';
import './index.css';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading"><div className="spinner"></div></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return children;
}

const Placeholder = ({ icon, title }) => (
  <div style={{ padding: 60, textAlign: 'center', color: '#999' }}>
    <div style={{ fontSize: 60, marginBottom: 16 }}>{icon}</div>
    <h2>{title}</h2>
    <p>قيد الإنشاء — المرحلة القادمة</p>
  </div>
);

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/products" element={<ProtectedRoute><Products /></ProtectedRoute>} />
          <Route path="/sources" element={<ProtectedRoute><Sources /></ProtectedRoute>} />
          <Route path="/categories" element={<ProtectedRoute><Categories /></ProtectedRoute>} />
          <Route path="/orders" element={<ProtectedRoute><Placeholder icon="📦" title="الطلبات" /></ProtectedRoute>} />
          <Route path="/payments" element={<ProtectedRoute><Placeholder icon="💰" title="المدفوعات" /></ProtectedRoute>} />
          <Route path="/customers" element={<ProtectedRoute><Placeholder icon="👥" title="العملاء" /></ProtectedRoute>} />
          <Route path="/drivers" element={<ProtectedRoute><Placeholder icon="🧑‍✈️" title="السائقون" /></ProtectedRoute>} />
          <Route path="/vehicles" element={<ProtectedRoute><Placeholder icon="🚛" title="الشاحنات" /></ProtectedRoute>} />
          <Route path="/deliveries" element={<ProtectedRoute><Placeholder icon="🚚" title="التوصيل" /></ProtectedRoute>} />
          <Route path="/reports" element={<ProtectedRoute><Placeholder icon="📈" title="التقارير" /></ProtectedRoute>} />
          <Route path="/inventory" element={<ProtectedRoute><Placeholder icon="📦" title="المخزون" /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><Placeholder icon="⚙️" title="الإعدادات" /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </HashRouter>
  );
}
