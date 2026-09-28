import axios from 'axios';

export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000';

const api = axios.create({
  baseURL: BACKEND_URL,
  timeout: 45000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to dynamically inject the JWT Bearer token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('omnibrain_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to handle common error codes
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Clear token on authentication failure
      localStorage.removeItem('omnibrain_token');
      localStorage.removeItem('omnibrain_user');
    }
    return Promise.reject(error);
  }
);

// Authentication Endpoints
export const authApi = {
  login: async (credentials) => {
    const res = await api.post('/api/v1/auth/login', credentials);
    return res.data;
  },
  register: async (userData) => {
    const res = await api.post('/api/v1/auth/register', userData);
    return res.data;
  },
  getMe: async () => {
    const res = await api.get('/api/v1/auth/me');
    return res.data;
  },
  saveSettings: async (settings) => {
    const res = await api.post('/api/v1/user/settings', settings);
    return res.data;
  },
};

// Document & Ingestion Endpoints
export const documentsApi = {
  uploadFile: async (file, onUploadProgress) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await api.post('/api/v1/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress,
    });
    return res.data;
  },
  getStatus: async (jobId) => {
    const res = await api.get(`/api/v1/status/${jobId}`);
    return res.data;
  },
  list: async () => {
    const res = await api.get('/api/v1/documents');
    return res.data;
  },
  deleteDoc: async (docId) => {
    const res = await api.delete(`/api/v1/admin/docs/${docId}`);
    return res.data;
  },
};

// Chat & Agent Orchestrator Endpoints
export const chatApi = {
  sendMessage: async (payload) => {
    const res = await api.post('/api/v1/chat', payload);
    return res.data;
  },
  getHistory: async (sessionId) => {
    const res = await api.get(`/api/v1/chat/history/${sessionId}`);
    return res.data;
  },
};

// System Health & Monitoring Endpoints
export const systemApi = {
  health: async () => {
    const res = await api.get('/health');
    return res.data;
  },
  metrics: async () => {
    const res = await api.get('/api/v1/admin/metrics');
    return res.data;
  },
};

export default api;
