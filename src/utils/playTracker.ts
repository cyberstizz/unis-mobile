// src/utils/playTracker.ts
// Mobile port of web's /src/utils/playTracker.js
//
// Purpose: fire a single play call ONLY after a track has been playing for
// 30 seconds. If the user skips before the timer fires, the pending call is
// cancelled so we don't inflate play counts for scrubbed-through tracks.
//
//   Logged in:  POST /v1/media/song/{songId}/play?userId=...
//               (a counted play: play count, points, awards)
//   Logged out: POST /v1/media/song/{songId}/anonymous-play?visitorId=...
//               (kept apart: no play count, no points, never counted as a
//               user; shows in the admin Metrics page as logged-out plays)
//
// The visitor ID is a random ID made once per install and kept in
// SecureStore. It identifies this app install, not a person.
//
// Usage from Player:
//   import { schedulePlayTracking, cancelPlayTracking } from '../utils/playTracker';
//
//   useEffect(() => {
//     if (currentMedia?.id) {
//       schedulePlayTracking(currentMedia.id, userId);   // userId may be null
//     }
//     return () => cancelPlayTracking();
//   }, [currentMedia?.id, userId]);

import * as SecureStore from 'expo-secure-store';
import axiosInstance from '../services/axiosInstance';

const PLAY_TRACK_DELAY_MS = 30_000;
const VISITOR_KEY = 'unis_visitor_id';

let timerId: ReturnType<typeof setTimeout> | null = null;
let currentlyTrackingId: string | null = null;
let visitorIdCache: string | null = null;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A version-4 UUID. Math.random is fine here: the ID only needs to be unique,
// not secret.
function makeUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** This install's visitor ID, made and saved on first use. */
export async function getVisitorId(): Promise<string> {
  if (visitorIdCache) return visitorIdCache;
  try {
    const saved = await SecureStore.getItemAsync(VISITOR_KEY);
    if (saved && UUID_RE.test(saved)) {
      visitorIdCache = saved;
      return saved;
    }
  } catch {
    // fall through and make a new one
  }
  const id = makeUuid();
  visitorIdCache = id;
  try {
    await SecureStore.setItemAsync(VISITOR_KEY, id);
  } catch {
    // Not saved: this session still uses the same ID.
  }
  return id;
}

/**
 * Schedule a play-tracking call for the given song.
 * If called again before the previous timer fires, the previous timer
 * is cancelled and replaced — preventing inflated play counts when the
 * user skips rapidly between tracks.
 *
 * Pass the logged-in user's ID, or null for a guest.
 */
export function schedulePlayTracking(songId: string, userId: string | null): void {
  // User skipped — cancel previous pending call
  if (timerId) {
    clearTimeout(timerId);
    timerId = null;
  }

  if (!songId) return;

  currentlyTrackingId = songId;

  timerId = setTimeout(async () => {
    try {
      if (userId) {
        await axiosInstance.post(
          `/v1/media/song/${songId}/play?userId=${userId}`,
        );
      } else {
        const visitorId = await getVisitorId();
        await axiosInstance.post(
          `/v1/media/song/${songId}/anonymous-play?visitorId=${encodeURIComponent(visitorId)}&source=player`,
        );
      }
    } catch (err) {
      // Silent failure — play tracking must never interrupt UX.
      // Log at debug level only; production builds should drop this.
      if (__DEV__) {
        console.warn('[playTracker] play count request failed:', err);
      }
    } finally {
      timerId = null;
      currentlyTrackingId = null;
    }
  }, PLAY_TRACK_DELAY_MS);
}

/**
 * Cancel any pending play-tracking call. Call this on:
 *   - track change (before scheduling a new one — handled automatically
 *     by schedulePlayTracking, but calling directly is fine)
 *   - Player component unmount
 *   - logout
 */
export function cancelPlayTracking(): void {
  if (timerId) {
    clearTimeout(timerId);
    timerId = null;
  }
  currentlyTrackingId = null;
}

/**
 * Debug helper — returns the songId currently pending a play-tracking call,
 * or null if no timer is active.
 */
export function getCurrentTrackingId(): string | null {
  return currentlyTrackingId;
}