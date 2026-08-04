// ============================================================================
// Leaderboardsscreen.tsx — the live board, mobile.
//
// Port of the redesigned web LeaderboardsPage. One job: show who is ahead
// right now in a given scope, and by how much.
//
// Six things were wrong in the previous version and are fixed here:
//
//   1. The "Harlem-wide" option had value 'harlem-wide', but JURISDICTION_IDS
//      only has 'harlem'. The lookup returned undefined, so every Harlem-wide
//      request went out as jurisdictionId=undefined. Broken since it shipped.
//   2. handlePlay called playMedia() directly, bypassing PlayChoiceModal — so
//      a play started here never went through the queue-choice flow.
//   3. It POSTed /v1/media/song/{id}/play at press time. See PLAY TRACKING.
//   4. It hand-rolled an atob() polyfill and parsed the JWT to get userId,
//      purely to feed (3). Both are gone with it.
//   5. It hardcoded unisBlue '#163387' and ignored the user's theme entirely.
//   6. It used getMediaUrl instead of the shared buildUrl, so private R2 URLs
//      were never rewritten to the public host and filenames with spaces
//      were never encoded.
//
// PLAY TRACKING — deliberately absent from this screen.
//   PlayerContext owns play tracking. The old press-time POST recorded plays
//   the user never listened to (requestPlay can end in PlayChoiceModal being
//   cancelled) and won the backend's 30-minute cooldown race, causing the
//   player's own legitimate POST to be silently rejected. Plays feed award
//   scoring, so this screen was able to move rankings with taps alone. Every
//   track handed to requestPlay carries source: 'leaderboards'.
//
// DESIGN
//   Sibling of Milestonesscreen, deliberately not a copy. Milestones is the
//   archive: closed periods, settled, bars measuring share of the period.
//   This is the live board, so the question is margin — the leader gets a
//   plate with an explicit gap readout, and every chase bar is measured
//   against the leader rather than the total. A row at 90% is visibly within
//   reach; a row at 12% is not.
//
// COMPONENT SCOPE
//   Sub-components live at module scope. Declared inside the screen body they
//   get a fresh identity each render and React remounts whole subtrees on
//   every state change — it reads as a flicker.
// ============================================================================

import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  ImageBackground,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { usePlayer, type MediaItem } from '../context/PlayerContext';
import { useAuth } from '../context/AuthContext';
import axiosInstance from '../services/axiosInstance';
import buildUrl from '../utils/buildUrl';
import { GENRE_IDS, JURISDICTION_IDS, INTERVAL_IDS } from '../utils/IdMappings';

const LOG = '[Leaderboards]';

// ─── Theme ───────────────────────────────────────────────────────────────────
const THEME_HEX: Record<string, string> = {
  blue: '#163387',
  orange: '#C44B0A',
  red: '#B51C24',
  green: '#0F7A3E',
  purple: '#4A1A8C',
  yellow: '#C49A0A',
  dianna: '#C49A0A',
};
const getThemeHex = (theme?: string): string => THEME_HEX[theme || 'blue'] || THEME_HEX.blue;

/** Mix a hex toward white — the readable accent for text on dark. */
const lighten = (hex: string, amt = 70): string => {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, ((n >> 16) & 255) + amt);
  const g = Math.min(255, ((n >> 8) & 255) + amt);
  const b = Math.min(255, (n & 255) + amt);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
};

