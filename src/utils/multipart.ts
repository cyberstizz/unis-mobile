// src/utils/multipart.ts
// Multipart uploads go through fetch, not axios: axios + FormData in React
// Native sets the multipart boundary wrong ("Network Error"). This attaches the
// session token, gives uploads their own long timeout (the shared axios
// instance gives up after 10s, which aborts a 50 MB video mid-transfer), and
// returns the parsed JSON body, throwing the server's message on failure.
import * as SecureStore from 'expo-secure-store';

export const API_BASE_URL = 'https://unismvp-production.up.railway.app/api';
export const UPLOAD_TIMEOUT_MS = 10 * 60 * 1000;

export async function sendMultipart(
  path: string,
  body: FormData,
  method: 'POST' | 'PATCH' | 'PUT' = 'POST',
  timeoutMs = UPLOAD_TIMEOUT_MS,
): Promise<any> {
  const token = await SecureStore.getItemAsync('token');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body,
      signal: controller.signal,
    });
    const text = await res.text();
    let data: any = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
    if (!res.ok) {
      const err: any = new Error(data?.message || data?.error || `Request failed (code ${res.status})`);
      err.response = { status: res.status, data };
      throw err;
    }
    return data;
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error('The upload took too long. Check your connection and try again.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
