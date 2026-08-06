// ============================================================================
// JurisdictionScreen.tsx — mobile port of web `jurisdictionPage.jsx` (v5)
//
// The identity page for one place. Three sections, three jobs:
//   1. Hero        — who this place is RIGHT NOW (name, live stats, song of
//                    the week) over a theme-tinted photo backdrop
//   2. Chart       — this week's rankings (top artists, then top tracks)
//   3. Hall of fame — <WinnersTimeline variant="embedded" />
//
// Replaces the previous screen, which was a port of a pre-v4 web design
// (search bar, "local anthems", editorial rail) and predated the mobile QA
// standards set during the SongScreen pass. Brought in line with those:
//   • Theme-aware — every accent derives from useAuth().theme via THEME_HEX,
//     replacing the hardcoded '#163387' / '#2e5aac' palette
//   • buildUrl for every media URL (was `getMediaUrl` from axiosInstance)
//   • useAuth for identity (was hand-rolled SecureStore token reads)
//   • Toast instead of Alert for non-blocking failures
//   • Play buttons route through requestPlay → PlayChoiceModal
//
// PLAY TRACKING — this screen records NO plays. `components/Player.tsx` owns
// that via `schedulePlayTracking` (30s gate). The backend applies a 30-minute
// per-user/per-song cooldown, so a POST fired here at tap time would win that
// race and silently void the gate, crediting an artist for a skipped track and
// leaving the play uncompleted. See docs/QA_FINDINGS 11a.
//
// HERO BACKDROP — the web page blends a stock photo into a theme-derived
// gradient using mix-blend-mode, which RN has no equivalent for. The same
// effect is built here by layering, bottom to top:
//   1. the photo, desaturated by a dark overlay and low opacity
//   2. a LinearGradient in the ACTIVE THEME colour (the tint)
//   3. a scrim gradient protecting the copy
//   4. the ghosted jurisdiction name, kept exactly as on web
// ============================================================================

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ImageBackground,
  ActivityIndicator,
  Animated,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRoute, useNavigation } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';

import { useAuth } from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';
import axiosInstance from '../services/axiosInstance';
import { buildUrl } from '../utils/buildUrl';
import WinnersTimeline from '../components/WinnersTimeline';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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

const lighten = (hex: string, amount = 0.25): string => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix((n >> 16) & 255)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
};

const BG = '#07090f';
const INK = '#ffffff';
const INK_2 = 'rgba(255,255,255,0.72)';
const INK_3 = 'rgba(255,255,255,0.5)';
const INK_4 = 'rgba(255,255,255,0.32)';
const PANEL = 'rgba(255,255,255,0.045)';
const ETCH = 'rgba(255,255,255,0.08)';

const TOAST_MS = 4500;

// ─── Hero backdrop imagery ──────────────────────────────────────────────────
// One stock photo per jurisdiction. To add a real photo: drop it in /assets and
// add a lowercase-name entry here. The backend's `symbolUrl` wins when present,
// so populating that column makes this self-serve with no app release.
const HERO_IMAGES: Record<string, any> = {
  harlem: require('../../assets/heroHarlem.jpg'),
  'uptown harlem': require('../../assets/heroHarlem.jpg'),
  'downtown harlem': require('../../assets/heroHarlem.jpg'),
};
const HERO_DEFAULT = require('../../assets/heroDefault.jpg');

const heroImageFor = (name?: string) =>
  HERO_IMAGES[String(name || '').trim().toLowerCase()] || HERO_DEFAULT;