const alpha = (hex: string, a: number): string => {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

const INK = '#f6f7f9';
const INK_2 = 'rgba(246,247,249,0.62)';
const INK_3 = 'rgba(246,247,249,0.38)';
const PLATE = 'rgba(255,255,255,0.028)';
const PLATE_LIFT = 'rgba(255,255,255,0.05)';
const ETCH = 'rgba(255,255,255,0.075)';
const ETCH_STRONG = 'rgba(255,255,255,0.14)';

// ─── Options ─────────────────────────────────────────────────────────────────
// Values are KEYS INTO JURISDICTION_IDS / GENRE_IDS / INTERVAL_IDS. Changing a
// value here without changing IdMappings.ts sends `undefined` to the backend —
// that is exactly what 'harlem-wide' was doing.
const JURISDICTIONS = [
  { value: 'downtown-harlem', label: 'Downtown' },
  { value: 'uptown-harlem', label: 'Uptown' },
  { value: 'harlem', label: 'All Harlem' },
];

const GENRES = [
  { value: 'rap', label: 'Rap' },
  { value: 'rock', label: 'Rock' },
  { value: 'pop', label: 'Pop' },
];

const CATEGORIES: { value: 'artist' | 'song'; label: string }[] = [
  { value: 'artist', label: 'Artists' },
  { value: 'song', label: 'Songs' },
];

const INTERVAL_OPTIONS = [
  { value: 'daily', label: 'Today' },
  { value: 'weekly', label: 'Week' },
  { value: 'monthly', label: 'Month' },
  { value: 'quarterly', label: 'Quarter' },
  { value: 'midterm', label: 'Half' },
  { value: 'annual', label: 'Year' },
];

const JURISDICTION_LABEL: Record<string, string> = {
  'downtown-harlem': 'Downtown Harlem',
  'uptown-harlem': 'Uptown Harlem',
  harlem: 'Harlem',
};

const GENRE_LABEL: Record<string, string> = { rap: 'Rap', rock: 'Rock', pop: 'Pop' };

const formatNumber = (n: number | string): string => (Number(n) || 0).toLocaleString('en-US');

interface Entry {
  id: string;
  type: 'artist' | 'song';
  rank: number;
  title: string;
  artist: string;
  artistId: string | null;
  votes: number;
  artwork: string | null;
  fileUrl: string | null;
}

// ─── Segmented control ───────────────────────────────────────────────────────
// Replaces the modal dropdowns. Small option counts read better as visible
// choices, and it kills the form feel. Wraps rather than scrolling sideways so
// nothing can run off the edge of a narrow phone.
const Segmented = <T extends string>({
  label,
  options,
  value,
  onChange,
  accent,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  accent: string;
}) => (
  <View style={styles.segmented} accessibilityRole="radiogroup" accessibilityLabel={label}>
    {options.map((opt) => {
      const active = opt.value === value;
      return (
        <TouchableOpacity
          key={opt.value}
          style={[styles.seg, active && { backgroundColor: accent }]}
          onPress={() => onChange(opt.value)}
          accessibilityRole="radio"
          accessibilityState={{ selected: active }}
          accessibilityLabel={`${label}: ${opt.label}`}
          activeOpacity={0.8}
        >
          <Text style={[styles.segText, active && styles.segTextOn]} numberOfLines={1}>
            {opt.label}
          </Text>
        </TouchableOpacity>
      );
    })}
  </View>
);

// ─── One row of the chase ────────────────────────────────────────────────────
// Bar width is share of the LEADER's points, not of the total. On a live board
// the useful question is how close the chase is. An entry with no points shows
// a blank points cell — a zero reads as a figure worth comparing, a blank reads
// as "nothing scored yet".
const ChaseRow = ({
  entry,
  share,
  accent,
  accentLight,
  onOpen,
  onPlay,
}: {
  entry: Entry;
  share: number;
  accent: string;
  accentLight: string;
  onOpen: (e: Entry) => void;
  onPlay: (e: Entry) => void;
}) => {
  const hasPoints = entry.votes > 0;

  return (
    <View style={styles.chaseRow}>
      <TouchableOpacity
        style={styles.chaseMain}
        onPress={() => onOpen(entry)}
        accessibilityRole="button"
        accessibilityLabel={`Open ${entry.title}${
          entry.type === 'song' ? ` by ${entry.artist}` : ''
        }, ranked ${entry.rank}`}
        activeOpacity={0.7}
      >
        <Text style={styles.chaseRank}>{entry.rank}</Text>

        {entry.artwork ? (
          <Image source={{ uri: entry.artwork }} style={styles.chaseArt} />
        ) : (
          <View style={[styles.chaseArt, styles.chaseArtEmpty]} />
        )}

        <View style={styles.chaseText}>
          <Text style={styles.chaseTitle} numberOfLines={1}>
            {entry.title}
          </Text>
          {entry.type === 'song' && (
            <Text style={styles.chaseArtist} numberOfLines={1}>
              {entry.artist}
            </Text>
          )}
          <View style={styles.chaseBar}>
            {hasPoints && (
              <View
                style={[styles.chaseFill, { width: `${share}%`, backgroundColor: accent }]}
              />
            )}
          </View>
        </View>

        <Text style={styles.chasePoints}>{hasPoints ? formatNumber(entry.votes) : ''}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.chasePlay, { borderColor: alpha(accentLight, 0.4) }]}
        onPress={() => onPlay(entry)}
        accessibilityRole="button"
        accessibilityLabel={`Listen to ${entry.title}`}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        activeOpacity={0.7}
      >
        <Text style={[styles.chasePlayIcon, { color: accentLight }]}>▶</Text>
      </TouchableOpacity>
    </View>
  );
};

