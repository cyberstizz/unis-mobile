// src/context/AuthContext.tsx
// Ported from web - uses SecureStore instead of localStorage

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import axiosInstance from '../services/axiosInstance';

// Types
interface User {
  userId: string;
  username?: string;
  email?: string;
  jurisdiction?: {
    jurisdictionId: string;
    name?: string;
  };
  supportedArtistId?: string | null;
  isArtist?: boolean;
  // Add other user fields as needed
}

interface LoginCredentials {
  email: string;
  password: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (credentials: LoginCredentials) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Hook to use auth context
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

// Decode JWT token to extract userId
// Note: React Native doesn't have atob(), so we decode base64 manually
const decodeToken = (token: string): string | null => {
  try {
    const payload = token.split('.')[1];
    // Base64 decode for React Native
    const decoded = decodeBase64(payload);
    const parsed = JSON.parse(decoded);
    return parsed.userId;
  } catch (e) {
    console.error('Token decode failed', e);
    return null;
  }
};

// Base64 decode helper (React Native compatible)
const decodeBase64 = (input: string): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let str = input.replace(/=+$/, '');
  let output = '';

  if (str.length % 4 === 1) {
    throw new Error('Invalid base64 string');
  }

  for (let bc = 0, bs = 0, buffer, i = 0; (buffer = str.charAt(i++)); ) {
    buffer = chars.indexOf(buffer);
    if (buffer === -1) continue;
    bs = bc % 4 ? bs * 64 + buffer : buffer;
    if (bc++ % 4) {
      output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)));
    }
  }

  return output;
};

// Provider component
interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount, check token + fetch profile if present
  useEffect(() => {
    const initAuth = async () => {
      try {
        const token = await SecureStore.getItemAsync('token');
        
        if (token) {
          const userId = decodeToken(token);
          
          if (userId) {
            try {
              const res = await axiosInstance.get(`/v1/users/profile/${userId}`);
              setUser(res.data);
            } catch (err: any) {
              if (err.response?.status === 401 || err.response?.status === 404) {
                await SecureStore.deleteItemAsync('token');
              }
              console.error('Failed to fetch user profile:', err);
            }
          } else {
            await SecureStore.deleteItemAsync('token');
          }
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  const login = async (credentials: LoginCredentials): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await axiosInstance.post('/auth/login', credentials);
      await SecureStore.setItemAsync('token', response.data.token);

      const userId = decodeToken(response.data.token);
      
      if (userId) {
        const profileRes = await axiosInstance.get(`/v1/users/profile/${userId}`);
        setUser(profileRes.data);
        return { success: true };
      } else {
        throw new Error('Invalid token');
      }
    } catch (error: any) {
      await SecureStore.deleteItemAsync('token');
      return { 
        success: false, 
        error: error.response?.data?.message || error.message || 'Login failed' 
      };
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await axiosInstance.post('/auth/logout');
    } catch (err) {
      console.warn('Logout request failed', err);
    } finally {
      await SecureStore.deleteItemAsync('token');
      setUser(null);
      // Navigation will be handled by the component that calls logout
      // In React Native, we don't use window.location.href
    }
  };

  const refreshUser = async (): Promise<void> => {
    try {
      const token = await SecureStore.getItemAsync('token');
      if (token) {
        const userId = decodeToken(token);
        if (userId) {
          const res = await axiosInstance.get(`/v1/users/profile/${userId}`);
          setUser(res.data);
        }
      }
    } catch (error) {
      console.error('Failed to refresh user:', error);
    }
  };

  const value: AuthContextType = { 
    user, 
    login, 
    logout, 
    loading,
    refreshUser
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;