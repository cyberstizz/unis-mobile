// src/context/AuthContext.tsx
// Mobile port of web src/context/AuthContext.jsx — SecureStore instead of
// localStorage, and no DOM theme attribute (screens read `theme` from here,
// see theme/unisTheme.ts).
//
// Parity with web (Nov 2026):
//   • Expired tokens (24h `exp`) are treated as no session at all, checked on
//     launch and whenever the app returns to the foreground.
//   • Staff accounts: login answers { mfaRequired, mfaToken } instead of a
//     session; LoginScreen asks for the authenticator code and finishes with
//     completeLogin(token).
//   • Sign-out resets the theme to the brand blue and clears the cached theme,
//     so the next person never inherits the last user's colours.
//   • refreshUser merges the fresh profile into the current user.

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import axiosInstance, { onSessionExpired } from '../services/axiosInstance';

// Types — the profile carries many more fields than these; anything the
// backend returns is kept.
export interface User {
  userId: string;
  username?: string;
  email?: string;
  photoUrl?: string | null;
  bio?: string | null;
  role?: string;
  genre?: any;
  jurisdiction?: {
    jurisdictionId: string;
    name?: string;
  };
  supportedArtistId?: string | null;
  isArtist?: boolean;
  phoneVerified?: boolean;
  themePreference?: string;
  adminRole?: string | null;
  [key: string]: any;
}

export interface LoginResult {
  success: boolean;
  error?: string;
  data?: any;
  /** Staff accounts: { mfaRequired, setupRequired, mfaToken } — finish with completeLogin. */
  mfa?: any;
  userId?: string;
}

interface LoginCredentials {
  email: string;
  password: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  authLoaded: boolean;
  isGuest: boolean;
  login: (credentials: LoginCredentials) => Promise<LoginResult>;
  completeLogin: (token: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  /** Current theme id — blue | orange | red | green | purple | yellow | dianna. */
  theme: string;
  /** Persists the theme to the backend (themePreference) + local cache. */
  setTheme: (themeName: string, userId: string) => Promise<void>;
}

// Same VALID_THEMES as web AuthContext — keep the two lists in sync.
const VALID_THEMES = ['blue', 'orange', 'red', 'green', 'purple', 'yellow', 'dianna'];
const THEME_STORAGE_KEY = 'unis.theme'; // SecureStore keys allow [A-Za-z0-9._-] only

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

// Base64url decode (React Native has no atob on every engine).
const decodeBase64 = (input: string): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let str = input.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  let output = '';
  if (str.length % 4 === 1) throw new Error('Invalid base64 string');
  for (let bc = 0, bs = 0, buffer: any, i = 0; (buffer = str.charAt(i++)); ) {
    buffer = chars.indexOf(buffer);
    if (buffer === -1) continue;
    bs = bc % 4 ? bs * 64 + buffer : buffer;
    if (bc++ % 4) {
      output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)));
    }
  }
  return output;
};

/** The token's claims, or null if it can't be read. */
export const readToken = (token: string): any | null => {
  try {
    return JSON.parse(decodeBase64(token.split('.')[1]));
  } catch {
    return null;
  }
};

const decodeToken = (token: string): string | null => {
  const payload = readToken(token);
  if (!payload) console.error('Token decode failed');
  return payload?.userId ?? null;
};

/** True when the token is already past its `exp` (10s skew guard). */
const isTokenExpired = (token: string): boolean => {
  const payload = readToken(token);
  if (!payload) return true;
  if (!payload.exp) return false;
  return payload.exp * 1000 <= Date.now() + 10_000;
};

