// src/utils/dmThreads.ts — mobile copy of web src/utils/dmThreads.js.
// Keeps recently opened threads warm so reopening one is instant, and lets
// the inbox start loading a thread the moment a finger lands on its row.
//   getThread(me, id) / putThread(me, id, data) / fetchLatest / fetchOlder
//   prefetchThread(me, id)
// Keyed by the signed-in user, so switching accounts never shows someone
// else's thread. In memory only.
import axiosInstance from '../services/axiosInstance';

export const PAGE_SIZE = 40;
const MAX_THREADS = 30;
const FRESH_MS = 4000;

export interface ThreadPage { messages: any[]; hasMore: boolean }

const store = new Map<string, ThreadPage>();
const inflight = new Map<string, Promise<ThreadPage>>();
const recent = new Map<string, { data: ThreadPage; at: number }>();

const keyOf = (me: string, id: string) => `${me}:${id}`;

function page(res: any): ThreadPage {
  const messages = Array.isArray(res?.data) ? res.data : [];
  return { messages, hasMore: messages.length >= PAGE_SIZE };
}

export function getThread(me?: string | null, id?: string | null): ThreadPage | null {
  if (!me || !id) return null;
  return store.get(keyOf(me, id)) || null;
}

export function putThread(me: string | null | undefined, id: string | null | undefined, data: ThreadPage) {
  if (!me || !id) return;
  const key = keyOf(me, id);
  store.delete(key);
  store.set(key, data);
  if (store.size > MAX_THREADS) {
    const first = store.keys().next().value;
    if (first) store.delete(first);
  }
}

export function fetchLatest(me: string, id: string, { maxAgeMs = 0 } = {}): Promise<ThreadPage> {
  const key = keyOf(me, id);
  const hit = recent.get(key);
  if (maxAgeMs > 0 && hit && Date.now() - hit.at < maxAgeMs) return Promise.resolve(hit.data);
  const existing = inflight.get(key);
  if (existing) return existing;

  const request = axiosInstance
    .get(`/v1/conversations/${id}/messages?limit=${PAGE_SIZE}`)
    .then((res) => {
      const data = page(res);
      recent.set(key, { data, at: Date.now() });
      return data;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, request);
  return request;
}

export function fetchOlder(id: string, before: string): Promise<ThreadPage> {
  return axiosInstance
    .get(`/v1/conversations/${id}/messages?before=${encodeURIComponent(before)}&limit=${PAGE_SIZE}`)
    .then(page);
}

export function prefetchThread(me?: string | null, id?: string | null) {
  if (!me || !id || String(id).startsWith('draft-')) return;
  fetchLatest(me, id, { maxAgeMs: FRESH_MS }).catch((err) => {
    console.error('[Messages] thread prefetch failed (will load on open):', err?.message || err);
  });
}

export const THREAD_FRESH_MS = FRESH_MS;

// Server times are UTC; treat a zone-less date-time as UTC.
const HAS_ZONE = /([zZ]|[+-]\d{2}:?\d{2})$/;
export function parseServerTime(value: any): Date {
  if (!value) return new Date(NaN);
  if (value instanceof Date) return value;
  const s = String(value);
  return new Date(HAS_ZONE.test(s) || !s.includes('T') ? s : `${s}Z`);
}

/** The inbox preview the backend would write for this message. */
export function previewFor(message: any): string {
  const body = (message?.body || '').trim();
  if (body) return body;
  if (message?.supportPaymentId != null) return 'Sent support';
  if (message?.sharedSongId != null) return 'Shared a track';
  return '';
}
