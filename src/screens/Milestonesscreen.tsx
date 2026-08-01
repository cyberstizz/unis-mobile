// ============================================================================
// Milestonesscreen.tsx — the Unis award archive, mobile.
//
// Port of the web MilestonesPage. One job: pull up a CLOSED award period and
// show who took it, with receipts.
//
// Four things were wrong in the previous version and are fixed here:
//
//   1. It called /v1/awards/past. The current contract is
//      /v1/awards/period-leaderboard, which returns the ranked tally as well as
//      the winner — the tally is the whole point of the redesigned page.
//   2. maxDate was computed once from "yesterday" and never revisited when the
//      interval changed, so picking a daily date and switching to Annual asked
//      the server for the CURRENT year. That is not a display bug: the backend
//      auto-populates a missing Award on read, so the request persists a winner
//      computed from partial data and locks the cron out of recomputing it.
//   3. It hardcoded unisBlue '#163387' and ignored the user's theme entirely.
//   4. handlePlay called playMedia() directly, bypassing PlayChoiceModal — so a
//      play started here never counted toward the artist's points.
//
// PERIOD SAFETY (see utils/periodBounds.ts)
//   Three layers here, plus AwardService.isPeriodClosed on the backend as the
//   authority: interval-aware maxDate, re-anchoring on interval change, and a
//   refusal in loadPeriod() even if the first two are bypassed.
//
// COMPONENT SCOPE
//   Sub-components live at module scope. Declared inside the screen body they
//   get a fresh identity each render and React remounts whole subtrees on every
//   keystroke — it reads as a flicker.
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
import IntervalDatePicker from '../components/IntervalDatePicker';
import axiosInstance from '../services/axiosInstance';
import buildUrl from '../utils/buildUrl';
import { GENRE_IDS, JURISDICTION_IDS, INTERVAL_IDS } from '../utils/IdMappings';
import {
  getPeriodRange,
  isPeriodComplete,
  getLastCompletedPeriodEnd,
  clampToCompletedPeriod,
  formatPeriodLabel,
  formatPeriodRange,
  getPeriodCloseLabel,
  type Interval,
} from '../utils/periodBounds';

const LOG = '[Milestones]';
const MIN_DATE = '2025-10-26';

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
const ETCH = 'rgba(255,255,255,0.075)';
const ETCH_STRONG = 'rgba(255,255,255,0.14)';

// ─── Options ─────────────────────────────────────────────────────────────────
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

const CATEGORIES: { value: 'song' | 'artist'; label: string }[] = [
  { value: 'song', label: 'Songs' },
  { value: 'artist', label: 'Artists' },
];

const INTERVAL_OPTIONS: { value: Interval; label: string }[] = [
  { value: 'daily', label: 'Day' },
  { value: 'weekly', label: 'Week' },
  { value: 'monthly', label: 'Month' },
  { value: 'quarterly', label: 'Quarter' },
  { value: 'midterm', label: 'Half' },
  { value: 'annual', label: 'Year' },
];

const INTERVAL_TITLE: Record<string, string> = {
  daily: 'of the Day',
  weekly: 'of the Week',
  monthly: 'of the Month',
  quarterly: 'of the Quarter',
  midterm: 'of the Half',
  annual: 'of the Year',
};

const JURISDICTION_LABEL: Record<string, string> = {
  'downtown-harlem': 'Downtown Harlem',
  'uptown-harlem': 'Uptown Harlem',
  harlem: 'Harlem',
};

const TIEBREAKERS: Record<string, (n: number) => string> = {
  PLAYS: (n) => `Tie broken on plays${n ? ` between ${n}` : ''}`,
  LIKES: (n) => `Tie broken on likes${n ? ` between ${n}` : ''}`,
  SCORE: (n) => `Tie broken on lifetime score${n ? ` between ${n}` : ''}`,
  SENIORITY: (n) => `Tie broken on seniority${n ? ` between ${n}` : ''}`,
  FALLBACK: () => 'Decided on engagement — no votes cast',
};

const formatNumber = (n: number | string): string => (Number(n) || 0).toLocaleString('en-US');

interface Entry {
  rank: number;
  id: string;
  targetType: 'song' | 'artist';
  title: string;
  artist: string;
  artistId: string | null;
  fileUrl: string | null;
  artwork: string | null;
  votes: number;
  weightedPoints: number;
  playsCount: number;
  likesCount: number;
  determinationMethod: string | null;
  tiedCandidatesCount: number;
}

