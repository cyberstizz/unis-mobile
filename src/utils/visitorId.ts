// src/utils/visitorId.ts
// Mobile port of web src/utils/visitorId.js: a random ID made once per
// install and kept in SecureStore. It identifies this app install, not a
// person — logged-out plays are recorded against it (no points, no counts).
import * as SecureStore from 'expo-secure-store';

const VISITOR_KEY = 'unis_visitor_id';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let cached: string | null = null;

function makeUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** This install's visitor ID, made and saved on first use. */
export async function getVisitorId(): Promise<string> {
  if (cached) return cached;
  try {
    const saved = await SecureStore.getItemAsync(VISITOR_KEY);
    if (saved && UUID_RE.test(saved)) {
      cached = saved;
      return saved;
    }
  } catch {
    // fall through and make a new one
  }
  const id = makeUuid();
  cached = id;
  try {
    await SecureStore.setItemAsync(VISITOR_KEY, id);
  } catch {
    // Not saved: this session still uses the same ID.
  }
  return id;
}

/** Synchronous read once getVisitorId() has resolved at least once. */
export const peekVisitorId = (): string | null => cached;
