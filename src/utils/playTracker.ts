// src/utils/playTracker.ts
// Mobile port of web's /src/utils/playTracker.js
//
// Purpose: fire a single POST /v1/media/song/{songId}/play?userId=...
// ONLY after a track has been playing for 30 seconds (Spotify-standard).
// If the user skips before the timer fires, the pending call is cancelled
// so we don't inflate play counts for scrubbed-through tracks.
//
// Usage from Player:
//   import { schedulePlayTracking, cancelPlayTracking } from '../utils/playTracker';
//
//   useEffect(() => {
//     if (currentMedia?.id && userId) {
//       schedulePlayTracking(currentMedia.id, userId);
//     }
//     return () => cancelPlayTracking();
//   }, [currentMedia?.id, userId]);

import axiosInstance from '../services/axiosInstance';

const PLAY_TRACK_DELAY_MS = 30_000;

let timerId: ReturnType<typeof setTimeout> | null = null;
let currentlyTrackingId: string | null = null;

/**
 * Schedule a play-tracking call for the given song.
 * If called again before the previous timer fires, the previous timer
 * is cancelled and replaced — preventing inflated play counts when the
 * user skips rapidly between tracks.
 */
export function schedulePlayTracking(songId: string, userId: string): void {
  // User skipped — cancel previous pending call
  if (timerId) {
    clearTimeout(timerId);
    timerId = null;
  }

  if (!songId || !userId) return;

  currentlyTrackingId = songId;

  timerId = setTimeout(async () => {
    try {
      await axiosInstance.post(
        `/v1/media/song/${songId}/play?userId=${userId}`,
      );
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