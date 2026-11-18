// src/config/links.ts
// Public web addresses the app links out to. One place, so a domain change
// is one edit. The web app lives at unismusic.com (netlify.toml HSTS + the
// legal pages all name it); media and the API live on their own hosts
// (see services/axiosInstance.ts and utils/buildUrl.ts).
export const WEB_ORIGIN = 'https://unismusic.com';

export const webUrl = (path: string): string =>
  `${WEB_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;

export const SUPPORT_EMAIL = 'support@unismusic.com';
export const PRIVACY_EMAIL = 'privacy@unismusic.com';
export const DMCA_EMAIL = 'dmca@unismusic.com';
