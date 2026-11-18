// src/utils/standings.ts — mobile copy of web src/utils/standings.js.
// One way to read rankings: every board reads GET /v1/awards/standings,
// which ranks with the same formula that decides award winners:
//   total points = weighted vote points + plays + 5 x likes
//   ties → vote points → plays → likes → score → seniority
// The backend applies the midnight rule (PREVIOUS_FINAL / PREVIOUS_CLOSING);
// describeBoard turns that into the words a screen shows.
// Screens never record plays — requestPlay hands the song to the Player.
import axiosInstance from '../services/axiosInstance';
import { buildUrl } from './buildUrl';
import { GENRE_IDS, INTERVAL_IDS } from './IdMappings';

export type PeriodKey = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'midterm' | 'annual';

export const PERIODS: { key: PeriodKey; label: string; current: string; previous: string }[] = [
  { key: 'daily', label: 'Today', current: 'today', previous: 'Yesterday' },
  { key: 'weekly', label: 'Week', current: 'this week', previous: 'Last week' },
  { key: 'monthly', label: 'Month', current: 'this month', previous: 'Last month' },
  { key: 'quarterly', label: 'Quarter', current: 'this quarter', previous: 'Last quarter' },
  { key: 'midterm', label: 'Half', current: 'this half-year', previous: 'Last half-year' },
  { key: 'annual', label: 'Year', current: 'this year', previous: 'Last year' },
];

export const periodByKey = (key?: string | null) => PERIODS.find((p) => p.key === key) || PERIODS[1];

const INTERVAL_KEY_BY_NAME: Record<string, PeriodKey> = {
  Daily: 'daily', Weekly: 'weekly', Monthly: 'monthly',
  Quarterly: 'quarterly', Midterm: 'midterm', Annual: 'annual',
};

export interface BoardEntry {
  id: string;
  type: 'artist' | 'song';
  rank: number;
  name: string;
  artistName: string;
  artistId: string | null;
  artwork: string | null;
  fileUrl: string | null;
  homeJurisdictionId: string | null;
  homeJurisdictionName: string;
  points: number;
  votes: number;
  plays: number;
  likes: number;
  winner: boolean;
  movement: number | null;
  isNew: boolean;
}

export interface Board {
  type: 'artist' | 'song';
  state: 'LIVE' | 'PREVIOUS_FINAL' | 'PREVIOUS_CLOSING' | string;
  periodKey: PeriodKey;
  periodStart: string | null;
  periodEnd: string | null;
  closesAt: string | null;
  stillOpenIn: string[];
  total: number;
  offset: number;
  entries: BoardEntry[];
}

export async function fetchStandings({
  type,
  jurisdictionId,
  genre = 'all',
  period = 'weekly',
  limit = 50,
  offset = 0,
}: {
  type: 'artist' | 'song';
  jurisdictionId: string;
  genre?: string;
  period?: string;
  limit?: number;
  offset?: number;
}): Promise<Board> {
  const params: string[] = [];
  params.push(`type=${encodeURIComponent(type)}`);
  params.push(`jurisdictionId=${encodeURIComponent(jurisdictionId)}`);
  const genreId = genre && genre !== 'all' ? GENRE_IDS[genre] : null;
  if (genreId) params.push(`genreId=${genreId}`);
  params.push(`intervalId=${INTERVAL_IDS[period] || INTERVAL_IDS.weekly}`);
  params.push(`limit=${limit}`);
  params.push(`offset=${offset}`);
  const res = await axiosInstance.get(`/v1/awards/standings?${params.join('&')}`);
  return normalizeBoard(res.data);
}

export function normalizeBoard(data: any): Board {
  const d = data || {};
  return {
    type: d.type || 'song',
    state: d.state || 'LIVE',
    periodKey: INTERVAL_KEY_BY_NAME[d.interval] || 'weekly',
    periodStart: d.periodStart || null,
    periodEnd: d.periodEnd || null,
    closesAt: d.closesAt || null,
    stillOpenIn: d.stillOpenIn || [],
    total: d.total || 0,
    offset: d.offset || 0,
    entries: (d.entries || []).map((e: any) => ({
      id: e.targetId,
      type: e.targetType || d.type || 'song',
      rank: e.rank,
      name: e.name || (e.targetType === 'artist' ? 'Unknown artist' : 'Untitled'),
      artistName: e.artistName || '',
      artistId: e.artistId || null,
      artwork: e.artworkUrl ? buildUrl(e.artworkUrl) : null,
      fileUrl: e.fileUrl ? buildUrl(e.fileUrl) : null,
      homeJurisdictionId: e.homeJurisdictionId || null,
      homeJurisdictionName: e.homeJurisdictionName || '',
      points: e.totalPoints || 0,
      votes: e.votes || 0,
      plays: e.plays || 0,
      likes: e.likes || 0,
      winner: !!e.winner,
      movement: typeof e.movement === 'number' ? e.movement : null,
      isNew: !!e.newEntry,
    })),
  };
}

