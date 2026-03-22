import axios from 'axios';
import pinia from '@/stores/pinia';
import { useAuthStore } from '@/stores/auth';

const client = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: {
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
  },
});

client.interceptors.request.use((config) => {
  const auth = useAuthStore(pinia);
  if (auth.token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${auth.token}`;
  }
  return config;
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      const auth = useAuthStore(pinia);
      if (auth.token) {
        auth.logout();
      }
      if (window.location.pathname.startsWith('/admin')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

export default client;