const withRole = (profile: any): User => ({ ...profile, isArtist: profile?.role === 'artist' || !!profile?.genre });

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [theme, setThemeState] = useState<string>('blue');
  const userRef = useRef<User | null>(null);
  userRef.current = user;

  const applyTheme = async (themeName?: string | null) => {
    const validated = themeName && VALID_THEMES.includes(themeName) ? themeName : 'blue';
    setThemeState(validated);
    try {
      await SecureStore.setItemAsync(THEME_STORAGE_KEY, validated);
    } catch {
      /* cache failure is non-fatal */
    }
  };

  // Tears down a dead session in-app.
  const clearSession = useCallback(async () => {
    try { await SecureStore.deleteItemAsync('token'); } catch { /* ignore */ }
    try { await SecureStore.deleteItemAsync(THEME_STORAGE_KEY); } catch { /* ignore */ }
    setThemeState('blue');
    setUser(null);
  }, []);

  const setTheme = async (themeName: string, userId: string): Promise<void> => {
    await applyTheme(themeName);
    try {
      await axiosInstance.put(`/v1/users/profile/${userId}`, { themePreference: themeName });
      setUser((prev) => (prev ? { ...prev, themePreference: themeName } : prev));
    } catch (err) {
      console.error('Failed to save theme preference:', err);
    }
  };

  // Staff role — only sessions that passed two-factor carry "mfa" in the token.
  const loadAdminRole = async (token: string): Promise<string | null> => {
    if (readToken(token)?.mfa !== true) return null;
    try {
      const res = await axiosInstance.get('/v1/admin/my-role');
      return res.data?.roleLevel ?? null;
    } catch {
      return null;
    }
  };

  // Launch: restore a live session or start signed out.
  useEffect(() => {
    const initAuth = async () => {
      try {
        const token = await SecureStore.getItemAsync('token');

        if (token && isTokenExpired(token)) {
          await clearSession();
          return;
        }

        if (token) {
          // Only restore the cached theme when there's a session for it.
          try {
            const cachedTheme = await SecureStore.getItemAsync(THEME_STORAGE_KEY);
            if (cachedTheme && VALID_THEMES.includes(cachedTheme)) setThemeState(cachedTheme);
          } catch { /* ignore */ }

          const userId = decodeToken(token);
          if (userId) {
            try {
              const res = await axiosInstance.get(`/v1/users/profile/${userId}`);
              const profile = withRole(res.data);
              profile.adminRole = await loadAdminRole(token);
              setUser(profile);
              if (res.data.themePreference) await applyTheme(res.data.themePreference);
            } catch (err: any) {
              if (err.response?.status === 401 || err.response?.status === 404) {
                await clearSession();
              }
              console.error('Failed to fetch user profile:', err);
            }
          } else {
            await SecureStore.deleteItemAsync('token');
          }
        } else {
          try { await SecureStore.deleteItemAsync(THEME_STORAGE_KEY); } catch { /* ignore */ }
          setThemeState('blue');
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
      } finally {
        setLoading(false);
        setAuthLoaded(true);
      }
    };

    initAuth();
  }, [clearSession]);

  // A 401 on any request while signed in ends the session in-app.
  useEffect(() => onSessionExpired(() => { clearSession(); }), [clearSession]);

  // Foreground re-check: a token that lapsed while the app was in the
  // background ends the session now, not on the next failing request.
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state !== 'active' || !userRef.current) return;
      const t = await SecureStore.getItemAsync('token');
      if (!t || isTokenExpired(t)) await clearSession();
    });
    return () => sub.remove();
  }, [clearSession]);

  const completeLogin = async (token: string): Promise<LoginResult> => {
    try {
      await SecureStore.setItemAsync('token', token);
      const userId = decodeToken(token);
      if (!userId) throw new Error('Invalid token');
      const profileRes = await axiosInstance.get(`/v1/users/profile/${userId}`);
      const profile = withRole(profileRes.data);
      profile.adminRole = await loadAdminRole(token);
      if (profileRes.data.themePreference) await applyTheme(profileRes.data.themePreference);
      setUser(profile);
      setAuthLoaded(true);
      return { success: true, userId: profile.userId };
    } catch (error: any) {
      await SecureStore.deleteItemAsync('token');
      const body = error.response?.data;
      return {
        success: false,
        error: typeof body === 'string' ? body : body?.message || error.message || 'Login failed',
        data: body,
      };
    }
  };

  const login = async (credentials: LoginCredentials): Promise<LoginResult> => {
    try {
      const response = await axiosInstance.post('/auth/login', credentials);
      // Staff accounts need their authenticator code before there's a session.
      if (response.data?.mfaRequired) {
        return { success: false, mfa: response.data };
      }
      return await completeLogin(response.data.token);
    } catch (error: any) {
      await SecureStore.deleteItemAsync('token');
      const body = error.response?.data;
      return {
        success: false,
        error: typeof body === 'string' ? body : body?.message || error.message || 'Login failed',
        data: body,
      };
    }
  };

  const logout = async (): Promise<void> => {
    try {
      const t = await SecureStore.getItemAsync('token');
      if (t) await axiosInstance.post('/auth/logout', null, { timeout: 3000 });
    } catch {
      // Offline or already signed out: signing out here must never get stuck.
    }
    await clearSession();
  };

  const refreshUser = async (): Promise<void> => {
    try {
      const token = await SecureStore.getItemAsync('token');
      const userId = token && decodeToken(token);
      if (!userId) return;
      const res = await axiosInstance.get(`/v1/users/profile/${userId}`);
      setUser((prev) => withRole({ ...(prev || {}), ...res.data }));
      if (res.data.themePreference) await applyTheme(res.data.themePreference);
    } catch (error) {
      console.error('Failed to refresh user:', error);
    }
  };

  const value: AuthContextType = {
    user,
    login,
    completeLogin,
    logout,
    loading,
    authLoaded,
    isGuest: authLoaded && !user,
    refreshUser,
    theme,
    setTheme,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;