const ZONE_NAMES: Record<string, string> = {
  'America/New_York': 'Eastern', 'America/Detroit': 'Eastern',
  'America/Indiana/Indianapolis': 'Eastern', 'America/Kentucky/Louisville': 'Eastern',
  'America/Chicago': 'Central',
  'America/Denver': 'Mountain', 'America/Boise': 'Mountain', 'America/Phoenix': 'Mountain',
  'America/Los_Angeles': 'Pacific',
  'America/Anchorage': 'Alaska',
  'Pacific/Honolulu': 'Hawaii',
  'America/Puerto_Rico': 'Atlantic',
};

const zoneName = (tz: string) => ZONE_NAMES[tz] || (tz || '').split('/').pop()!.replace(/_/g, ' ');

const joinZones = (zones: string[]) => {
  const names = [...new Set((zones || []).map(zoneName))];
  if (names.length <= 1) return names[0] || '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
};

export function formatCloseTime(iso?: string | null): string {
  if (!iso) return '';
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return '';
  const soon = when.getTime() - Date.now() < 24 * 60 * 60 * 1000;
  try {
    return new Intl.DateTimeFormat(
      undefined,
      soon
        ? { hour: 'numeric', minute: '2-digit' }
        : { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' },
    ).format(when);
  } catch {
    return when.toLocaleString();
  }
}

export function describeBoard(board?: Partial<Board> | null): { tone: 'live' | 'final' | 'closing'; title: string; detail: string } {
  const period = periodByKey(board?.periodKey);
  const state = board?.state || 'LIVE';

  if (state === 'PREVIOUS_FINAL') {
    return {
      tone: 'final',
      title: `${period.previous}'s final`,
      detail: `The ${period.current === 'today' ? 'new day' : period.current.replace('this ', 'new ')} starts with the first play, like or vote.`,
    };
  }
  if (state === 'PREVIOUS_CLOSING') {
    const zones = joinZones(board?.stillOpenIn || []);
    return {
      tone: 'closing',
      title: `${period.previous}, still open${zones ? ` in ${zones} time` : ''}`,
      detail: board?.closesAt ? `Results are final at ${formatCloseTime(board.closesAt)}.` : 'Results are final soon.',
    };
  }
  return {
    tone: 'live',
    title: `Live ${period.current}`,
    detail: board?.closesAt ? `Results are final at ${formatCloseTime(board.closesAt)}.` : '',
  };
}

export const formatCount = (n: any): string =>
  Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/**
 * Play a board entry through the PlayChoiceModal. Songs play directly; an
 * artist plays their default song. Returns false when there is nothing to play.
 */
export async function playEntry(entry: BoardEntry | null, requestPlay: (s: any) => void, source: string): Promise<boolean> {
  if (!entry) return false;

  if (entry.type === 'song' && entry.fileUrl) {
    requestPlay({
      type: 'song',
      id: entry.id,
      songId: entry.id,
      url: entry.fileUrl,
      fileUrl: entry.fileUrl,
      title: entry.name,
      artist: entry.artistName,
      artistId: entry.artistId,
      artwork: entry.artwork,
      artworkUrl: entry.artwork,
      source,
    });
    return true;
  }

  if (entry.type === 'artist' && entry.id) {
    try {
      const res = await axiosInstance.get(`/v1/users/${entry.id}/default-song`);
      const song = res.data;
      if (!song?.fileUrl) return false;
      const url = buildUrl(song.fileUrl);
      const artwork = buildUrl(song.artworkUrl) || entry.artwork;
      requestPlay({
        type: 'song',
        id: song.songId,
        songId: song.songId,
        url,
        fileUrl: url,
        title: song.title,
        artist: entry.name,
        artistId: entry.id,
        artwork,
        artworkUrl: artwork,
        source,
      });
      return true;
    } catch (err: any) {
      console.error('[standings] default song fetch failed:', err?.message || err);
      return false;
    }
  }
  return false;
}
