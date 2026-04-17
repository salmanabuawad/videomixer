import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
});

// Attach auth token to every request
api.interceptors.request.use((config) => {
  const raw = localStorage.getItem('app-session');
  if (raw) {
    try {
      const sess = JSON.parse(raw);
      if (sess?.token) {
        config.headers.Authorization = `Bearer ${sess.token}`;
      }
    } catch { /* ignore */ }
  }
  return config;
});

// On 401, clear session and reload to Login
api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401) {
      localStorage.removeItem('app-session');
      window.location.reload();
    }
    return Promise.reject(err);
  },
);

export default api;
