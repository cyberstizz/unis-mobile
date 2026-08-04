// src/screens/DiscoverScreen.tsx
//
// Mobile port of the web DiscoverPage. Behaviour is 1:1 with web:
//   • Three jurisdictions — Harlem (parent, rolls up its children server-side),
//     Uptown Harlem, Downtown Harlem. No "Everywhere".
//   • "All" shows one horizontal rail per type; a single type shows a grid.
//   • 10 at a time, "Show more" pulls the next 10 by offset.
//   • Playlists, users and songs all come from /v1/search (search_all v4, which
//     has the recursive jurisdiction rollup). Videos come from the media
//     endpoints because they are not in the search index.
//   • Play goes through requestPlay → PlayChoiceModal. This screen NEVER counts
//     a play; Player.tsx owns the 15s/25% gate.
//   • Theme-aware via useAuth().theme → THEME_HEX, matching SongScreen and
//     EarningsScreen.

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  Modal,
  Pressable,
  Dimensions,
  useWindowDimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import axiosInstance from '../services/axiosInstance';
import { buildUrl } from '../utils/buildUrl';
import { JURISDICTION_IDS } from '../utils/IdMappings';
import { useAuth } from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';

// ─── Theme — mirrors web --unis-primary / ThemePicker / SongScreen ────────────
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

const hexToRgba = (hex: string, alpha: number): string => {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// Static surfaces, matching the web page's dark token layer.
const BG = '#07090F';
const SURFACE = '#0D1018';
const SURFACE_2 = '#11141D';
const BORDER = 'rgba(255,255,255,0.08)';
const BORDER_HI = 'rgba(255,255,255,0.14)';
const TEXT = '#FFFFFF';
const TEXT_2 = 'rgba(255,255,255,0.78)';
const TEXT_3 = 'rgba(255,255,255,0.55)';
const TEXT_4 = 'rgba(255,255,255,0.35)';

// ─── Constants — kept in step with the web page ──────────────────────────────
type TypeKey = 'all' | 'user' | 'playlist' | 'song' | 'video';

const TYPES: { key: TypeKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'user', label: 'Users' },
  { key: 'playlist', label: 'Playlists' },
  { key: 'song', label: 'Songs' },
  { key: 'video', label: 'Videos' },
];

const RAIL_TYPES: TypeKey[] = ['user', 'playlist', 'song', 'video'];
const RAIL_LIMIT = 10;
const GRID_LIMIT = 10;

const RAIL_TITLES: Record<string, string> = {
  all: 'Everything',
  user: 'Users',
  playlist: 'Playlists',
  song: 'Songs',
  video: 'Videos',
};

// Harlem is the parent and resolves to the union of its children server-side
// (search_all v4 rolls the hierarchy up), so it needs no special handling here.
// There is deliberately no "Everywhere": every user belongs to a child
// jurisdiction, so they are always reachable by selecting a scope they're in.
type Scope = { id: string; name: string; level: string };

const SCOPE_OPTIONS: Scope[] = [
  { id: JURISDICTION_IDS.harlem, name: 'Harlem', level: 'Uptown + Downtown' },
  { id: JURISDICTION_IDS['uptown-harlem'], name: 'Uptown Harlem', level: 'Neighborhood' },
  { id: JURISDICTION_IDS['downtown-harlem'], name: 'Downtown Harlem', level: 'Neighborhood' },
];
const DEFAULT_SCOPE = SCOPE_OPTIONS[0];
const scopeById = (id?: string | null): Scope | null =>
  id ? SCOPE_OPTIONS.find((o) => o.id === id) || null : null;

// Videos are the only type whose endpoint has no limit/offset, so that grid
// pages in memory. Everything else pages server-side.
const CLIENT_PAGED = new Set<TypeKey>(['video']);

// ─── Result shape ────────────────────────────────────────────────────────────
interface Result {
  id: string;
  name: string;
  subtitle: string;
  type: string;
  artworkUrl: string | null;
  score: number;
  extra?: Record<string, any>;
}

type Buckets = Record<string, Result[]>;
const EMPTY_BUCKETS: Buckets = { user: [], playlist: [], song: [], video: [] };

// ─── Helpers ─────────────────────────────────────────────────────────────────
// Durations are MILLISECONDS at every source (Song.duration and Video.duration
// are both `Integer // in milliseconds`). Converted once here, at the edge.
const msToSecs = (ms: any): number | null => {
  const v = Number(ms);
  return Number.isFinite(v) && v > 0 ? Math.round(v / 1000) : null;
};

