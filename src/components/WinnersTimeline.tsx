// ============================================================================
// WinnersTimeline.tsx — mobile port of web `winnersTimeline.jsx`
//
// Vertical timeline of past poll winners for a jurisdiction. Two variants:
//   • 'embedded' — a section inside JurisdictionScreen; the CTA navigates to
//                  the full archive
//   • 'full'     — the standalone WinnersScreen; the CTA reveals more in place
//
// DATA — the real backend, same call the web uses:
//   GET /v1/awards/past?type={song|artist}&startDate=&endDate=
//       &jurisdictionId=&intervalId=
//
// `genreId` is deliberately omitted so a period can return one winner per
// genre; rows arrive ordered `award_date DESC, votes_count DESC`, so grouping
// by awardDate and keeping the first row yields that period's overall champion.
//
// PLAY TRACKING — this component records NO plays. `components/Player.tsx`
// owns that via `schedulePlayTracking` (30s gate). The backend applies a
// 30-minute per-user/per-song cooldown, so a POST fired here at tap time would
// win that race and silently void the gate, crediting an artist for a track
// the listener skipped. Tapping play only calls `requestPlay`, which routes
// through PlayChoiceModal.
//
// THEME — every accent derives from `useAuth().theme` via THEME_HEX, matching
// SongScreen / EarningsScreen / IntervalDatePicker. Nothing is hardcoded blue.
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ImageBackground,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';

import { useAuth } from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';
import axiosInstance from '../services/axiosInstance';
import { buildUrl } from '../utils/buildUrl';
import { INTERVAL_IDS } from '../utils/IdMappings';

// ─── Theme — mirrors web `--unis-primary` / ThemePicker / SongScreen ─────────
const THEME_HEX: Record<string, string> = {
  blue: '#163387',
  orange: '#C44B0A',
  red: '#B51C24',
  green: '#0F7A3E',
  purple: '#4A1A8C',
  yellow: '#C49A0A',
  dianna: '#C49A0A',
};
const getThemeHex = (theme?: string): string =>
  THEME_HEX[theme || 'blue'] || THEME_HEX.blue;

const hexToRgba = (hex: string, alpha: number): string => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

// Lighten toward white — the RN stand-in for `--unis-primary-2`.
const lighten = (hex: string, amount = 0.25): string => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix((n >> 16) & 255)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
};

const INK = '#ffffff';
const INK_2 = 'rgba(255,255,255,0.72)';
const INK_3 = 'rgba(255,255,255,0.5)';
const INK_4 = 'rgba(255,255,255,0.32)';
const PANEL = 'rgba(255,255,255,0.045)';
const ETCH = 'rgba(255,255,255,0.08)';

// ─── Filters ────────────────────────────────────────────────────────────────
const INTERVALS = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'midterm', label: 'Midterm' },
  { value: 'year', label: 'Year' },
] as const;

const CATEGORIES = [
  { value: 'song', label: 'Song' },
  { value: 'artist', label: 'Artist' },
] as const;

type IntervalValue = (typeof INTERVALS)[number]['value'];
type CategoryValue = (typeof CATEGORIES)[number]['value'];

// UI value → IdMappings key
const INTERVAL_KEY: Record<IntervalValue, string> = {
  day: 'daily',
  week: 'weekly',
  month: 'monthly',
  quarter: 'quarterly',
  midterm: 'midterm',
  year: 'annual',
};

const INTERVAL_STEP_DAYS: Record<IntervalValue, number> = {
  day: 1,
  week: 7,
  month: 30,
  quarter: 91,
  midterm: 182,
  year: 365,
};

// How many periods back one fetch covers. Award rows are one per period, so
// this stays small even at the widest window.
const FETCH_PERIODS: Record<IntervalValue, number> = {
  day: 45,
  week: 52,
  month: 24,
  quarter: 12,
  midterm: 8,
  year: 6,
};

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

// ─── Types ──────────────────────────────────────────────────────────────────
export interface TimelineEntry {
  id: string;
  periodLabel: string;
  type: 'song' | 'artist';
  votesCount: number;
  winner: {
    id: string;
    title?: string;
    name?: string;
    artist?: string;
    artistId?: string;
    artwork?: string | null;
    photo?: string | null;
    fileUrl?: string | null;
  };
}

