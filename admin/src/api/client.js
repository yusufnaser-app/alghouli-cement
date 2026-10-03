import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'https://alghouli-api.onrender.com/api/v1';

const client = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 60000,
});

// ═══ Interceptor: التوكن ═══
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ═══ Interceptor: 401 → logout ═══
client.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_user');
      if (!window.location.hash.includes('/login')) {
        window.location.hash = '#/login';
      }
    }
    return Promise.reject(err);
  }
);

export const api = {
  // Auth
  login: (phone, password) => client.post('/auth/login', { phone, password }),
  me: () => client.get('/auth/me'),

  // Dashboard
  dashboard: () => client.get('/admin/dashboard'),

  // Settings
  settingsList: () => client.get('/settings'),
  settingsUpdate: (data) => client.put('/settings', data),

  // Branding
  brandingPublic: () => client.get('/settings/branding'),
  brandingUpdate: (data) => client.put('/settings/branding', data),

  // Providers
  providersList: () => client.get('/settings/providers'),
  providerUpdate: (name, data) => client.put(`/settings/providers/${name}`, data),

  // Upload
  uploadImage: (file, type = 'branding') => {
    const fd = new FormData();
    fd.append('type', type);
    fd.append('file', file);
    return client.post('/files/upload', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};


// ═══ معالج الأخطاء الموحّد ═══
export function handleError(error) {
  if (error?.response?.data) {
    const d = error.response.data;
    if (Array.isArray(d.errors) && d.errors.length) {
      const details = d.errors
        .map((e) => `${e.field || e.path || ''}: ${e.message || ''}`)
        .join('\n');
      return `${d.message || 'خطأ'}\n${details}`;
    }
    return d.message || `خطأ في الخادم (${error.response.status})`;
  }
  if (error?.code === 'ERR_NETWORK' || error?.message === 'Network Error') {
    return 'تحقق من الاتصال بالإنترنت';
  }
  if (error?.code === 'ECONNABORTED') {
    return 'انتهت مهلة الاتصال بالخادم';
  }
  return error?.message || 'حدث خطأ غير متوقع';
}

export default client;
