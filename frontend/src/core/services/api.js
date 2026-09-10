/**
 * API Service
 * Axios instance with auth interceptors for communicating with the backend.
 */

import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // Send cookies with every request
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor — attach edition/festival ID and auth token
api.interceptors.request.use((config) => {
  const editionId = localStorage.getItem('currentEditionId') || localStorage.getItem('currentFestivalId');
  if (editionId) {
    config.headers['X-Edition-Id'] = editionId;
    config.headers['X-Festival-Id'] = editionId;
  }
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor — handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Session expired or invalid — redirect to login
      localStorage.removeItem('currentFestivalId');
      localStorage.removeItem('authToken');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
