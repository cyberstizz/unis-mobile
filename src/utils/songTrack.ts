// src/utils/songTrack.ts — mobile copy of web src/utils/songTrack.js.
// Turns a Song as the backend returns it ({songId, title, fileUrl, artist:{...}})
// into the track shape the player expects. Used by the browse shelves and the
// song page's recommended carousel.
import { buildUrl } from './buildUrl';

export interface PlayerTrack {
  type: 'song';
  id: string;
  songId: string;
  url: string | null;
  fileUrl: string | null;
  title: string;
  artist: string;
  artistId: string | null;
  artwork: string | null;
  artworkUrl: string | null;
  jurisdiction: string | null;
  explicit: boolean;
  source: string | null;
}

export function songToTrack(s: any, source: string | null = null): PlayerTrack | null {
  if (!s) return null;
  const url = buildUrl(s.fileUrl) || null;
  const art = buildUrl(s.artworkUrl) || null;
  return {
    type: 'song',
    id: s.songId,
    songId: s.songId,
    url,
    fileUrl: url,
    title: s.title,
    artist: s.artist?.username || 'Unknown artist',
    artistId: s.artist?.userId || null,
    artwork: art,
    artworkUrl: art,
    jurisdiction: s.jurisdiction?.name || null,
    explicit: Boolean(s.explicit),
    source,
  };
}
