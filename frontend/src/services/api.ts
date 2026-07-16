import axios, { InternalAxiosRequestConfig, AxiosError, AxiosResponse } from 'axios';

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
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('access_token');
    const isAuthUrl = config.url && (config.url.includes('/auth/refresh/') || config.url.includes('/auth/login/'));
    if (token && !isAuthUrl) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: AxiosError) => Promise.reject(error)
);

interface QueueItem {
  resolve: (value: unknown) => void;
  reject: (reason?: any) => void;
}

// Response interceptor to handle token refresh automatically
let isRefreshing = false;
let failedQueue: QueueItem[] = [];

const processQueue = (error: AxiosError | null, token: string | null = null) => {
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
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;

    // If we receive 401 and haven't retried yet, trigger token refresh
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      // Avoid infinite loop if refresh request itself returns 401
      const isAuthUrl = originalRequest.url && (originalRequest.url.includes('/auth/refresh/') || originalRequest.url.includes('/auth/login/'));
      if (isAuthUrl) {
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
      } catch (refreshError: any) {
        processQueue(refreshError as AxiosError, null);
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