// ─── Screen ──────────────────────────────────────────────────────────────────
const Leaderboardsscreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { requestPlay } = usePlayer();
  const { theme } = useAuth();

  const accent = getThemeHex(theme);
  const accentLight = useMemo(() => lighten(accent), [accent]);

  const [jurisdiction, setJurisdiction] = useState('downtown-harlem');
  const [genre, setGenre] = useState('rap');
  const [category, setCategory] = useState<'artist' | 'song'>('artist');
  const [intervalKey, setIntervalKey] = useState('daily');

  const [results, setResults] = useState<Entry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const loadStandings = useCallback(async () => {
    const jurId = JURISDICTION_IDS[jurisdiction];
    const genreId = GENRE_IDS[genre];
    const intervalId = INTERVAL_IDS[intervalKey];

    // Guard the exact failure the old screen shipped with: a control value
    // that has no entry in IdMappings silently became `undefined` in the URL.
    if (!jurId || !genreId || !intervalId) {
      console.error(LOG, 'unmapped filter', { jurisdiction, genre, intervalKey });
      setError('That combination is unavailable right now.');
      setHasSearched(true);
      return;
    }

    setIsLoading(true);
    setError(null);
    setResults([]);
    setHasSearched(true);

    try {
      const response = await axiosInstance.get(
        `/v1/vote/leaderboards?jurisdictionId=${jurId}&genreId=${genreId}` +
          `&targetType=${category}&intervalId=${intervalId}&limit=50`,
      );
      const raw = response.data;

      if (!Array.isArray(raw) || raw.length === 0) {
        setError('Nothing has scored in this scope yet. Try a wider area or a longer period.');
        return;
      }

      const normalized: Entry[] = raw.map((item: any, i: number) => {
        if (category === 'artist') {
          return {
            id: item.targetId,
            type: 'artist',
            rank: item.rank || i + 1,
            title: item.name || 'Unknown Artist',
            artist: item.name || 'Unknown Artist',
            artistId: item.targetId,
            votes: item.votes || 0,
            artwork: item.artwork ? buildUrl(item.artwork) : null,
            fileUrl: null,
          };
        }
        return {
          id: item.targetId,
          type: 'song',
          rank: item.rank || i + 1,
          title: item.name || 'Unknown Song',
          artist: item.artist || 'Unknown',
          artistId: null,
          votes: item.votes || 0,
          artwork: item.artwork ? buildUrl(item.artwork) : null,
          fileUrl: item.fileUrl ? buildUrl(item.fileUrl) : null,
        };
      });

      setResults(normalized);
    } catch (err) {
      console.error(LOG, 'fetch failed', err);
      setError("Couldn't load the standings. Check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }, [jurisdiction, genre, category, intervalKey]);

  // ── Play ───────────────────────────────────────────────────────────────────
  const handlePlay = useCallback(
    async (entry: Entry) => {
      // Song row with a real file → play it.
      if (entry.fileUrl) {
        const media: MediaItem = {
          type: 'song',
          id: entry.id,
          songId: entry.id,
          url: entry.fileUrl,
          fileUrl: entry.fileUrl,
          title: entry.title,
          artist: entry.artist,
          artistId: entry.artistId ?? undefined,
          artwork: entry.artwork ?? undefined,
          artworkUrl: entry.artwork ?? undefined,
          source: 'leaderboards',
        } as MediaItem;
        requestPlay(media);
        return;
      }

      // Artist row → fetch their default song, then play it.
      if (entry.type === 'artist' && entry.id) {
        try {
          const res = await axiosInstance.get(`/v1/users/${entry.id}/default-song`);
          const song = res.data;
          if (!song?.fileUrl) return; // nothing playable — do nothing

          const url = buildUrl(song.fileUrl);
          const art = buildUrl(song.artworkUrl) || entry.artwork;
          if (!url) return;

          requestPlay({
            type: 'song',
            id: song.songId,
            songId: song.songId,
            url,
            fileUrl: url,
            title: song.title,
            artist: entry.title,
            artistId: entry.id,
            artwork: art ?? undefined,
            artworkUrl: art ?? undefined,
            source: 'leaderboards',
          } as MediaItem);
        } catch (err) {
          console.error(LOG, 'default song fetch failed', err);
        }
      }
    },
    [requestPlay],
  );

  const handleOpen = useCallback(
    (entry: Entry) => {
      if (entry.type === 'artist') navigation.navigate('Artist', { artistId: entry.id });
      else navigation.navigate('Song', { songId: entry.id });
    },
    [navigation],
  );

  // ── Derived: leader, chase, margin ─────────────────────────────────────────
  const leader = results[0] || null;
  const runnerUp = results[1] || null;
  const chase = results.slice(1);

  const marginLabel = useMemo(() => {
    if (!leader) return null;
    if (!runnerUp) return 'Uncontested so far';
    if (leader.votes === runnerUp.votes) return `Tied with ${runnerUp.title}`;
    const gap = leader.votes - runnerUp.votes;
    return `Ahead by ${formatNumber(gap)} ${gap === 1 ? 'point' : 'points'}`;
  }, [leader, runnerUp]);

  const scopeLabel = `${JURISDICTION_LABEL[jurisdiction] || ''} · ${GENRE_LABEL[genre] || ''}`;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* ── Masthead ── */}
        <View style={styles.masthead}>
          <Text style={[styles.eyebrow, { color: accentLight }]}>LIVE STANDINGS</Text>
          <Text style={styles.wordmark}>Leaderboards</Text>
          <Text style={styles.lede}>Who's ahead right now, and by how much.</Text>
        </View>

        {/* ── Controls ── */}
        <View style={styles.controls}>
          <Segmented
            label="Jurisdiction"
            options={JURISDICTIONS}
            value={jurisdiction}
            onChange={setJurisdiction}
            accent={accent}
          />
          <Segmented
            label="Genre"
            options={GENRES}
            value={genre}
            onChange={setGenre}
            accent={accent}
          />
          <Segmented
            label="Category"
            options={CATEGORIES}
            value={category}
            onChange={setCategory}
            accent={accent}
          />
          <View style={styles.controlDivider} />
          <Segmented
            label="Time period"
            options={INTERVAL_OPTIONS}
            value={intervalKey}
            onChange={setIntervalKey}
            accent={accent}
          />

          <TouchableOpacity
            style={[
              styles.submit,
              { backgroundColor: accent, borderColor: alpha(accentLight, 0.5) },
              isLoading && styles.submitOff,
            ]}
            onPress={loadStandings}
            disabled={isLoading}
            accessibilityRole="button"
            accessibilityLabel="Show standings"
            activeOpacity={0.85}
          >
            <Text style={styles.submitText}>{isLoading ? 'Loading' : 'Show standings'}</Text>
          </TouchableOpacity>
        </View>

        {/* ── Results ── */}
        {isLoading ? (
          <View style={styles.state}>
            <ActivityIndicator size="large" color={accentLight} />
            <Text style={styles.stateBody}>Counting the votes and plays…</Text>
          </View>
        ) : error ? (
          <View style={styles.state} accessibilityLiveRegion="polite">
            <Text style={styles.stateTitle}>No standings yet</Text>
            <Text style={styles.stateBody}>{error}</Text>
          </View>
        ) : leader ? (
          <>
            {/* Leader plate */}
            <View style={[styles.plate, { borderColor: alpha(accentLight, 0.28) }]}>
              {leader.artwork && (
                <ImageBackground
                  source={{ uri: leader.artwork }}
                  style={StyleSheet.absoluteFill}
                  imageStyle={styles.plateGlow}
                  blurRadius={40}
                />
              )}
              <View style={styles.plateScrim} />

              <View style={styles.plateInner}>
                <Text style={[styles.plateEyebrow, { color: accentLight }]} numberOfLines={1}>
                  LEADING · {scopeLabel.toUpperCase()}
                </Text>

                <View style={styles.plateHead}>
                  {leader.artwork ? (
                    <Image source={{ uri: leader.artwork }} style={styles.plateArt} />
                  ) : (
                    <View style={[styles.plateArt, styles.chaseArtEmpty]} />
                  )}

                  <View style={styles.plateHeadText}>
                    <Text style={styles.plateTitle} numberOfLines={2}>
                      {leader.title}
                    </Text>
                    {leader.type === 'song' && (
                      <Text style={styles.plateArtist} numberOfLines={1}>
                        {leader.artist}
                      </Text>
                    )}
                  </View>
                </View>

                <View style={styles.plateTally}>
                  <View style={styles.plateScore}>
                    <Text style={styles.plateFigure}>{formatNumber(leader.votes)}</Text>
                    <Text style={styles.plateUnit}>POINTS</Text>
                  </View>
                  <View
                    style={[
                      styles.marginPill,
                      { borderColor: alpha(accentLight, 0.45), backgroundColor: alpha(accent, 0.3) },
                    ]}
                  >
                    <Text style={styles.marginText} numberOfLines={1}>
                      {marginLabel}
                    </Text>
                  </View>
                </View>

                <View style={styles.plateActions}>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnPrimary, { backgroundColor: accent }]}
                    onPress={() => handlePlay(leader)}
                    accessibilityRole="button"
                    accessibilityLabel={`Listen to ${leader.title}`}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.btnText}>Listen</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.btn}
                    onPress={() => handleOpen(leader)}
                    accessibilityRole="button"
                    activeOpacity={0.85}
                  >
                    <Text style={styles.btnText}>
                      {leader.type === 'artist' ? 'View artist' : 'View song'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Chase rail */}
            {chase.length > 0 && (
              <View style={styles.chase}>
                <View style={styles.chaseHead}>
                  <Text style={styles.chaseHeading}>The chase</Text>
                  <Text style={styles.chaseMeta}>Bars measured against the leader</Text>
                </View>

                {chase.map((entry) => (
                  <ChaseRow
                    key={`${entry.type}-${entry.id}`}
                    entry={entry}
                    share={
                      leader.votes > 0
                        ? Math.max(2, Math.round((entry.votes / leader.votes) * 100))
                        : 0
                    }
                    accent={accent}
                    accentLight={accentLight}
                    onOpen={handleOpen}
                    onPlay={handlePlay}
                  />
                ))}
              </View>
            )}
          </>
        ) : (
          <View style={styles.state}>
            <Text style={styles.stateTitle}>{hasSearched ? 'No standings yet' : 'Pick a scope'}</Text>
            <Text style={styles.stateBody}>
              Choose an area, genre and period, then show the standings.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#08090e' },
  content: { paddingHorizontal: 14, paddingTop: 20, paddingBottom: 120 },

  // Masthead
  masthead: { marginBottom: 20 },
  eyebrow: { fontSize: 10, fontWeight: '600', letterSpacing: 2.2, marginBottom: 8 },
  wordmark: { fontSize: 34, fontWeight: '600', letterSpacing: -1, color: INK, lineHeight: 36 },
  lede: { marginTop: 8, fontSize: 13, color: INK_2 },

  // Controls
  controls: {
    padding: 12,
    marginBottom: 22,
    backgroundColor: PLATE,
    borderWidth: 1,
    borderColor: ETCH,
    borderRadius: 14,
  },
  controlDivider: { height: 1, backgroundColor: ETCH, marginVertical: 8 },

  segmented: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 3,
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: ETCH,
    borderRadius: 9,
  },
  seg: {
    flexGrow: 1,
    flexBasis: 'auto',
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 7,
    alignItems: 'center',
  },
  segText: { fontSize: 12.5, fontWeight: '500', color: INK_3 },
  segTextOn: { color: '#fff', fontWeight: '600' },

  submit: {
    marginTop: 4,
    paddingVertical: 13,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
  },
  submitOff: { opacity: 0.55 },
  submitText: { color: '#fff', fontSize: 13.5, fontWeight: '700', letterSpacing: 0.2 },

  // States
  state: {
    padding: 34,
    alignItems: 'center',
    backgroundColor: PLATE,
    borderWidth: 1,
    borderColor: ETCH,
    borderRadius: 14,
  },
  stateTitle: { fontSize: 15, fontWeight: '600', color: INK },
  stateBody: { marginTop: 8, fontSize: 12.5, lineHeight: 19, color: INK_3, textAlign: 'center' },

  // Leader plate
  plate: {
    position: 'relative',
    overflow: 'hidden',
    marginBottom: 20,
    backgroundColor: PLATE_LIFT,
    borderWidth: 1,
    borderRadius: 14,
  },
  plateGlow: { opacity: 0.3, transform: [{ scale: 1.4 }] },
  plateScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(7,9,15,0.82)' },
  plateInner: { padding: 18 },
  plateEyebrow: { fontSize: 9.5, fontWeight: '700', letterSpacing: 1.6, marginBottom: 12 },

  plateHead: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  plateArt: {
    width: 92,
    height: 92,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ETCH_STRONG,
  },
  plateHeadText: { flex: 1, minWidth: 0 },
  plateTitle: { fontSize: 22, fontWeight: '700', letterSpacing: -0.5, color: INK, lineHeight: 26 },
  plateArtist: { marginTop: 4, fontSize: 14, fontStyle: 'italic', color: INK_2 },

  plateTally: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: ETCH,
  },
  plateScore: { flexDirection: 'row', alignItems: 'baseline', gap: 7 },
  plateFigure: { fontSize: 30, fontWeight: '800', letterSpacing: -1, color: INK },
  plateUnit: { fontSize: 9.5, fontWeight: '700', letterSpacing: 1.4, color: INK_3 },

  marginPill: {
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: 999,
    borderWidth: 1,
  },
  marginText: { fontSize: 11.5, fontWeight: '500', color: INK },

  plateActions: { flexDirection: 'row', gap: 9, marginTop: 16 },
  btn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: ETCH_STRONG,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
  },
  btnPrimary: { borderColor: 'transparent' },
  btnText: { fontSize: 12.5, fontWeight: '700', color: INK },

  // Chase rail
  chase: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 4,
    backgroundColor: PLATE,
    borderWidth: 1,
    borderColor: ETCH,
    borderRadius: 14,
  },
  chaseHead: {
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: ETCH,
  },
  chaseHeading: { fontSize: 13, fontWeight: '700', color: INK },
  chaseMeta: { marginTop: 3, fontSize: 11, color: INK_3 },

  chaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: ETCH,
  },
  chaseMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 11,
  },
  chaseRank: {
    width: 22,
    textAlign: 'center',
    fontSize: 12.5,
    fontWeight: '700',
    color: INK_3,
  },
  chaseArt: { width: 42, height: 42, borderRadius: 7, borderWidth: 1, borderColor: ETCH },
  chaseArtEmpty: { backgroundColor: 'rgba(255,255,255,0.05)' },
  chaseText: { flex: 1, minWidth: 0 },
  chaseTitle: { fontSize: 13.5, fontWeight: '500', color: INK_2 },
  chaseArtist: { marginTop: 1, fontSize: 11.5, color: INK_3 },
  chaseBar: {
    height: 5,
    marginTop: 7,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.05)',
    overflow: 'hidden',
  },
  chaseFill: { height: '100%', borderRadius: 3 },
  chasePoints: {
    minWidth: 52,
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '700',
    color: INK_2,
  },

  chasePlay: {
    width: 30,
    height: 30,
    marginLeft: 8,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chasePlayIcon: { fontSize: 11, marginLeft: 2 },
});

export default Leaderboardsscreen;