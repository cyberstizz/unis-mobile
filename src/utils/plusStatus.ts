// src/utils/plusStatus.ts — mobile copy of web src/utils/plusStatus.js.
// Unis Plus status, shared by every ad slot and the Plus screen.
// GET /v1/plus/status, cached five minutes per signed-in account; every slot
// shares one request; refreshPlusStatus() after checkout tells them all.
import { useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import axiosInstance from '../services/axiosInstance';

const TTL_MS = 5 * 60 * 1000;
const RETRY_MS = 30 * 1000;

export interface PlusStatus {
  available: boolean;
  priceCents: number | null;
  plus: boolean;
  status: string | null;
  paidThrough: string | null;
  cancelAtPeriodEnd: boolean;
  [k: string]: any;
}

export const DEFAULT_PLUS_STATUS: PlusStatus = Object.freeze({
  available: false,
  priceCents: null,
  plus: false,
  status: null,
  paidThrough: null,
  cancelAtPeriodEnd: false,
}) as PlusStatus;

let cache: { key: string; data: PlusStatus; at: number; ttl: number } | null = null;
let inflight: { key: string; promise: Promise<PlusStatus> } | null = null;
const listeners = new Set<(d: PlusStatus) => void>();

const sessionKey = async (): Promise<string> => {
  try {
    return (await SecureStore.getItemAsync('token')) || 'guest';
  } catch {
    return 'guest';
  }
};

const normalize = (data: any): PlusStatus =>
  data && typeof data === 'object' && 'plus' in data ? { ...DEFAULT_PLUS_STATUS, ...data } : DEFAULT_PLUS_STATUS;

const emit = (data: PlusStatus) => listeners.forEach((fn) => fn(data));

export async function fetchPlusStatus({ force = false } = {}): Promise<PlusStatus> {
  const key = await sessionKey();
  if (!force && cache && cache.key === key && Date.now() - cache.at < cache.ttl) return cache.data;
  if (!force && inflight && inflight.key === key) return inflight.promise;

  const promise = axiosInstance
    .get('/v1/plus/status')
    .then((res) => {
      const data = normalize(res?.data);
      cache = { key, data, at: Date.now(), ttl: TTL_MS };
      emit(data);
      return data;
    })
    .catch((err) => {
      console.warn('[Plus] status failed:', err?.response?.status, err?.message);
      const data = cache && cache.key === key ? cache.data : DEFAULT_PLUS_STATUS;
      cache = { key, data, at: Date.now(), ttl: RETRY_MS };
      return data;
    })
    .finally(() => {
      if (inflight && inflight.promise === promise) inflight = null;
    });
  inflight = { key, promise };
  return promise;
}

export const refreshPlusStatus = () => fetchPlusStatus({ force: true });

/** Last fetched status (any session), or null. */
export const peekPlusStatus = (): PlusStatus | null => (cache ? cache.data : null);

/** Hook: { status, loaded }. Pass the signed-in user's id as userKey. */
export function usePlusStatus(userKey?: string | null) {
  const [status, setStatus] = useState<PlusStatus | null>(() => peekPlusStatus());

  useEffect(() => {
    let alive = true;
    const onChange = (data: PlusStatus) => { if (alive) setStatus(data); };
    listeners.add(onChange);
    fetchPlusStatus().then(onChange);
    return () => {
      alive = false;
      listeners.delete(onChange);
    };
  }, [userKey]);

  return { status: status || DEFAULT_PLUS_STATUS, loaded: status !== null };
}
