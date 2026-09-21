import axios from 'axios';

const API_URL =
  import.meta.env.VITE_API_URL || 'https://alghouli-api.onrender.com/api/v1';

const client = axios.create({
  baseURL: API_URL,
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export const handleError = (error) => {
  if (error.response?.data?.message) {
    return error.response.data.message;
  }
  if (error.code === 'ECONNABORTED') {
    return 'انتهت مهلة الاتصال';
  }
  return 'حدث خطأ في الاتصال';
};

export default client;