// ─── Icons ──────────────────────────────────────────────────────────────────
const PlayIcon = ({ size = 14 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="#FFFFFF">
    <Path d="M8 5v14l11-7z" />
  </Svg>
);

// ─── Types ──────────────────────────────────────────────────────────────────
interface RankedArtist {
  id: string;
  rank: number;
  name: string;
  genre: string;
  score: number;
  thumbnail: string | null;
}

interface RankedSong {
  id: string;
  rank: number;
  title: string;
  artist: string;
  artistId?: string;
  score: number;
  thumbnail: string | null;
  fileUrl: string | null;
}

interface JurisdictionData {
  jurisdictionId: string;
  description: string;
  isLeaf: boolean;
  heroImage: any;
  topArtistName: string | null;
  songOfWeek: {
    id: string;
    title: string;
    artist: string;
    artistId?: string;
    image: string | null;
    fileUrl: string | null;
  } | null;
  topArtists: RankedArtist[];
  topSongs: RankedSong[];
}

const JurisdictionScreen: React.FC = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { theme } = useAuth();
  const { requestPlay } = usePlayer();

  const jurName =
    route.params?.jurisdictionName || route.params?.jurisdiction || 'Harlem';

  const accent = getThemeHex(theme);
  const accentLight = useMemo(() => lighten(accent, 0.3), [accent]);

  const [data, setData] = useState<JurisdictionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(
    (message: string) => {
      setToast(message);
      Animated.timing(toastOpacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }).start();

      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => {
        Animated.timing(toastOpacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }).start(() => setToast(null));
      }, TOAST_MS);
    },
    [toastOpacity]
  );

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    []
  );

  // ── Fetch jurisdiction + weekly tops ──
  useEffect(() => {
    let active = true;

    const fetchData = async () => {
      if (!jurName) {
        setError('No jurisdiction specified.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const jurRes = await axiosInstance.get(
          `/v1/jurisdictions/byName/${encodeURIComponent(jurName)}`
        );

        const body = jurRes.data;
        const jurDetails = Array.isArray(body) ? body[0] : body;
        const jurId = jurDetails?.jurisdictionId;

        if (!jurId) throw new Error('Jurisdiction not found');

        const topsRes = await axiosInstance.get(`/v1/jurisdictions/${jurId}/tops`);
        if (!active) return;

        const raw = topsRes.data || {};
        const topArtist = raw.topArtist || (raw.topArtists || [])[0];
        const topSong = raw.topSong || (raw.topSongs || [])[0];

        const normalized: JurisdictionData = {
          jurisdictionId: jurId,

          description:
            jurDetails.bio ||
            `The heartbeat of ${jurName}. Where local artists define the sound of the streets.`,

          // hasChildren is the one hierarchy signal byName gives us.
          isLeaf: jurDetails.hasChildren === false,

          heroImage: buildUrl(jurDetails.symbolUrl)
            ? { uri: buildUrl(jurDetails.symbolUrl) }
            : heroImageFor(jurName),

          topArtistName: topArtist?.username || null,

          songOfWeek: topSong
            ? {
                id: topSong.songId,
                title: topSong.title,
                artist: topSong.artist?.username || 'Unknown',
                artistId: topSong.artist?.userId,
                image: buildUrl(topSong.artworkUrl),
                fileUrl: buildUrl(topSong.fileUrl),
              }
            : null,

          topArtists: (raw.topArtists || []).map((a: any, i: number) => ({
            id: a.userId,
            rank: i + 1,
            name: a.username,
            genre: a.genre?.name || '',
            score: a.score || 0,
            thumbnail: buildUrl(a.photoUrl),
          })),

          // Songs rank by the same weighted-vote score as artists, so both
          // boards read "pts" — no invented "plays" figure.
          topSongs: (raw.topSongs || []).map((s: any, i: number) => ({
            id: s.songId,
            rank: i + 1,
            title: s.title,
            artist: s.artist?.username || 'Unknown',
            artistId: s.artist?.userId,
            score: s.score ?? s.plays ?? 0,
            thumbnail: buildUrl(s.artworkUrl),
            fileUrl: buildUrl(s.fileUrl),
          })),
        };

        console.log(
          `[Jurisdiction] loaded ${jurName}: ${normalized.topArtists.length} artists, ` +
            `${normalized.topSongs.length} tracks`
        );

        setData(normalized);
      } catch (err: any) {
        if (!active) return;
        console.error('[Jurisdiction] fetch error:', err?.message || err);
        setError(`Couldn't load ${jurName}. Check your connection and try again.`);
        setData(null);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchData();

    return () => {
      active = false;
    };
  }, [jurName]);

  // ── Play handlers — request only; Player.tsx records the play ──
  const playSong = useCallback(
    (song: { id: string; title: string; artist: string; artistId?: string; fileUrl: string | null; image?: string | null; thumbnail?: string | null }) => {
      if (!song.fileUrl) {
        showToast("This track isn't available right now.");
        return;
      }

      const art = song.image || song.thumbnail || undefined;

      requestPlay({
        id: song.id,
        songId: song.id,
        title: song.title,
        artist: song.artist,
        url: song.fileUrl,
        fileUrl: song.fileUrl,
        artwork: art,
        artworkUrl: art,
        jurisdiction: jurName,
      });
    },
    [requestPlay, showToast, jurName]
  );

  const playArtist = useCallback(
    async (artist: RankedArtist) => {
      try {
        const res = await axiosInstance.get(`/v1/users/${artist.id}/default-song`);
        const defaultSong = res.data;

        if (!defaultSong?.fileUrl) {
          showToast(`${artist.name} hasn't set a default song yet.`);
          return;
        }

        const url = buildUrl(defaultSong.fileUrl);
        const art = buildUrl(defaultSong.artworkUrl) || artist.thumbnail || undefined;

        requestPlay({
          id: defaultSong.songId,
          songId: defaultSong.songId,
          title: defaultSong.title,
          artist: artist.name,
          url: url || undefined,
          fileUrl: url || undefined,
          artwork: art || undefined,
          artworkUrl: art || undefined,
          jurisdiction: jurName,
        });
      } catch (err: any) {
        console.error('[Jurisdiction] default song fetch failed:', err?.message || err);
        showToast(`Couldn't load ${artist.name}'s song. Try again in a moment.`);
      }
    },
    [requestPlay, showToast, jurName]
  );

  const viewArtist = (artistId: string) =>
    navigation.navigate('Artist', { artistId });
  const viewSong = (songId: string) => navigation.navigate('Song', { songId });

  // ── Loading & error ──
  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={accentLight} />
        <Text style={styles.centeredText}>Loading {jurName}…</Text>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>
          {error || `No data available for ${jurName}`}
        </Text>
      </View>
    );
  }

  const artistsCharting = data.topArtists.length;
  const pointsThisWeek = data.topArtists.reduce((sum, a) => sum + (a.score || 0), 0);

  const renderRow = (
    key: string,
    rank: number,
    art: string | null,
    primary: string,
    secondary: string,
    score: number,
    onPress: () => void,
    onPlay: () => void,
    playLabel: string
  ) => (
    <TouchableOpacity
      key={key}
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`View ${primary}`}
    >
      <Text style={styles.rowRank}>{String(rank).padStart(2, '0')}</Text>

      {art ? (
        <Image source={{ uri: art }} style={styles.rowArt} />
      ) : (
        <View style={[styles.rowArt, styles.rowArtEmpty]} />
      )}

      <View style={styles.rowMain}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {primary}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {secondary}
        </Text>
      </View>

      <View style={styles.rowScore}>
        <Text style={styles.rowScoreValue}>{score.toLocaleString()}</Text>
        <Text style={styles.rowScoreLabel}>PTS</Text>
      </View>

      <TouchableOpacity
        style={[styles.rowPlay, { backgroundColor: accent }]}
        onPress={onPlay}
        accessibilityRole="button"
        accessibilityLabel={playLabel}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <PlayIcon size={12} />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ═══════ 1 · HERO ═══════ */}
        <View style={styles.hero}>
          {/* Layer 1 — the photo, pushed back so it reads as texture */}
          <ImageBackground
            source={data.heroImage}
            style={StyleSheet.absoluteFill}
            imageStyle={styles.heroPhoto}
            blurRadius={2}
          >
            {/* Layer 2 — theme tint. This is what makes the backdrop follow
                the user's palette instead of always being blue. */}
            <LinearGradient
              colors={[
                hexToRgba(accent, 0.82),
                hexToRgba(accent, 0.45),
                hexToRgba(BG, 0.9),
              ]}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.95, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            {/* Layer 3 — scrim, so copy contrast never depends on the photo */}
            <LinearGradient
              colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0.2)', 'rgba(0,0,0,0.75)']}
              locations={[0, 0.45, 1]}
              style={StyleSheet.absoluteFill}
            />
          </ImageBackground>

          {/* Layer 4 — the ghosted jurisdiction name, as on web */}
          <Text style={styles.heroWatermark} numberOfLines={1} allowFontScaling={false}>
            {jurName.toUpperCase()}
          </Text>

          <View style={styles.heroContent}>
            <View style={styles.pills}>
              <View
                style={[
                  styles.pill,
                  {
                    backgroundColor: hexToRgba(accent, 0.35),
                    borderColor: hexToRgba(accent, 0.7),
                  },
                ]}
              >
                <View style={[styles.liveDot, { backgroundColor: accentLight }]} />
                <Text style={[styles.pillText, { color: '#fff' }]}>Live charts</Text>
              </View>

              <View style={styles.pill}>
                <Text style={styles.pillText}>
                  {data.isLeaf ? 'Neighborhood' : 'District'}
                </Text>
              </View>
            </View>

            <Text style={styles.heroTitle}>{jurName}</Text>
            <Text style={styles.heroSubtitle}>{data.description}</Text>

            <View style={styles.stats}>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>TOP ARTIST</Text>
                <Text style={styles.statValue} numberOfLines={1}>
                  {data.topArtistName || 'No artist yet'}
                </Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>TOP TRACK</Text>
                <Text style={styles.statValue} numberOfLines={1}>
                  {data.songOfWeek?.title || 'No track yet'}
                </Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>ARTISTS CHARTING</Text>
                <Text style={styles.statValue}>{artistsCharting}</Text>
              </View>
              <View style={[styles.stat, styles.statLast]}>
                <Text style={styles.statLabel}>POINTS THIS WEEK</Text>
                <Text style={styles.statValue}>{pointsThisWeek.toLocaleString()}</Text>
              </View>
            </View>

            <View style={styles.heroActions}>
              <TouchableOpacity
                style={[styles.primaryAction, { backgroundColor: accent }]}
                onPress={() => navigation.navigate('Vote')}
                accessibilityRole="button"
              >
                <Text style={styles.primaryActionText}>VOTE NOW</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryAction}
                onPress={() => navigation.navigate('Find')}
                accessibilityRole="button"
              >
                <Text style={styles.secondaryActionText}>EXPLORE TRACKS</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ═══════ Song of the week ═══════ */}
        {data.songOfWeek && (
          <TouchableOpacity
            style={styles.featured}
            onPress={() => viewSong(data.songOfWeek!.id)}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel={`Song of the week: ${data.songOfWeek.title}`}
          >
            {data.songOfWeek.image ? (
              <ImageBackground
                source={{ uri: data.songOfWeek.image }}
                style={styles.featuredArt}
                imageStyle={styles.featuredArtImage}
              >
                <LinearGradient
                  colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.95)']}
                  style={StyleSheet.absoluteFill}
                />
              </ImageBackground>
            ) : (
              <View style={[styles.featuredArt, { backgroundColor: PANEL }]} />
            )}

            <View style={styles.featuredOverlay}>
              <View style={styles.featuredKicker}>
                <Text style={styles.featuredKickerText}>SONG OF THE WEEK</Text>
              </View>

              <Text style={styles.featuredTitle} numberOfLines={1}>
                {data.songOfWeek.title}
              </Text>
              <Text style={styles.featuredArtist} numberOfLines={1}>
                {data.songOfWeek.artist}
              </Text>

              <TouchableOpacity
                style={[styles.featuredListen, { backgroundColor: accent }]}
                onPress={() =>
                  playSong({
                    id: data.songOfWeek!.id,
                    title: data.songOfWeek!.title,
                    artist: data.songOfWeek!.artist,
                    artistId: data.songOfWeek!.artistId,
                    fileUrl: data.songOfWeek!.fileUrl,
                    image: data.songOfWeek!.image,
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={`Play song of the week: ${data.songOfWeek.title}`}
              >
                <PlayIcon size={13} />
                <Text style={styles.featuredListenText}>LISTEN NOW</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        )}

        {/* ═══════ 2 · THIS WEEK'S CHART ═══════ */}
        <View style={styles.section}>
          <View style={styles.eyebrowRow}>
            <View style={[styles.eyebrowDot, { backgroundColor: accentLight }]} />
            <Text style={styles.eyebrow}>THIS WEEK'S CHART</Text>
          </View>
          <Text style={styles.sectionTitle}>
            Who {jurName} is{' '}
            <Text style={[styles.sectionTitleAccent, { color: accentLight }]}>backing</Text>
          </Text>

          <View style={styles.board}>
            <Text style={styles.boardTitle}>
              Top <Text style={[styles.boardTitleAccent, { color: accentLight }]}>artists</Text>
            </Text>

            {data.topArtists.length > 0 ? (
              data.topArtists.map((artist) =>
                renderRow(
                  artist.id,
                  artist.rank,
                  artist.thumbnail,
                  artist.name,
                  artist.genre || 'Local artist',
                  artist.score,
                  () => viewArtist(artist.id),
                  () => playArtist(artist),
                  `Play ${artist.name}`
                )
              )
            ) : (
              <Text style={styles.empty}>
                No artists charting yet in {jurName}. The first vote starts the chart.
              </Text>
            )}
          </View>

          <View style={styles.board}>
            <Text style={styles.boardTitle}>
              Top <Text style={[styles.boardTitleAccent, { color: accentLight }]}>tracks</Text>
            </Text>

            {data.topSongs.length > 0 ? (
              data.topSongs.map((song) =>
                renderRow(
                  song.id,
                  song.rank,
                  song.thumbnail,
                  song.title,
                  song.artist,
                  song.score,
                  () => viewSong(song.id),
                  () => playSong(song),
                  `Play ${song.title}`
                )
              )
            ) : (
              <Text style={styles.empty}>
                No tracks charting yet in {jurName}. Upload one and claim the top spot.
              </Text>
            )}
          </View>
        </View>

        {/* ═══════ 3 · HALL OF FAME ═══════ */}
        <View style={styles.section}>
          <WinnersTimeline
            jurisdiction={jurName}
            jurisdictionId={data.jurisdictionId}
            variant="embedded"
            initialInterval="week"
            initialCategory="song"
            initialCount={5}
          />
        </View>
      </ScrollView>

      {/* Toast — replaces the old Alert calls */}
      {toast && (
        <Animated.View
          style={[
            styles.toast,
            { opacity: toastOpacity, borderColor: hexToRgba(accent, 0.6) },
          ]}
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          pointerEvents="none"
        >
          <Text style={styles.toastText}>{toast}</Text>
        </Animated.View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  scroll: { padding: 16, paddingBottom: 120 },

  centered: {
    flex: 1,
    backgroundColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 32,
  },
  centeredText: { color: INK_2, fontSize: 15 },
  errorText: { color: '#ff7272', fontSize: 15, textAlign: 'center' },

  // ── Hero ──
  hero: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: ETCH,
    minHeight: 340,
    justifyContent: 'flex-end',
  },
  // Low opacity + the tint above is the RN stand-in for the web's
  // grayscale + soft-light blend: the photo contributes texture, not colour.
  heroPhoto: { opacity: 0.55 },
  heroWatermark: {
    position: 'absolute',
    right: -6,
    bottom: -14,
    color: 'rgba(255,255,255,0.05)',
    fontSize: 82,
    fontWeight: '900',
    letterSpacing: -5,
  },
  heroContent: { padding: 22 },

  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  pill: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: ETCH,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  pillText: { color: INK_2, fontSize: 12, fontWeight: '700' },
  liveDot: { width: 6, height: 6, borderRadius: 3 },

  heroTitle: {
    color: INK,
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: -2,
    lineHeight: 42,
  },
  heroSubtitle: { marginTop: 12, color: INK_2, fontSize: 15, lineHeight: 22 },

  stats: {
    marginTop: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ETCH,
    backgroundColor: 'rgba(0,0,0,0.35)',
    overflow: 'hidden',
  },
  stat: { padding: 14, borderBottomWidth: 1, borderBottomColor: ETCH },
  statLast: { borderBottomWidth: 0 },
  statLabel: { color: INK_3, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  statValue: {
    marginTop: 6,
    color: INK,
    fontSize: 19,
    fontWeight: '900',
    letterSpacing: -0.6,
  },

  heroActions: { marginTop: 20, gap: 10 },
  primaryAction: {
    minHeight: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActionText: { color: '#fff', fontSize: 13, fontWeight: '800', letterSpacing: 1.2 },
  secondaryAction: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: PANEL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionText: { color: INK, fontSize: 13, fontWeight: '800', letterSpacing: 1.2 },

  // ── Featured ──
  featured: {
    marginTop: 16,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: ETCH,
    minHeight: 240,
    justifyContent: 'flex-end',
  },
  featuredArt: { ...StyleSheet.absoluteFillObject },
  featuredArtImage: { resizeMode: 'cover' },
  featuredOverlay: { padding: 20 },
  featuredKicker: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  featuredKickerText: { color: INK, fontSize: 10, fontWeight: '900', letterSpacing: 1.6 },
  featuredTitle: {
    marginTop: 12,
    color: '#fff',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -1,
  },
  featuredArtist: { marginTop: 4, color: INK_2, fontSize: 14, fontWeight: '600' },
  featuredListen: {
    marginTop: 16,
    minHeight: 44,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  featuredListenText: { color: '#fff', fontSize: 13, fontWeight: '800', letterSpacing: 1.2 },

  // ── Sections ──
  section: { marginTop: 36 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyebrowDot: { width: 6, height: 6, borderRadius: 3 },
  eyebrow: { color: INK_3, fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  sectionTitle: {
    marginTop: 8,
    color: INK,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -1,
  },
  sectionTitleAccent: { fontStyle: 'italic', fontWeight: '400' },

  board: {
    marginTop: 18,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: ETCH,
    backgroundColor: PANEL,
  },
  boardTitle: { color: INK, fontSize: 19, fontWeight: '800', letterSpacing: -0.6, marginBottom: 12 },
  boardTitleAccent: { fontStyle: 'italic', fontWeight: '400' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.045)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    marginBottom: 8,
  },
  rowRank: {
    width: 26,
    textAlign: 'center',
    color: INK_4,
    fontSize: 14,
    fontWeight: '900',
  },
  rowArt: { width: 46, height: 46, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.05)' },
  rowArtEmpty: { borderWidth: 1, borderColor: ETCH },
  rowMain: { flex: 1, minWidth: 0 },
  rowTitle: { color: INK, fontSize: 14, fontWeight: '800' },
  rowMeta: { marginTop: 3, color: INK_3, fontSize: 12, fontWeight: '600' },
  rowScore: { alignItems: 'flex-end', minWidth: 46 },
  rowScoreValue: { color: INK, fontSize: 13, fontWeight: '900' },
  rowScoreLabel: { marginTop: 2, color: INK_4, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  rowPlay: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },

  empty: { color: INK_3, fontSize: 14, lineHeight: 21, paddingVertical: 12 },

  // ── Toast ──
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 96,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: 'rgba(12,14,20,0.96)',
    alignItems: 'center',
  },
  toastText: { color: INK, fontSize: 14, fontWeight: '600', textAlign: 'center', lineHeight: 20 },
});

export default JurisdictionScreen;