interface Props {
  jurisdiction?: string;
  jurisdictionId?: string | null;
  initialInterval?: IntervalValue;
  initialCategory?: CategoryValue;
  variant?: 'embedded' | 'full';
  initialCount?: number;
  pageSize?: number;
  showHeader?: boolean;
}

// award_date marks the END of the awarded period.
const formatPeriodLabel = (interval: IntervalValue, endDate: Date): string => {
  switch (interval) {
    case 'day':
      return endDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    case 'week': {
      const start = new Date(endDate);
      start.setDate(start.getDate() - 6);
      const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
      const endMonth = endDate.toLocaleDateString('en-US', { month: 'short' });
      const year = endDate.getFullYear();
      if (startMonth === endMonth) {
        return `${startMonth} ${start.getDate()} – ${endDate.getDate()}, ${year}`;
      }
      return `${startMonth} ${start.getDate()} – ${endMonth} ${endDate.getDate()}, ${year}`;
    }
    case 'month':
      return endDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    case 'quarter':
      return `Q${Math.floor(endDate.getMonth() / 3) + 1} ${endDate.getFullYear()}`;
    case 'midterm':
      return `${endDate.getMonth() < 6 ? 'H1' : 'H2'} ${endDate.getFullYear()}`;
    case 'year':
      return String(endDate.getFullYear());
    default:
      return '';
  }
};

// Award entity → card shape. Returns null when the target was deleted.
const normalizeAward = (
  award: any,
  interval: IntervalValue
): TimelineEntry | null => {
  const base = {
    id: award.awardId,
    periodLabel: formatPeriodLabel(interval, new Date(`${award.awardDate}T00:00:00`)),
    votesCount: award.votesCount || 0,
  };

  if (award.targetType === 'song') {
    if (!award.song) return null;
    return {
      ...base,
      type: 'song',
      winner: {
        id: award.song.songId,
        title: award.song.title,
        artist: award.song.artist?.username || 'Unknown',
        artistId: award.song.artist?.userId,
        artwork: buildUrl(award.song.artworkUrl),
        fileUrl: buildUrl(award.song.fileUrl),
      },
    };
  }

  if (!award.user) return null;
  return {
    ...base,
    type: 'artist',
    winner: {
      id: award.user.userId,
      name: award.user.username,
      photo: buildUrl(award.user.photoUrl),
    },
  };
};

