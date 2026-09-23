import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Sources from './pages/sources/Sources';
import Categories from './pages/categories/Categories';
import Products from './pages/products/Products';
import Orders from './pages/orders/Orders';
import PendingCredit from './pages/pendingCredit/PendingCredit';
import Payments from './pages/payments/Payments';
import Customers from './pages/customers/Customers';
import Traders from './pages/traders/Traders';
import TraderDetails from './pages/traderDetails/TraderDetails';
import Drivers from './pages/drivers/Drivers';
import Vehicles from './pages/vehicles/Vehicles';
import Reports from './pages/reports/Reports';
import Settings from './pages/settings/Settings';
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
    <p>قيد الإنشاء</p>
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
          <Route path="/orders" element={<ProtectedRoute><Orders /></ProtectedRoute>} />
          <Route path="/pending-credit" element={<ProtectedRoute><PendingCredit /></ProtectedRoute>} />
          <Route path="/payments" element={<ProtectedRoute><Payments /></ProtectedRoute>} />
          <Route path="/customers" element={<ProtectedRoute><Customers /></ProtectedRoute>} />
          <Route path="/traders" element={<ProtectedRoute><Traders /></ProtectedRoute>} />
          <Route path="/traders/:id" element={<ProtectedRoute><TraderDetails /></ProtectedRoute>} />
          <Route path="/drivers" element={<ProtectedRoute><Drivers /></ProtectedRoute>} />
          <Route path="/vehicles" element={<ProtectedRoute><Vehicles /></ProtectedRoute>} />
          <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          <Route path="/deliveries" element={<ProtectedRoute><Placeholder icon="🚚" title="التوصيل" /></ProtectedRoute>} />
          <Route path="/transport-rates" element={<ProtectedRoute><Placeholder icon="💵" title="أسعار النقل" /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </HashRouter>
  );
}
