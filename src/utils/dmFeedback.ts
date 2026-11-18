// src/utils/dmFeedback.ts — mobile port of web src/utils/dmFeedback.js.
// Touch feedback for Messages. Web vibrates on Android browsers and
// synthesizes two soft sounds with Web Audio. In the app:
//   • haptic() uses React Native's Vibration (Android). iOS's Vibration API
//     only does one long buzz, so iOS stays silent until expo-haptics is
//     added to the build (a native module — needs a new dev client).
//   • playSound() is a no-op: no Web Audio in React Native, and Unis never
//     plays an effect over someone's music anyway.
import { Platform, Vibration } from 'react-native';

const PATTERNS: Record<string, number | number[]> = {
  tap: 6,
  press: 12,
  send: 9,
  react: [0, 7, 28, 9],
  success: [0, 10, 36, 14],
  error: [0, 26, 48, 26],
};

export function haptic(kind: keyof typeof PATTERNS | string = 'tap') {
  if (Platform.OS !== 'android') return;
  try {
    const p = PATTERNS[kind] ?? PATTERNS.tap;
    Vibration.vibrate(p as any);
  } catch {
    /* nothing to do */
  }
}

export function primeSound() {}

export function playSound(_kind: 'send' | 'receive', _opts: { muted?: boolean } = {}) {}