const fmtDuration = (secs: number | null | undefined): string | null => {
  const s = Number(secs);
  if (!Number.isFinite(s) || s <= 0) return null;
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, '0')}`;
};

const fmtCount = (n: any): string => {
  const v = Number(n) || 0;
  if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
  return `${v}`;
};

// ─── Normalisers ─────────────────────────────────────────────────────────────
const normalizeSearchResult = (r: any): Result => {
  if (!r || r.extra?.duration == null) return r;
  return { ...r, extra: { ...r.extra, duration: msToSecs(r.extra.duration) } };
};

const normalizeVideo = (v: any): Result => ({
  id: v.videoId,
  name: v.title,
  subtitle: v.artist?.username || 'Unknown artist',
  type: 'video',
  artworkUrl: v.artworkUrl || null,
  score: v.playCount ?? v.score ?? 0,
  extra: {
    duration: msToSecs(v.duration),
    jurisdiction: v.jurisdiction?.name || null,
  },
});

// ─── Fetchers ────────────────────────────────────────────────────────────────
interface FetchOpts {
  q: string;
  type: TypeKey;
  jurisdictionId: string | null;
  limit: number;
  offset: number;
}

const fetchSearch = async (opts: FetchOpts): Promise<Result[]> => {
  const params: Record<string, string> = {
    q: opts.q || '',
    type: opts.type,
    limit: String(opts.limit),
    offset: String(opts.offset),
  };
  if (opts.jurisdictionId) params.jurisdictionId = opts.jurisdictionId;

  const res = await axiosInstance.get('/v1/search', { params });
  const items = (res.data?.results || []).map(normalizeSearchResult);
  console.log(
    `[Discover] search type=${opts.type} q="${opts.q}" scope=${opts.jurisdictionId} → ${items.length} result(s)`
  );
  return items;
};

const fetchVideos = async (opts: FetchOpts): Promise<Result[]> => {
  const url = opts.jurisdictionId
    ? `/v1/media/videos/jurisdiction/${opts.jurisdictionId}`
    : '/v1/media/videos/recent';

  const res = await axiosInstance.get(url, { params: { limit: 100 } });
  const items = (Array.isArray(res.data) ? res.data : []).map(normalizeVideo);
  console.log(`[Discover] videos scope=${opts.jurisdictionId} → ${items.length} result(s)`);

  // The video endpoints take no text query — filter in memory so the Videos
  // rail still responds to the search field.
  const needle = (opts.q || '').trim().toLowerCase();
  if (!needle) return items;
  return items.filter(
    (v: Result) =>
      v.name?.toLowerCase().includes(needle) || v.subtitle?.toLowerCase().includes(needle)
  );
};

const fetchByType = (opts: FetchOpts): Promise<Result[]> =>
  opts.type === 'video' ? fetchVideos(opts) : fetchSearch(opts);

// ─── Cards ───────────────────────────────────────────────────────────────────
const AVATAR = 84;

const UserCard: React.FC<{ item: Result; width: number; onOpen: (i: Result) => void }> = ({
  item,
  width,
  onOpen,
}) => {
  const role = item.extra?.role === 'listener' || item.type === 'listener' ? 'listener' : 'artist';
  const tier = String(item.extra?.level || 'silver').toLowerCase();
  const art = buildUrl(item.artworkUrl);
  const initial = (item.name || '?').charAt(0).toUpperCase();
  const ringColor =
    tier === 'platinum' ? '#EEF2F8' : tier === 'gold' ? '#F7E58A' : '#D3DAE4';

  return (
    <TouchableOpacity
      style={[styles.userCard, { width }]}
      onPress={() => onOpen(item)}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${role === 'artist' ? 'Artist' : 'Listener'}, ${tier} tier`}
    >
      <View
        style={[
          styles.avatarRing,
          {
            borderColor: role === 'listener' ? BORDER_HI : ringColor,
            borderWidth: role === 'listener' ? 2 : 3,
          },
        ]}
      >
        {art ? (
          <Image source={{ uri: art }} style={styles.avatarImg} />
        ) : (
          <View style={[styles.avatarImg, styles.avatarFallback]}>
            <Text style={styles.avatarInitial}>{initial}</Text>
          </View>
        )}
      </View>
      <Text style={styles.userRole} numberOfLines={1}>
        {role === 'artist' ? 'ARTIST' : 'LISTENER'} · {tier.toUpperCase()}
      </Text>
      <Text style={styles.userName} numberOfLines={1}>
        {item.name}
      </Text>
      <Text style={styles.userPoints}>◆ {fmtCount(item.score)}</Text>
    </TouchableOpacity>
  );
};