const PlayIcon = ({ size = 12 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="#FFFFFF">
    <Path d="M8 5v14l11-7z" />
  </Svg>
);

const TrophyIcon = ({ size = 11, color }: { size?: number; color: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M5 4h14v3a5 5 0 0 1-5 5h-.05a4 4 0 0 1-3.9 0H10a5 5 0 0 1-5-5V4zm-2 0v3a7 7 0 0 0 6 6.93V16H7v2h10v-2h-2v-2.07A7 7 0 0 0 21 7V4h-2V2H5v2H3z" />
  </Svg>
);

// ─── Winner card ────────────────────────────────────────────────────────────
const WinnerCard: React.FC<{
  entry: TimelineEntry;
  accent: string;
  accentLight: string;
  onPress: () => void;
  onPlay: () => void;
}> = ({ entry, accent, accentLight, onPress, onPlay }) => {
  const isSong = entry.type === 'song';
  const art = isSong ? entry.winner.artwork : entry.winner.photo;
  const label = isSong ? entry.winner.title : entry.winner.name;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`View ${label}`}
    >
      {/* Ambient glow — the winner's own artwork, blurred behind the card.
          Same treatment as the Milestones winner plate. */}
      {!!art && (
        <ImageBackground
          source={{ uri: art }}
          style={StyleSheet.absoluteFill}
          imageStyle={styles.cardGlow}
          blurRadius={40}
        />
      )}

      <View style={styles.cardInner}>
        <View style={styles.cardArtWrap}>
          {art ? (
            <Image source={{ uri: art }} style={styles.cardArt} />
          ) : (
            <View style={[styles.cardArt, styles.cardArtEmpty]} />
          )}

          {isSong && !!entry.winner.fileUrl && (
            <TouchableOpacity
              style={[styles.cardPlay, { backgroundColor: accent }]}
              onPress={onPlay}
              accessibilityRole="button"
              accessibilityLabel={`Play ${entry.winner.title}`}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <PlayIcon size={12} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.cardBody}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {label}
          </Text>

          {isSong && (
            <Text style={styles.cardMeta} numberOfLines={1}>
              {entry.winner.artist}
            </Text>
          )}

          <View style={styles.cardStat}>
            <TrophyIcon size={11} color={accentLight} />
            <Text style={[styles.cardStatText, { color: accentLight }]}>
              {entry.votesCount > 0
                ? `${entry.votesCount.toLocaleString()} vote${entry.votesCount === 1 ? '' : 's'}`
                : 'Won on engagement'}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
};

// ─── Main ───────────────────────────────────────────────────────────────────
const WinnersTimeline: React.FC<Props> = ({
  jurisdiction = 'Downtown Harlem',
  jurisdictionId = null,
  initialInterval = 'week',
  initialCategory = 'song',
  variant = 'embedded',
  initialCount = 5,
  pageSize = 5,
  showHeader = true,
}) => {
  const navigation = useNavigation<any>();
  const { theme } = useAuth();
  const { requestPlay } = usePlayer();

  const accent = getThemeHex(theme);
  const accentLight = useMemo(() => lighten(accent, 0.3), [accent]);

  const [activeInterval, setActiveInterval] = useState<IntervalValue>(initialInterval);
  const [activeCategory, setActiveCategory] = useState<CategoryValue>(initialCategory);
  const [visibleCount, setVisibleCount] = useState(initialCount);

  const [jurId, setJurId] = useState<string | null>(jurisdictionId);
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  // ── Resolve the jurisdiction UUID (skipped when the parent supplies it) ──
  useEffect(() => {
    if (jurisdictionId) {
      setJurId(jurisdictionId);
      return;
    }

    let active = true;

    axiosInstance
      .get(`/v1/jurisdictions/byName/${encodeURIComponent(jurisdiction)}`)
      .then((res) => {
        if (!active) return;
        const body = res.data;
        const first = Array.isArray(body) ? body[0] : body;
        if (first?.jurisdictionId) {
          setJurId(first.jurisdictionId);
        } else {
          console.warn(`[WinnersTimeline] no jurisdiction named ${jurisdiction}`);
          setError(`Couldn't find ${jurisdiction}.`);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!active) return;
        console.error('[WinnersTimeline] byName lookup failed:', err?.message || err);
        setError('Couldn’t load past winners. Check your connection and try again.');
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [jurisdiction, jurisdictionId]);

  // ── Fetch the archive window ──
  useEffect(() => {
    if (!jurId) return;

    let active = true;

    const fetchWinners = async () => {
      setLoading(true);
      setError(null);

      const end = new Date();
      const start = new Date(end);
      start.setDate(
        start.getDate() -
          FETCH_PERIODS[activeInterval] * INTERVAL_STEP_DAYS[activeInterval]
      );

      const intervalId = INTERVAL_IDS[INTERVAL_KEY[activeInterval]];

      try {
        const res = await axiosInstance.get(
          `/v1/awards/past?type=${activeCategory}` +
            `&startDate=${isoDate(start)}&endDate=${isoDate(end)}` +
            `&jurisdictionId=${jurId}&intervalId=${intervalId}`
        );

        if (!active) return;

        // One row per genre per period comes back; keep the top-voted row per
        // award_date (the backend already orders votes DESC within a date).
        const byDate = new Map<string, any>();
        (res.data || []).forEach((award: any) => {
          if (!byDate.has(award.awardDate)) byDate.set(award.awardDate, award);
        });

        const normalized = [...byDate.values()]
          .map((a) => normalizeAward(a, activeInterval))
          .filter((e): e is TimelineEntry => e !== null);

        console.log(
          `[WinnersTimeline] loaded ${normalized.length} ${activeCategory} winner(s) ` +
            `for ${activeInterval} in ${jurisdiction}`
        );

        setEntries(normalized);
      } catch (err: any) {
        if (!active) return;
        console.error('[WinnersTimeline] awards fetch failed:', err?.message || err);
        setError('Couldn’t load past winners. Check your connection and try again.');
        setEntries([]);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchWinners();

    return () => {
      active = false;
    };
  }, [jurId, activeInterval, activeCategory, retryNonce, jurisdiction]);

  const visibleWinners = entries.slice(0, visibleCount);
  const hasMore = visibleCount < entries.length;

  const handleNavigate = (entry: TimelineEntry) => {
    if (entry.type === 'song') {
      navigation.navigate('Song', { songId: entry.winner.id });
    } else {
      navigation.navigate('Artist', { artistId: entry.winner.id });
    }
  };

  // Only REQUESTS playback — Player.tsx records the play after its 30s gate.
  const handlePlay = useCallback(
    (entry: TimelineEntry) => {
      if (entry.type !== 'song' || !entry.winner.fileUrl) return;

      requestPlay({
        id: entry.winner.id,
        songId: entry.winner.id,
        title: entry.winner.title || '',
        artist: entry.winner.artist,
        url: entry.winner.fileUrl,
        fileUrl: entry.winner.fileUrl,
        artwork: entry.winner.artwork || undefined,
        artworkUrl: entry.winner.artwork || undefined,
        jurisdiction,
      });
    },
    [requestPlay, jurisdiction]
  );

  const handleLoadMore = () => {
    if (variant === 'embedded') {
      navigation.navigate('Winners', {
        jurisdiction,
        jurisdictionId: jurId,
        interval: activeInterval,
        category: activeCategory,
      });
    } else {
      setVisibleCount((c) => Math.min(c + pageSize, entries.length));
    }
  };

  const handleIntervalChange = (value: IntervalValue) => {
    setActiveInterval(value);
    setVisibleCount(initialCount);
  };

  const handleCategoryChange = (value: CategoryValue) => {
    setActiveCategory(value);
    setVisibleCount(initialCount);
  };

  const renderPills = <T extends string>(
    label: string,
    options: readonly { value: T; label: string }[],
    active: T,
    onChange: (v: T) => void
  ) => (
    <View style={styles.filterGroup}>
      <Text style={styles.filterLabel}>{label.toUpperCase()}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pillRow}
      >
        {options.map((opt) => {
          const isActive = active === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.pill,
                isActive && {
                  backgroundColor: hexToRgba(accent, 0.28),
                  borderColor: hexToRgba(accent, 0.6),
                },
              ]}
              onPress={() => onChange(opt.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`${label}: ${opt.label}`}
            >
              <Text style={[styles.pillText, isActive && { color: accentLight }]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  return (
    <View style={styles.wrap}>
      {showHeader && (
        <View style={styles.header}>
          <View style={styles.eyebrowRow}>
            <View style={[styles.eyebrowDot, { backgroundColor: accentLight }]} />
            <Text style={styles.eyebrow}>HALL OF FAME</Text>
          </View>
          <Text style={styles.title}>
            Past <Text style={[styles.titleAccent, { color: accentLight }]}>winners</Text>
          </Text>
          <Text style={styles.subtitle}>
            {variant === 'embedded'
              ? `Every track and artist ${jurisdiction} has crowned.`
              : `The complete record of who ${jurisdiction} has voted for, across every interval since Unis began.`}
          </Text>
        </View>
      )}

      <View style={styles.filters}>
        {renderPills('Interval', INTERVALS, activeInterval, handleIntervalChange)}
        {renderPills('Category', CATEGORIES, activeCategory, handleCategoryChange)}
      </View>

      {loading ? (
        <View style={styles.stateBox} accessibilityLabel="Loading past winners">
          <ActivityIndicator color={accentLight} />
        </View>
      ) : error ? (
        <View style={styles.errorBox} accessibilityRole="alert">
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={[styles.retry, { borderColor: hexToRgba(accent, 0.6) }]}
            onPress={() => setRetryNonce((n) => n + 1)}
            accessibilityRole="button"
            accessibilityLabel="Retry"
          >
            <Text style={styles.retryText}>RETRY</Text>
          </TouchableOpacity>
        </View>
      ) : visibleWinners.length === 0 ? (
        <Text style={styles.empty}>
          No winners on record for this interval yet. The next poll crowns the first.
        </Text>
      ) : (
        <View style={styles.timeline}>
          {visibleWinners.map((entry, idx) => {
            const isLast = idx === visibleWinners.length - 1 && !hasMore;
            return (
              <View key={entry.id} style={styles.entry}>
                <View style={styles.gutter}>
                  <View
                    style={[
                      styles.dot,
                      { borderColor: accentLight, backgroundColor: '#07090f' },
                    ]}
                  />
                  {!isLast && <View style={styles.rail} />}
                </View>

                <View style={styles.entryContent}>
                  <Text style={styles.period}>{entry.periodLabel.toUpperCase()}</Text>
                  <WinnerCard
                    entry={entry}
                    accent={accent}
                    accentLight={accentLight}
                    onPress={() => handleNavigate(entry)}
                    onPlay={() => handlePlay(entry)}
                  />
                </View>
              </View>
            );
          })}
        </View>
      )}

      {!loading &&
        !error &&
        (variant === 'embedded' ? entries.length > 0 : hasMore) && (
          <TouchableOpacity
            style={[styles.loadMore, { borderColor: hexToRgba(accent, 0.55) }]}
            onPress={handleLoadMore}
            accessibilityRole="button"
          >
            <Text style={[styles.loadMoreText, { color: accentLight }]}>
              {variant === 'embedded' ? 'SEE FULL ARCHIVE' : 'LOAD MORE WINNERS'}
            </Text>
          </TouchableOpacity>
        )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { width: '100%' },

  header: { marginBottom: 22 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  eyebrowDot: { width: 6, height: 6, borderRadius: 3 },
  eyebrow: { color: INK_3, fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  title: { marginTop: 10, color: INK, fontSize: 32, fontWeight: '900', letterSpacing: -1.2 },
  titleAccent: { fontStyle: 'italic', fontWeight: '400' },
  subtitle: { marginTop: 12, color: INK_2, fontSize: 14, lineHeight: 21 },

  filters: {
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: ETCH,
    backgroundColor: PANEL,
    marginBottom: 22,
    gap: 14,
  },
  filterGroup: { gap: 8 },
  filterLabel: { color: INK_4, fontSize: 10, fontWeight: '800', letterSpacing: 1.6 },
  pillRow: { flexDirection: 'row', gap: 8, paddingRight: 8 },
  pill: {
    minHeight: 34,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: ETCH,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  pillText: { color: INK_2, fontSize: 13, fontWeight: '700' },

  timeline: { paddingLeft: 2 },
  entry: { flexDirection: 'row', gap: 14 },
  gutter: { width: 18, alignItems: 'center' },
  dot: { width: 13, height: 13, borderRadius: 999, borderWidth: 2.5, marginTop: 4 },
  rail: { flex: 1, width: 1.5, backgroundColor: ETCH, marginVertical: 4 },
  entryContent: { flex: 1, minWidth: 0, paddingBottom: 20 },
  period: { color: INK_4, fontSize: 11, fontWeight: '800', letterSpacing: 1.4, marginBottom: 8 },

  card: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: ETCH,
    backgroundColor: PANEL,
  },
  cardGlow: { opacity: 0.32, transform: [{ scale: 1.6 }] },
  cardInner: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 },
  cardArtWrap: { position: 'relative', width: 68, height: 68 },
  cardArt: { width: 68, height: 68, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)' },
  cardArtEmpty: { borderWidth: 1, borderColor: ETCH },
  cardPlay: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { flex: 1, minWidth: 0 },
  cardTitle: { color: INK, fontSize: 15, fontWeight: '800', letterSpacing: -0.3 },
  cardMeta: { marginTop: 3, color: INK_3, fontSize: 13, fontWeight: '600' },
  cardStat: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  cardStatText: { fontSize: 12, fontWeight: '800' },

  stateBox: { paddingVertical: 40, alignItems: 'center' },
  errorBox: {
    padding: 20,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: ETCH,
    backgroundColor: PANEL,
    gap: 14,
    alignItems: 'flex-start',
  },
  errorText: { color: INK_2, fontSize: 14, lineHeight: 21 },
  retry: {
    minHeight: 38,
    paddingHorizontal: 20,
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
  },
  retryText: { color: INK, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  empty: { color: INK_3, fontSize: 14, lineHeight: 21, paddingVertical: 18 },

  loadMore: {
    marginTop: 6,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
  },
  loadMoreText: { fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
});

export default WinnersTimeline;