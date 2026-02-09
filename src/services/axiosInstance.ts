// src/services/axiosInstance.ts
// Ported from web - adapted for React Native with SecureStore

import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// API Base URL Configuration
// - Android Emulator uses 10.0.2.2 to reach host's localhost
// - iOS Simulator uses localhost directly
// - Physical devices need your computer's actual IP address
const getBaseUrl = (): string => {
  if (__DEV__) {
    // Development mode
    if (Platform.OS === 'android') {
      // Android Emulator
      return 'http://10.0.2.2:8080/api';
    } else if (Platform.OS === 'ios') {
      // iOS Simulator
      return 'http://localhost:8080/api';
    } else {
      // Physical device - UPDATE THIS to your computer's local IP
      // Find it with: ifconfig | grep "inet " (Mac) or ipconfig (Windows)
      // Example: return 'http://192.168.1.100:8080/api';
      return 'http://localhost:8080/api';
    }
  }
  
  // Production - update this when you deploy
  return 'https://your-production-api.com/api';
};

const API_BASE_URL = 'http://192.168.1.154:8080/api'; 

const axiosInstance: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

// Request interceptor: Attach token
axiosInstance.interceptors.request.use(
  async (config: InternalAxiosRequestConfig): Promise<InternalAxiosRequestConfig> => {
    try {
      const token = await SecureStore.getItemAsync('token');
      
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }

      // Let axios set Content-Type for FormData (file uploads)
      if (config.data instanceof FormData) {
        delete config.headers['Content-Type'];
      } else {
        config.headers['Content-Type'] = 'application/json';
      }

      // Log requests in development
      if (__DEV__) {
        console.log(`[API Request] ${config.method?.toUpperCase()} ${config.url}`);
      }

      return config;
    } catch (error) {
      console.error('Request interceptor error:', error);
      return config;
    }
  },
  (error) => Promise.reject(error)
);

// Response interceptor: Handle 401s
axiosInstance.interceptors.response.use(
  (response: AxiosResponse): AxiosResponse => {
    if (__DEV__) {
      console.log(`[API Response] ${response.status} ${response.config.url}`);
    }
    return response;
  },
  async (error) => {
    if (error.response?.status === 401) {
      console.log('[API] 401 Unauthorized - clearing token');
      await SecureStore.deleteItemAsync('token');
      // Note: Navigation to login screen will be handled by AuthContext/navigation
      // We don't have window.location in React Native
    }

    if (__DEV__) {
      console.error(`[API Error] ${error.response?.status || 'Network'} ${error.config?.url}`, 
        error.response?.data || error.message
      );
    }

    return Promise.reject(error);
  }
);

// Helper function to get current base URL (useful for debugging)
export const getApiBaseUrl = (): string => API_BASE_URL;

// function to call the local server

export const getMediaUrl = (path: string | null | undefined): string | undefined => {
  if (!path) return undefined;
  if (path.startsWith('http')) return path; 
  return `http://192.168.1.154:8080${path}`;
};

// Logout helper
export const logoutUser = async (): Promise<void> => {
  try {
    await axiosInstance.post('/auth/logout');
  } catch (err) {
    console.warn('Logout request failed', err);
  } finally {
    await SecureStore.deleteItemAsync('token');
  }
};

export default axiosInstance;