const PlaylistCard: React.FC<{ item: Result; width: number; onOpen: (i: Result) => void }> = ({
  item,
  width,
  onOpen,
}) => {
  const art = buildUrl(item.artworkUrl);
  const count = item.extra?.songCount;
  return (
    <TouchableOpacity
      style={[styles.plCard, { width, height: width }]}
      onPress={() => onOpen(item)}
      accessibilityRole="button"
      accessibilityLabel={`Playlist ${item.name}`}
    >
      {art ? (
        <Image source={{ uri: art }} style={StyleSheet.absoluteFill as any} />
      ) : (
        <View style={[StyleSheet.absoluteFill as any, { backgroundColor: SURFACE_2 }]} />
      )}
      <View style={styles.plScrim} />
      <View style={styles.plMeta}>
        <Text style={styles.plTitle} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.plCount} numberOfLines={1}>
          {item.subtitle}
          {count != null ? ` · ${count} tracks` : ''}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const SongCard: React.FC<{
  item: Result;
  width: number;
  accent: string;
  onOpen: (i: Result) => void;
  onPlay: (i: Result) => void;
}> = ({ item, width, accent, onOpen, onPlay }) => {
  const art = buildUrl(item.artworkUrl);
  const dur = fmtDuration(item.extra?.duration);
  return (
    <View style={{ width }}>
      <TouchableOpacity
        style={[styles.songArt, { width, height: width }]}
        onPress={() => onOpen(item)}
        accessibilityRole="button"
        accessibilityLabel={`Open ${item.name} by ${item.subtitle || 'unknown artist'}`}
      >
        {art ? (
          <Image source={{ uri: art }} style={StyleSheet.absoluteFill as any} />
        ) : (
          <View style={[StyleSheet.absoluteFill as any, { backgroundColor: SURFACE_2 }]} />
        )}
        {dur && (
          <View style={styles.durPill}>
            <Text style={styles.durText}>{dur}</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Sibling of the card, never nested inside it — the play control has to
          be its own accessible element. */}
      <TouchableOpacity
        style={[styles.playFab, { backgroundColor: accent }]}
        onPress={() => onPlay(item)}
        accessibilityRole="button"
        accessibilityLabel={`Play ${item.name}`}
      >
        <Text style={styles.playGlyph}>▶</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => onOpen(item)}>
        <Text style={styles.songTitle} numberOfLines={1}>
          {item.name}
        </Text>
      </TouchableOpacity>
      <View style={styles.songRow}>
        <Text style={styles.songArtist} numberOfLines={1}>
          {item.subtitle}
        </Text>
        {item.score > 0 && (
          <View style={[styles.playsPill, { backgroundColor: hexToRgba(accent, 0.18) }]}>
            <Text style={[styles.playsText, { color: accent }]}>▸ {fmtCount(item.score)}</Text>
          </View>
        )}
      </View>
    </View>
  );
};

const VideoCard: React.FC<{ item: Result; width: number; onOpen: (i: Result) => void }> = ({
  item,
  width,
  onOpen,
}) => {
  const art = buildUrl(item.artworkUrl);
  const dur = fmtDuration(item.extra?.duration);
  const h = Math.round((width * 9) / 16);
  return (
    <TouchableOpacity
      style={{ width }}
      onPress={() => onOpen(item)}
      accessibilityRole="button"
      accessibilityLabel={`Play video ${item.name} by ${item.subtitle || 'unknown artist'}`}
    >
      <View style={[styles.vidFrame, { width, height: h }]}>
        {art ? (
          <Image source={{ uri: art }} style={StyleSheet.absoluteFill as any} />
        ) : (
          <View style={[StyleSheet.absoluteFill as any, { backgroundColor: SURFACE_2 }]} />
        )}
        <View style={styles.vidPlayWrap}>
          <View style={styles.vidPlayCircle}>
            <Text style={styles.playGlyph}>▶</Text>
          </View>
        </View>
        {dur && (
          <View style={[styles.durPill, { left: undefined, right: 8 }]}>
            <Text style={styles.durText}>{dur}</Text>
          </View>
        )}
      </View>
      <Text style={styles.songTitle} numberOfLines={1}>
        {item.name}
      </Text>
      <Text style={styles.songArtist} numberOfLines={1}>
        {item.subtitle}
      </Text>
    </TouchableOpacity>
  );
};

// ─── Screen ──────────────────────────────────────────────────────────────────
const DiscoverScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { user, theme } = useAuth();
  const { requestPlay } = usePlayer();
  const { width: winWidth } = useWindowDimensions();

  const accent = getThemeHex(theme);

  const [activeType, setActiveType] = useState<TypeKey>('all');
  const [inputValue, setInputValue] = useState('');
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<Scope>(DEFAULT_SCOPE);
  const [scopeOpen, setScopeOpen] = useState(false);

  const [buckets, setBuckets] = useState<Buckets>(EMPTY_BUCKETS);
  const [gridItems, setGridItems] = useState<Result[]>([]);
  const [gridHasMore, setGridHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientPageRef = useRef<Result[]>([]);
  // Monotonic request id — guards against a slow "Show more" landing after the
  // query or scope has already moved on.
  const reqIdRef = useRef(0);

  // Card widths. Rails are fixed-width and scroll; grids are two-up.
  const gutter = 16;
  const gridCols = 2;
  const gridW = Math.floor((winWidth - gutter * 2 - gutter * (gridCols - 1)) / gridCols);
  const railW = { user: 110, playlist: 150, song: 150, video: 230 } as Record<string, number>;

  // ── default scope from the signed-in user's jurisdiction ──
  // AuthContext already holds the full profile — no second profile fetch.
  useEffect(() => {
    const jid = (user as any)?.jurisdiction?.jurisdictionId;
    const known = scopeById(jid);
    if (known) {
      console.log(`[Discover] scope resolved from profile → ${known.name}`);
      setScope(known);
    }
  }, [user]);

  // ── debounce the input into the effective query ──
  useEffect(() => {
    const t = setTimeout(() => setQuery(inputValue.trim()), 300);
    return () => clearTimeout(t);
  }, [inputValue]);

  // ── main fetch ──
  useEffect(() => {
    const reqId = ++reqIdRef.current;
    const isCurrent = () => reqIdRef.current === reqId;

    setLoading(true);
    setError(null);

    if (activeType === 'all') {
      Promise.all(
        RAIL_TYPES.map((type) =>
          fetchByType({ q: query, type, jurisdictionId: scope.id, limit: RAIL_LIMIT, offset: 0 })
            .then((items) => [type, items.slice(0, RAIL_LIMIT), null] as const)
            .catch((err) => {
              console.error(`[Discover] rail "${type}" failed:`, err?.message || err);
              return [type, [] as Result[], err] as const;
            })
        )
      ).then((triples) => {
        if (!isCurrent()) return;
        const next: Buckets = { ...EMPTY_BUCKETS };
        triples.forEach(([type, items]) => {
          next[type] = items;
        });
        setBuckets(next);
        // One dead rail shouldn't blank the page.
        setError(triples.every(([, , e]) => e) ? "We couldn't load Discover just now." : null);
        setLoading(false);
      });
      return;
    }

    clientPageRef.current = [];
    fetchByType({ q: query, type: activeType, jurisdictionId: scope.id, limit: GRID_LIMIT, offset: 0 })
      .then((items) => {
        if (!isCurrent()) return;
        if (CLIENT_PAGED.has(activeType)) {
          clientPageRef.current = items;
          setGridItems(items.slice(0, GRID_LIMIT));
          setGridHasMore(items.length > GRID_LIMIT);
        } else {
          setGridItems(items);
          setGridHasMore(items.length === GRID_LIMIT);
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!isCurrent()) return;
        console.error(`[Discover] grid "${activeType}" failed:`, err?.message || err);
        setGridItems([]);
        setGridHasMore(false);
        setError("We couldn't load these results.");
        setLoading(false);
      });
  }, [activeType, query, scope.id]);

  const showMore = useCallback(() => {
    const reqId = reqIdRef.current;
    const isCurrent = () => reqIdRef.current === reqId;

    if (CLIENT_PAGED.has(activeType)) {
      setGridItems((prev) => {
        const next = clientPageRef.current.slice(0, prev.length + GRID_LIMIT);
        setGridHasMore(clientPageRef.current.length > next.length);
        return next;
      });
      return;
    }

    const nextOffset = gridItems.length;
    setLoadingMore(true);
    fetchSearch({ q: query, type: activeType, jurisdictionId: scope.id, limit: GRID_LIMIT, offset: nextOffset })
      .then((items) => {
        if (!isCurrent()) {
          console.log('[Discover] discarded a stale show-more response');
          return;
        }
        setGridItems((prev) => [...prev, ...items]);
        setGridHasMore(items.length === GRID_LIMIT);
      })
      .catch((err) => {
        console.error('[Discover] show more failed:', err?.message || err);
        if (isCurrent()) setGridHasMore(false);
      })
      .finally(() => setLoadingMore(false));
  }, [activeType, query, scope.id, gridItems.length]);

  // ── navigation + play ──
  const openItem = useCallback(
    (item: Result) => {
      switch (item.type) {
        case 'artist':
          navigation.navigate('Artist', { artistId: item.id });
          break;
        case 'listener':
          navigation.navigate('Profile', { userId: item.id });
          break;
        case 'song':
          navigation.navigate('Song', { songId: item.id });
          break;
        case 'playlist':
          navigation.navigate('Playlists', { playlistId: item.id });
          break;
        case 'video':
          navigation.navigate('Song', { videoId: item.id, type: 'video' });
          break;
        case 'jurisdiction':
          navigation.navigate('Jurisdiction', { jurisdictionId: item.id });
          break;
        default:
          console.warn(`[Discover] no route for type "${item.type}"`);
      }
    },
    [navigation]
  );

  const playSong = useCallback(
    async (item: Result) => {
      try {
        const res = await axiosInstance.get(`/v1/media/song/${item.id}`);
        const s = res.data || {};
        const full = buildUrl(s.fileUrl);
        const art = buildUrl(s.artworkUrl) || buildUrl(item.artworkUrl);
        // requestPlay ONLY — it raises PlayChoiceModal, and Player.tsx owns
        // play tracking behind the 15s/25% gate. Counting here would credit
        // points for plays the user cancelled or merely queued.
        requestPlay({
          type: 'song',
          id: item.id,
          songId: item.id,
          url: full,
          fileUrl: full,
          title: s.title || item.name,
          artist: s.artist || item.subtitle,
          artistId: s.artistId || item.extra?.artistId,
          artwork: art,
          artworkUrl: art,
          source: 'discover',
        } as any);
        console.log(`[Discover] requestPlay dispatched for song ${item.id}`);
      } catch (err: any) {
        console.error(`[Discover] could not load song ${item.id} for playback:`, err?.message || err);
        navigation.navigate('Song', { songId: item.id });
      }
    },
    [requestPlay, navigation]
  );

  const renderCard = (item: Result, idx: number, width: number) => {
    const key = `${item.type}-${item.id}-${idx}`;
    switch (item.type) {
      case 'artist':
      case 'listener':
        return <UserCard key={key} item={item} width={width} onOpen={openItem} />;
      case 'playlist':
        return <PlaylistCard key={key} item={item} width={width} onOpen={openItem} />;
      case 'song':
        return (
          <SongCard key={key} item={item} width={width} accent={accent} onOpen={openItem} onPlay={playSong} />
        );
      case 'video':
        return <VideoCard key={key} item={item} width={width} onOpen={openItem} />;
      default:
        return null;
    }
  };

  const hasAllResults = useMemo(
    () => RAIL_TYPES.some((t) => buckets[t]?.length > 0),
    [buckets]
  );
  const showEmpty =
    !loading && !error && (activeType === 'all' ? !hasAllResults : gridItems.length === 0);

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* hero */}
        <View style={styles.eyebrowRow}>
          <View style={[styles.dot, { backgroundColor: accent }]} />
          <Text style={styles.eyebrow}>
            {query ? `RESULTS · "${query}"` : 'EXPLORING · LIVE NOW'}
          </Text>
        </View>
        <Text style={styles.h1}>
          Discover <Text style={[styles.h1Em, { color: accent }]}>{query || scope.name}</Text>
        </Text>
        <Text style={styles.sub}>
          {query
            ? `What matches "${query}" in ${scope.name}.`
            : 'The people, playlists, songs and videos rising in your neighborhood right now.'}
        </Text>

        {/* type tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabs}
        >
          {TYPES.map((t) => {
            const on = activeType === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                onPress={() => setActiveType(t.key)}
                style={[styles.tab, on && { backgroundColor: accent }]}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.tabText, on && { color: TEXT }]}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* scope + search */}
        <View style={styles.controlsRow}>
          <TouchableOpacity
            style={styles.scopeBtn}
            onPress={() => setScopeOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`Jurisdiction: ${scope.name}`}
          >
            <Text style={[styles.scopePin, { color: accent }]}>◎</Text>
            <Text style={styles.scopeText} numberOfLines={1}>
              {scope.name}
            </Text>
            <Text style={styles.chev}>▾</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.searchWrap}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            style={styles.searchInput}
            value={inputValue}
            onChangeText={setInputValue}
            placeholder="Search people, playlists, songs, videos…"
            placeholderTextColor={TEXT_4}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            accessibilityLabel="Search Discover"
          />
        </View>

        {/* results */}
        {activeType === 'all'
          ? RAIL_TYPES.map((type) =>
              buckets[type]?.length > 0 ? (
                <View style={styles.section} key={type}>
                  <View style={styles.secHead}>
                    <Text style={styles.secTitle}>
                      {RAIL_TITLES[type].toUpperCase()} IN{' '}
                      <Text style={[styles.secTitleEm, { color: accent }]}>{scope.name}</Text>
                    </Text>
                    <TouchableOpacity onPress={() => setActiveType(type)}>
                      <Text style={styles.seeAll}>See all ›</Text>
                    </TouchableOpacity>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.rail}
                  >
                    {buckets[type].map((item, i) => renderCard(item, i, railW[type]))}
                  </ScrollView>
                </View>
              ) : null
            )
          : gridItems.length > 0 && (
              <View style={styles.section}>
                <View style={styles.secHead}>
                  <Text style={styles.secTitle}>
                    {RAIL_TITLES[activeType].toUpperCase()} IN{' '}
                    <Text style={[styles.secTitleEm, { color: accent }]}>{scope.name}</Text>
                  </Text>
                </View>
                <View style={styles.grid}>
                  {gridItems.map((item, i) => renderCard(item, i, gridW))}
                </View>
                {gridHasMore && (
                  <TouchableOpacity
                    style={styles.showMoreBtn}
                    onPress={showMore}
                    disabled={loadingMore}
                    accessibilityRole="button"
                  >
                    <Text style={styles.showMoreText}>
                      {loadingMore ? 'Loading…' : 'Show more'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

        {loading && (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={accent} />
          </View>
        )}

        {error && !loading && (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Something went wrong</Text>
            <Text style={styles.emptyBody}>{error} Please try again in a moment.</Text>
          </View>
        )}

        {showEmpty && (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              {query ? `Nothing here yet for "${query}"` : `Nothing in ${scope.name} yet`}
            </Text>
            <Text style={styles.emptyBody}>
              {query
                ? `Try another name, or clear the search to browse everyone in ${scope.name}.`
                : 'Try another neighborhood from the picker above.'}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* scope picker */}
      <Modal
        visible={scopeOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setScopeOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setScopeOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Jurisdiction</Text>
            {SCOPE_OPTIONS.map((o) => {
              const on = scope.id === o.id;
              return (
                <TouchableOpacity
                  key={o.id}
                  style={[styles.scopeItem, on && { backgroundColor: hexToRgba(accent, 0.18) }]}
                  onPress={() => {
                    console.log(`[Discover] scope changed → ${o.name}`);
                    setScope(o);
                    setScopeOpen(false);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.scopeItemName, on && { color: TEXT }]}>{o.name}</Text>
                  <Text style={styles.scopeItemLvl}>{o.level.toUpperCase()}</Text>
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  scroll: { padding: 16, paddingBottom: 140 },

  eyebrowRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 8 },
  eyebrow: { fontSize: 11, letterSpacing: 1.6, color: TEXT_3, fontWeight: '600' },

  h1: { fontSize: 32, lineHeight: 36, fontWeight: '800', color: TEXT, marginBottom: 6 },
  h1Em: { fontStyle: 'italic', fontWeight: '400' },
  sub: { color: TEXT_3, fontSize: 14, marginBottom: 18 },

  tabs: { flexDirection: 'row', gap: 6, paddingVertical: 4, marginBottom: 12 },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
  },
  tabText: { fontSize: 13.5, fontWeight: '600', color: TEXT_3 },

  controlsRow: { flexDirection: 'row', marginBottom: 10 },
  scopeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: SURFACE_2,
    borderWidth: 1,
    borderColor: BORDER_HI,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  scopePin: { fontSize: 14 },
  scopeText: { color: TEXT, fontSize: 13, fontWeight: '600' },
  chev: { color: TEXT_3, fontSize: 11 },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: SURFACE_2,
    borderWidth: 1,
    borderColor: BORDER_HI,
    borderRadius: 999,
    paddingHorizontal: 14,
    height: 44,
    marginBottom: 20,
  },
  searchIcon: { color: TEXT_3, fontSize: 16 },
  searchInput: { flex: 1, color: TEXT, fontSize: 13.5, padding: 0 },

  section: { marginTop: 22 },
  secHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  secTitle: { fontSize: 11, letterSpacing: 1.4, color: TEXT_2, fontWeight: '700', flex: 1 },
  secTitleEm: { fontSize: 14, fontStyle: 'italic', fontWeight: '400', letterSpacing: 0 },
  seeAll: { fontSize: 12.5, fontWeight: '600', color: TEXT_3 },

  rail: { gap: 16, paddingRight: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },

  userCard: { alignItems: 'center' },
  avatarRing: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    padding: 3,
    marginBottom: 10,
  },
  avatarImg: { width: '100%', height: '100%', borderRadius: AVATAR / 2 },
  avatarFallback: { backgroundColor: SURFACE_2, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: TEXT, fontSize: 26, fontWeight: '800' },
  userRole: { fontSize: 9, letterSpacing: 1.2, fontWeight: '700', color: TEXT_4, marginBottom: 2 },
  userName: { fontSize: 14, fontWeight: '700', color: TEXT },
  userPoints: { fontSize: 12, fontWeight: '600', color: TEXT_2, marginTop: 4 },

  plCard: { borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: BORDER },
  plScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  plMeta: { position: 'absolute', left: 12, right: 12, bottom: 10 },
  plTitle: { fontSize: 15, fontWeight: '700', color: TEXT },
  plCount: { fontSize: 11.5, color: TEXT_2, marginTop: 2 },

  songArt: { borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: BORDER },
  durPill: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  durText: { color: TEXT, fontSize: 11, fontWeight: '600' },
  playFab: {
    position: 'absolute',
    right: 8,
    // sits just inside the bottom edge of the square artwork
    top: undefined,
    bottom: 62,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playGlyph: { color: TEXT, fontSize: 13, marginLeft: 2 },
  songTitle: { fontSize: 13.5, fontWeight: '700', color: TEXT, marginTop: 9 },
  songRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  songArtist: { fontSize: 12, color: TEXT_3, flex: 1 },
  playsPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  playsText: { fontSize: 11, fontWeight: '600' },

  vidFrame: { borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: BORDER },
  vidPlayWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  vidPlayCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(13,16,24,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  showMoreBtn: {
    alignSelf: 'center',
    marginTop: 22,
    paddingHorizontal: 26,
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: SURFACE_2,
    borderWidth: 1,
    borderColor: BORDER_HI,
  },
  showMoreText: { color: TEXT, fontSize: 13.5, fontWeight: '600' },

  loading: { paddingVertical: 50, alignItems: 'center' },
  empty: { paddingVertical: 60, paddingHorizontal: 20, alignItems: 'center' },
  emptyTitle: { color: TEXT, fontSize: 18, fontWeight: '700', marginBottom: 6, textAlign: 'center' },
  emptyBody: { color: TEXT_3, fontSize: 13.5, textAlign: 'center' },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: SURFACE,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: 34,
    borderTopWidth: 1,
    borderColor: BORDER_HI,
  },
  modalTitle: {
    color: TEXT_3,
    fontSize: 11,
    letterSpacing: 1.6,
    fontWeight: '700',
    marginBottom: 12,
  },
  scopeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  scopeItemName: { color: TEXT_2, fontSize: 15, fontWeight: '600' },
  scopeItemLvl: { color: TEXT_4, fontSize: 10, letterSpacing: 1 },
});

export default DiscoverScreen;