interface Shown {
  jurisdiction: string;
  genre: string;
  category: string;
  interval: Interval;
  selectedDate: string;
  empty: boolean;
}

// ─── Segmented control ───────────────────────────────────────────────────────
// Replaces the dropdowns. Small option counts read better as visible choices,
// and it kills the form feel. Wraps rather than scrolling sideways so nothing
// can run off the edge of a narrow phone.
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
          style={[
            styles.seg,
            active && { backgroundColor: accent },
          ]}
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

// ─── One row of the tally ────────────────────────────────────────────────────
// Bar width encodes share of the period's points, so margin of victory is
// legible without reading a number. An entry with no points shows a blank
// points cell — a zero reads as a figure worth comparing, a blank reads as
// "nothing scored". When nothing in the period scored, the rail is dropped.
const TallyRow = ({
  entry,
  share,
  showBar,
  accent,
  accentLight,
  onOpen,
  onPlay,
}: {
  entry: Entry;
  share: number;
  showBar: boolean;
  accent: string;
  accentLight: string;
  onOpen: (e: Entry) => void;
  onPlay: (e: Entry) => void;
}) => {
  const hasPoints = entry.weightedPoints > 0;
  const isWinner = entry.rank === 1;
  const canPlay = entry.targetType === 'song' && !!entry.fileUrl;

  return (
    <View style={styles.tallyRow}>
      <TouchableOpacity
        style={styles.tallyMain}
        onPress={() => onOpen(entry)}
        accessibilityRole="button"
        accessibilityLabel={`Open ${entry.title}${entry.targetType === 'song' ? ` by ${entry.artist}` : ''}, ranked ${entry.rank}`}
        activeOpacity={0.7}
      >
        <Text style={[styles.tallyRank, isWinner && { color: accentLight }]}>{entry.rank}</Text>

        {entry.artwork ? (
          <Image source={{ uri: entry.artwork }} style={styles.tallyArt} />
        ) : (
          <View style={[styles.tallyArt, styles.tallyArtEmpty]} />
        )}

        <View style={styles.tallyText}>
          <Text
            style={[styles.tallyTitle, isWinner && styles.tallyTitleWinner]}
            numberOfLines={1}
          >
            {entry.title}
          </Text>
          {entry.targetType === 'song' && (
            <Text style={styles.tallyArtist} numberOfLines={1}>{entry.artist}</Text>
          )}
          {showBar && (
            <View style={styles.tallyBar}>
              {hasPoints && (
                <View
                  style={[
                    styles.tallyFill,
                    {
                      width: `${share}%`,
                      backgroundColor: isWinner ? accent : 'rgba(255,255,255,0.2)',
                    },
                  ]}
                />
              )}
            </View>
          )}
        </View>

        <Text style={[styles.tallyPoints, isWinner && { color: accentLight }]}>
          {hasPoints ? formatNumber(entry.weightedPoints) : ''}
        </Text>
      </TouchableOpacity>

      {canPlay && (
        <TouchableOpacity
          style={styles.tallyPlay}
          onPress={() => onPlay(entry)}
          accessibilityRole="button"
          accessibilityLabel={`Play ${entry.title}`}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.7}
        >
          <Text style={styles.tallyPlayGlyph}>▶</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

// ─── The screen ──────────────────────────────────────────────────────────────
const MilestonesScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { requestPlay } = usePlayer();
  const { theme } = useAuth();

  const accent = getThemeHex(theme);
  const accentLight = useMemo(() => lighten(accent), [accent]);

  const [jurisdiction, setJurisdiction] = useState('downtown-harlem');
  const [genre, setGenre] = useState('rap');
  const [category, setCategory] = useState<'song' | 'artist'>('song');
  const [interval, setIntervalState] = useState<Interval>('daily');
  const [selectedDate, setSelectedDate] = useState<string>(() => getLastCompletedPeriodEnd('daily'));

  // Frozen at the moment of a successful fetch, so the headline can never
  // describe a period other than the one on screen.
  const [shown, setShown] = useState<Shown | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [totalVotes, setTotalVotes] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const maxDate = useMemo(() => getLastCompletedPeriodEnd(interval), [interval]);
  const periodOpen = selectedDate ? !isPeriodComplete(selectedDate, interval) : false;

  // Switching interval re-anchors the date. Without this the old selection
  // carries across and silently resolves to an unfinished period.
  const handleIntervalChange = useCallback((next: Interval) => {
    setIntervalState(next);
    setSelectedDate((prev) => {
      const clamped = clampToCompletedPeriod(prev, next);
      if (clamped !== prev) {
        console.info(`${LOG} interval → ${next}: re-anchored date ${prev} → ${clamped} (previous selection fell in an open period)`);
      }
      return clamped;
    });
  }, []);

  const jumpToLastClosed = useCallback(() => {
    const end = getLastCompletedPeriodEnd(interval);
    setSelectedDate(end);
    setError(null);
    console.info(`${LOG} jumped to last closed ${interval} period: ${end}`);
  }, [interval]);

  const loadPeriod = useCallback(async () => {
    if (!selectedDate) {
      setError('Pick a period first.');
      return;
    }

    // Layer 3. The picker should never surface an open period, but stale state
    // must not be allowed to trigger a write.
    if (!isPeriodComplete(selectedDate, interval)) {
      console.warn(`${LOG} blocked request for open period: ${interval} ${selectedDate}`);
      setError(null);
      return;
    }

    const jurId = JURISDICTION_IDS[jurisdiction];
    const genreId = GENRE_IDS[genre];
    const intervalId = INTERVAL_IDS[interval];

    if (!jurId || !genreId || !intervalId) {
      console.error(`${LOG} id mapping miss`, { jurisdiction, genre, interval, jurId, genreId, intervalId });
      setError('That combination is not available yet.');
      return;
    }

    const { startDate, endDate } = getPeriodRange(selectedDate, interval);
    setIsLoading(true);
    setError(null);

    try {
      console.info(`${LOG} fetching ${category} ${interval} ${startDate}..${endDate} · ${jurisdiction}/${genre}`);

      const response = await axiosInstance.get(
        `/v1/awards/period-leaderboard?type=${category}&startDate=${startDate}&endDate=${endDate}` +
        `&jurisdictionId=${jurId}&genreId=${genreId}&intervalId=${intervalId}&limit=5`
      );

      // Two shapes supported: the current { winner, leaderboard, totalVotes }
      // and a bare Award array from the older /past contract.
      const payload = response.data || {};
      const rows: any[] = Array.isArray(payload)
        ? payload
        : payload.leaderboard?.length
          ? payload.leaderboard
          : [payload.winner].filter(Boolean);

      if (!rows.length) {
        console.info(`${LOG} no awards for ${interval} ${startDate}..${endDate}`);
        setEntries([]);
        setTotalVotes(0);
        setShown({ jurisdiction, genre, category, interval, selectedDate, empty: true });
        return;
      }

      const normalized: Entry[] = rows.map((row, i) => {
        const isArtist = (row.targetType || category) === 'artist';
        const rawArt = isArtist
          ? (row.user?.photoUrl || row.artwork)
          : (row.song?.artworkUrl || row.artwork);

        return {
          rank: row.rank || i + 1,
          id: row.targetId,
          targetType: isArtist ? 'artist' : 'song',
          title: isArtist
            ? (row.user?.username || row.title || 'Unknown artist')
            : (row.song?.title || row.title || 'Unknown song'),
          artist: isArtist
            ? (row.user?.username || row.artist || '')
            : (row.song?.artist?.username || row.artist || 'Unknown artist'),
          artistId: row.artistId || row.song?.artist?.userId || null,
          fileUrl: buildUrl(row.fileUrl || row.song?.fileUrl),
          artwork: buildUrl(rawArt),
          votes: Number(row.votes ?? row.votesCount ?? 0),
          weightedPoints: Number(row.weightedPoints || 0),
          playsCount: Number(row.playsCount || 0),
          likesCount: Number(row.likesCount || 0),
          determinationMethod: row.determinationMethod || null,
          tiedCandidatesCount: row.tiedCandidatesCount || 0,
        };
      });

      setEntries(normalized);
      setTotalVotes(
        Array.isArray(payload)
          ? normalized.reduce((sum, e) => sum + e.votes, 0)
          : (payload.totalVotes ?? normalized.reduce((sum, e) => sum + e.votes, 0))
      );
      setShown({ jurisdiction, genre, category, interval, selectedDate, empty: false });
      console.info(`${LOG} loaded ${normalized.length} ${category} entries · winner "${normalized[0].title}"`);
    } catch (err: any) {
      const status = err?.response?.status;
      console.error(`${LOG} fetch failed (${status || 'network'})`, err?.message || err);
      setEntries([]);
      setShown(null);
      setError(
        status === 404
          ? 'Nothing was awarded for that period.'
          : 'The archive did not respond. Try again in a moment.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [selectedDate, interval, jurisdiction, genre, category]);

  const openEntry = useCallback((entry: Entry) => {
    if (!entry?.id) return;
    if (entry.targetType === 'artist') navigation.navigate('Artist', { artistId: entry.id });
    else navigation.navigate('Song', { songId: entry.id });
  }, [navigation]);

  // Every play routes through requestPlay so PlayChoiceModal appears and the
  // play is counted to the artist. The previous version called playMedia()
  // directly and neither happened.
  const playEntry = useCallback((entry: Entry) => {
    if (!entry?.fileUrl) {
      console.warn(`${LOG} play unavailable for "${entry?.title}" — no file url`);
      return;
    }
    console.info(`${LOG} play requested: "${entry.title}"`);
    const item: MediaItem = {
      id: entry.id,
      songId: entry.id,
      title: entry.title,
      artist: entry.artist,
      url: entry.fileUrl,
      fileUrl: entry.fileUrl,
      artwork: entry.artwork || undefined,
      artworkUrl: entry.artwork || undefined,
    };
    requestPlay(item);
  }, [requestPlay]);

  const winner = entries[0] || null;
  const maxPoints = entries.reduce((m, e) => Math.max(m, e.weightedPoints), 0);
  const tiebreak = winner?.determinationMethod && TIEBREAKERS[winner.determinationMethod]
    ? TIEBREAKERS[winner.determinationMethod](winner.tiedCandidatesCount)
    : null;

  // Only surface figures that actually happened. A row of zeroes invites the
  // reader to compare nothing against nothing.
  const figures = winner
    ? [
        { key: 'points', label: 'Points', value: winner.weightedPoints, lead: true },
        { key: 'votes', label: 'Votes', value: winner.votes, lead: false },
        { key: 'plays', label: 'Plays', value: winner.playsCount, lead: false },
        { key: 'likes', label: 'Likes', value: winner.likesCount, lead: false },
      ].filter((f) => f.value > 0)
    : [];

  const intervalLabel = INTERVAL_OPTIONS.find((o) => o.value === interval)?.label.toLowerCase() || 'period';

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* ── Masthead ────────────────────────────────────────────────────── */}
      <View style={styles.masthead}>
        <Text style={[styles.eyebrow, { color: accentLight }]}>THE RECORD</Text>
        <Text style={styles.wordmark}>Milestones</Text>
        <Text style={styles.lede}>Every closed period, and who took it.</Text>
      </View>

      {/* ── Controls ────────────────────────────────────────────────────── */}
      <View style={styles.controls}>
        <Segmented label="Jurisdiction" options={JURISDICTIONS} value={jurisdiction} onChange={setJurisdiction} accent={accent} />

        <View style={styles.controlPair}>
          <View style={styles.controlHalf}>
            <Segmented label="Genre" options={GENRES} value={genre} onChange={setGenre} accent={accent} />
          </View>
          <View style={styles.controlHalf}>
            <Segmented label="Category" options={CATEGORIES} value={category} onChange={setCategory} accent={accent} />
          </View>
        </View>

        <View style={[styles.controlDivider, { borderTopColor: ETCH }]}>
          <Segmented label="Interval" options={INTERVAL_OPTIONS} value={interval} onChange={handleIntervalChange} accent={accent} />
        </View>

        <View style={styles.periodRow}>
          <View style={styles.periodPicker}>
            <IntervalDatePicker
              interval={interval}
              value={selectedDate}
              onChange={setSelectedDate}
              maxDate={maxDate}
              minDate={MIN_DATE}
              accent={accent}
            />
          </View>
          {!!selectedDate && !periodOpen && (
            <Text style={styles.periodRange}>{formatPeriodRange(selectedDate, interval)}</Text>
          )}
        </View>

        <TouchableOpacity
          style={[
            styles.submit,
            { backgroundColor: accent, borderColor: alpha(accent, 0.6) },
            (isLoading || periodOpen || !selectedDate) && styles.submitOff,
          ]}
          onPress={loadPeriod}
          disabled={isLoading || periodOpen || !selectedDate}
          accessibilityRole="button"
          accessibilityLabel="Show winner"
          accessibilityState={{ disabled: isLoading || periodOpen || !selectedDate, busy: isLoading }}
          activeOpacity={0.85}
        >
          <Text style={styles.submitText}>{isLoading ? 'Loading' : 'Show winner'}</Text>
        </TouchableOpacity>

        {/* Open period: direction, not an error. */}
        {periodOpen && (
          <View
            style={[styles.notice, { backgroundColor: alpha(accent, 0.1), borderColor: alpha(accent, 0.3) }]}
            accessibilityLiveRegion="polite"
          >
            <Text style={styles.noticeTitle}>
              This {interval === 'daily' ? 'day' : intervalLabel} is still running.
            </Text>
            <Text style={styles.noticeBody}>
              Results are final after {getPeriodCloseLabel(selectedDate, interval)}. Votes, plays and likes are still landing until then.
            </Text>
            <TouchableOpacity
              style={[styles.noticeAction, { borderColor: alpha(accent, 0.5) }]}
              onPress={jumpToLastClosed}
              accessibilityRole="button"
              activeOpacity={0.8}
            >
              <Text style={[styles.noticeActionText, { color: accentLight }]}>
                Go to {formatPeriodLabel(getLastCompletedPeriodEnd(interval), interval)}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ── Result ──────────────────────────────────────────────────────── */}
      {isLoading && (
        <View style={styles.loading} accessibilityLiveRegion="polite">
          <ActivityIndicator size="large" color={accentLight} />
          <Text style={styles.loadingText}>Loading the archive</Text>
        </View>
      )}

      {!isLoading && !!error && (
        <View style={[styles.message, styles.messageError]} accessibilityLiveRegion="assertive">
          <Text style={styles.messageErrorText}>{error}</Text>
        </View>
      )}

      {!isLoading && !error && shown?.empty && (
        <View style={styles.message}>
          <Text style={styles.messageText}>
            No award was recorded for {formatPeriodLabel(shown.selectedDate, shown.interval)} in {JURISDICTION_LABEL[shown.jurisdiction]}. Try another period or genre.
          </Text>
        </View>
      )}

      {!isLoading && !error && winner && shown && !shown.empty && (
        <View>
          {/* Headline */}
          <View style={styles.headline}>
            <Text style={[styles.headlineKicker, { color: accentLight }]}>
              {JURISDICTION_LABEL[shown.jurisdiction].toUpperCase()} · {(GENRES.find((g) => g.value === shown.genre)?.label || '').toUpperCase()}
            </Text>
            <Text style={styles.headlineTitle}>
              {shown.category === 'artist' ? 'Artist' : 'Song'} {INTERVAL_TITLE[shown.interval]}
            </Text>
            <Text style={styles.headlinePeriod}>
              {formatPeriodLabel(shown.selectedDate, shown.interval)}
            </Text>
          </View>

          {/* Plate — the engraved record */}
          <View style={styles.plate}>
            {!!winner.artwork && (
              <ImageBackground
                source={{ uri: winner.artwork }}
                style={StyleSheet.absoluteFill}
                imageStyle={styles.plateGlow}
                blurRadius={40}
              />
            )}

            <View style={styles.plateInner}>
              {winner.artwork ? (
                <Image source={{ uri: winner.artwork }} style={styles.plateArt} />
              ) : (
                <View style={[styles.plateArt, styles.tallyArtEmpty]} />
              )}

              <View style={[styles.crown, { backgroundColor: accent }]}>
                <Text style={styles.crownText}>WINNER</Text>
              </View>

              <Text style={styles.plateName}>{winner.title}</Text>
              {shown.category === 'song' && <Text style={styles.plateBy}>{winner.artist}</Text>}

              {figures.length > 0 ? (
                <View style={[styles.figures, { borderTopColor: ETCH }]}>
                  {figures.map((f) => (
                    <View key={f.key} style={styles.figure}>
                      <Text style={styles.figureLabel}>{f.label.toUpperCase()}</Text>
                      <Text style={[styles.figureValue, f.lead && { fontSize: 22, color: accentLight }]}>
                        {formatNumber(f.value)}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                // Nothing scored at all. The determination line takes the
                // figures' place rather than sitting under a row of zeroes.
                <View style={[styles.figuresEmpty, { borderTopColor: ETCH }]}>
                  <Text style={styles.figuresEmptyText}>
                    {tiebreak || 'No engagement recorded for this period'}
                  </Text>
                </View>
              )}

              {!!tiebreak && figures.length > 0 && (
                <Text style={styles.plateNote}>{tiebreak}</Text>
              )}

              <View style={styles.plateActions}>
                {shown.category === 'song' && !!winner.fileUrl && (
                  <TouchableOpacity
                    style={[styles.action, styles.actionPrimary, { backgroundColor: accent, borderColor: alpha(accent, 0.6) }]}
                    onPress={() => playEntry(winner)}
                    accessibilityRole="button"
                    accessibilityLabel={`Play ${winner.title}`}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.actionText}>▶  Play</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.action}
                  onPress={() => openEntry(winner)}
                  accessibilityRole="button"
                  activeOpacity={0.85}
                >
                  <Text style={styles.actionText}>
                    {shown.category === 'artist' ? 'View artist' : 'View song'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Tally — the signature */}
          <View style={styles.tally}>
            <View style={[styles.tallyHead, { borderBottomColor: ETCH }]}>
              <Text style={styles.tallyHeading}>THE TALLY</Text>
              <Text style={styles.tallyMeta}>
                {totalVotes > 0 ? `${formatNumber(totalVotes)} votes cast` : 'Decided on engagement'}
              </Text>
            </View>

            {entries.map((entry) => (
              <TallyRow
                key={entry.id || String(entry.rank)}
                entry={entry}
                showBar={maxPoints > 0}
                share={maxPoints > 0 && entry.weightedPoints > 0
                  ? Math.max(4, (entry.weightedPoints / maxPoints) * 100)
                  : 0}
                accent={accent}
                accentLight={accentLight}
                onOpen={openEntry}
                onPlay={playEntry}
              />
            ))}

            {entries.length === 1 && (
              <Text style={styles.tallySolo}>
                One entry qualified in this category for this period.
              </Text>
            )}
          </View>
        </View>
      )}

      {!isLoading && !error && !shown && !periodOpen && (
        <View style={[styles.invite, { borderColor: ETCH_STRONG }]}>
          <Text style={styles.inviteText}>
            Pick a jurisdiction, genre and period, then show the winner.
          </Text>
        </View>
      )}
    </ScrollView>
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
  controlPair: { flexDirection: 'row', gap: 8, marginTop: 8 },
  controlHalf: { flex: 1 },
  controlDivider: { marginTop: 12, paddingTop: 12, borderTopWidth: 1 },

  segmented: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 3,
    gap: 2,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: ETCH,
    borderRadius: 9,
  },
  seg: {
    flexGrow: 1,
    flexBasis: '30%',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 7,
    alignItems: 'center',
  },
  segText: { fontSize: 12, fontWeight: '500', color: INK_3 },
  segTextOn: { color: INK, fontWeight: '600' },

  periodRow: { marginTop: 12, gap: 6 },
  periodPicker: { width: '100%' },
  periodRange: { fontSize: 11, color: INK_3, textAlign: 'center' },

  submit: {
    marginTop: 10,
    paddingVertical: 12,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: 'center',
  },
  submitOff: { opacity: 0.38 },
  submitText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  notice: { marginTop: 12, padding: 14, borderWidth: 1, borderRadius: 10 },
  noticeTitle: { fontSize: 13, fontWeight: '600', color: INK, marginBottom: 4 },
  noticeBody: { fontSize: 12, lineHeight: 18, color: INK_2 },
  noticeAction: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderRadius: 7,
  },
  noticeActionText: { fontSize: 12, fontWeight: '600' },

  // States
  loading: { paddingVertical: 60, alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 13, color: INK_3 },

  message: {
    padding: 22,
    backgroundColor: PLATE,
    borderWidth: 1,
    borderColor: ETCH,
    borderRadius: 14,
  },
  messageText: { fontSize: 13, lineHeight: 20, color: INK_2, textAlign: 'center' },
  messageError: { borderColor: 'rgba(255,120,120,0.28)', backgroundColor: 'rgba(255,90,90,0.06)' },
  messageErrorText: { fontSize: 13, color: '#ffb4b4', textAlign: 'center' },

  invite: {
    paddingVertical: 40,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 14,
  },
  inviteText: { fontSize: 13, color: INK_3, textAlign: 'center' },

  // Headline
  headline: { marginBottom: 14 },
  headlineKicker: { fontSize: 10, fontWeight: '600', letterSpacing: 2, marginBottom: 6 },
  headlineTitle: { fontSize: 22, fontWeight: '600', letterSpacing: -0.4, color: INK },
  headlinePeriod: { marginTop: 4, fontSize: 13, color: INK_2 },

  // Plate
  plate: {
    overflow: 'hidden',
    backgroundColor: PLATE,
    borderWidth: 1,
    borderColor: ETCH_STRONG,
    borderRadius: 14,
  },
  plateGlow: { opacity: 0.28, transform: [{ scale: 1.4 }] },
  plateInner: { padding: 18 },
  plateArt: {
    width: 148,
    height: 148,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ETCH_STRONG,
    marginBottom: 14,
  },
  crown: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 5,
    marginBottom: 10,
  },
  crownText: { fontSize: 9, fontWeight: '700', letterSpacing: 1.8, color: '#fff' },
  plateName: { fontSize: 30, fontWeight: '400', lineHeight: 33, letterSpacing: -0.5, color: INK },
  plateBy: { marginTop: 6, fontSize: 14, color: INK_2 },

  figures: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    gap: 10,
  },
  figure: { flexGrow: 1, flexBasis: '20%', minWidth: 58 },
  figureLabel: { fontSize: 8, fontWeight: '600', letterSpacing: 1, color: INK_3, marginBottom: 4 },
  figureValue: { fontSize: 15, fontWeight: '600', color: INK_2 },

  figuresEmpty: { marginTop: 18, paddingTop: 14, borderTopWidth: 1 },
  figuresEmptyText: { fontSize: 13, lineHeight: 20, color: INK_3 },

  plateNote: { marginTop: 12, fontSize: 11, color: INK_3 },

  plateActions: { flexDirection: 'row', gap: 8, marginTop: 16 },
  action: {
    flex: 1,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: ETCH_STRONG,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
  },
  actionPrimary: {},
  actionText: { fontSize: 13, fontWeight: '600', color: INK },

  // Tally
  tally: {
    marginTop: 14,
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: PLATE,
    borderWidth: 1,
    borderColor: ETCH,
    borderRadius: 14,
  },
  tallyHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    marginBottom: 2,
  },
  tallyHeading: { fontSize: 10, fontWeight: '700', letterSpacing: 2, color: INK_2 },
  tallyMeta: { fontSize: 11, color: INK_3 },

  tallyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ETCH,
  },
  tallyMain: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
  tallyRank: { width: 18, textAlign: 'center', fontSize: 12, fontWeight: '600', color: INK_3 },
  tallyArt: { width: 38, height: 38, borderRadius: 6, borderWidth: 1, borderColor: ETCH },
  tallyArtEmpty: { backgroundColor: 'rgba(255,255,255,0.05)' },
  tallyText: { flex: 1, minWidth: 0 },
  tallyTitle: { fontSize: 13, fontWeight: '500', color: INK_2 },
  tallyTitleWinner: { color: INK, fontWeight: '600' },
  tallyArtist: { fontSize: 11, color: INK_3, marginTop: 1 },
  tallyBar: {
    height: 4,
    marginTop: 6,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.05)',
    overflow: 'hidden',
  },
  tallyFill: { height: '100%', borderRadius: 2 },
  tallyPoints: { minWidth: 52, textAlign: 'right', fontSize: 13, fontWeight: '600', color: INK_2 },
  tallyPlay: {
    width: 30,
    height: 30,
    marginLeft: 6,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: ETCH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tallyPlayGlyph: { fontSize: 10, color: INK_2, marginLeft: 2 },

  tallySolo: { marginVertical: 12, fontSize: 11, textAlign: 'center', color: INK_3 },
});

export default MilestonesScreen;