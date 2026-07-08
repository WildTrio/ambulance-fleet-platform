import axios from 'axios';

const backendHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

const api = axios.create({
  baseURL: `http://${backendHost}:8000/api`,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Crucial for sending/receiving HttpOnly cookies
});

// Request interceptor to attach JWT access token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to handle token refresh automatically
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If we receive 401 and haven't retried yet, trigger token refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      // Avoid infinite loop if refresh request itself returns 401
      if (originalRequest.url === '/auth/refresh/' || originalRequest.url === '/auth/login/') {
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // Post request to refresh endpoint. Cookie is sent automatically due to withCredentials
        const response = await api.post('/auth/refresh/');
        const { access } = response.data;
        
        localStorage.setItem('access_token', access);
        api.defaults.headers.common['Authorization'] = `Bearer ${access}`;
        originalRequest.headers.Authorization = `Bearer ${access}`;

        processQueue(null, access);
        isRefreshing = false;
        
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        isRefreshing = false;
        
        // Clear tokens and trigger logout event/redirect
        localStorage.removeItem('access_token');
        window.dispatchEvent(new Event('auth_session_expired'));
        
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
