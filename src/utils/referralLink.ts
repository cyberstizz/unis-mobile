// src/utils/referralLink.ts — mobile copy of the parts of web
// src/utils/referralLink.js that apply in the app. The app has no address
// bar, so there's nothing to capture; it only builds the shareable link.
import { WEB_ORIGIN } from '../config/links';

export function cleanReferral(raw: any): string {
  return String(raw || '').replace(/[^A-Za-z0-9-]/g, '').toUpperCase().slice(0, 64);
}

/** The link to share or print for a code — https://unismusic.com/join/CODE */
export function joinLink(code: string, origin: string = WEB_ORIGIN): string {
  return `${origin}/join/${encodeURIComponent(cleanReferral(code))}`;
}
