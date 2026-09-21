import { createContext, useContext, useState, useEffect } from 'react';
import client from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedUser = localStorage.getItem('admin_user');
    const token = localStorage.getItem('admin_token');
    if (savedUser && token) {
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
  }, []);

  const login = async (phone, password) => {
    const response = await client.post('/auth/login', { phone, password });
    const { token, user } = response.data.data;

    const roles = user.roles || [];
    if (
      !roles.includes('admin') &&
      !roles.includes('sales') &&
      !roles.includes('accountant') &&
      !roles.includes('transport') &&
      !roles.includes('pos')
    ) {
      throw new Error('هذا الحساب لا يملك صلاحية الوصول للوحة الإدارة');
    }

    localStorage.setItem('admin_token', token);
    localStorage.setItem('admin_user', JSON.stringify(user));
    setUser(user);
    return user;
  };

  const logout = () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    setUser(null);
  };

  const hasRole = (...roles) => {
    if (!user) return false;
    const userRoles = user.roles || [];
    return userRoles.includes('admin') || roles.some((r) => userRoles.includes(r));
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
