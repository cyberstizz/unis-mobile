// src/screens/FindScreen.tsx
// Territory discovery — drill down through jurisdictions to find local artists.
//
// The map is src/map/UnisMap.tsx. @maplibre/maplibre-react-native and the
// CartoDB raster tiles are gone: no tile provider, no API key, no attribution,
// and nothing fetched from a third party at render time. State outlines ship
// pre-projected in the bundle; jurisdiction polygons come from our own API and
// are projected into the same space on arrival.
//
// Three things that were wrong in the MapLibre version and are fixed here:
//
//   1. handlePlay called playMedia() directly, which bypasses PlayChoiceModal.
//      Every other play surface in the app goes through requestPlay(). It does
//      now too.
//   2. US state outlines were fetched from raw.githubusercontent.com on mount.
//      A core screen had a hard runtime dependency on a third party.
//   3. Only New York was enterable; every other state produced an Alert. All
//      states now open one level so a visitor can see their own region mapped.

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ImageBackground,
  ActivityIndicator,
  Dimensions,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';

import { usePlayer } from '../context/PlayerContext';
import axiosInstance, { getMediaUrl } from '../services/axiosInstance';
import UnisMap, { MapTerritory } from '../map/UnisMap';

// Local fallback art. The original screen pointed at picsum.photos, which is a
// third-party network request per missing image — on cellular, for a
// placeholder. A bundled asset costs nothing and works offline.
const FALLBACK_ART = require('../../assets/randomrapper.jpeg');

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IS_MOBILE = SCREEN_WIDTH < 768;

const COLORS = {
  bgBlack: '#000000',
  subtleBlack: '#1a1a1a',
  textSilver: '#C0C0C0',
  textGray: '#A9A9A9',
  accentWhite: '#FFFFFF',
  unisBlue: '#163387',
  unisBlueBright: '#2E5AAC',
  borderSilver: 'rgba(192, 192, 192, 0.2)',
};

const ACTIVE_STATES = ['New York'];
const ACTIVE_JURISDICTIONS = ['Harlem', 'Uptown Harlem', 'Downtown Harlem'];
const HARLEM_PARENT_CHAIN = [
  'Unis', 'New York', 'New York City Metro', 'New York City',
  'Manhattan', 'Upper Manhattan', 'Harlem', 'Uptown Harlem', 'Downtown Harlem',
];

// The web build reads these from idMappings.js, which exports CANONICAL_GENRES
// precisely so no screen hardcodes a list. src/utils/IdMappings.ts here has no
// such export yet — worth lifting across, at which point this should import it
// rather than restate it. Note 'rap', not the legacy 'rap-hiphop' alias.
const GENRES = [
  { value: 'rap', label: 'Rap' },
  { value: 'rock', label: 'Rock' },
  { value: 'pop', label: 'Pop' },
];

// KNOWN GAP — the genre control is inert, exactly as on web.
// /v1/jurisdictions/{id}/tops takes no genre parameter. Genre filtering lives
// on /v1/vote/leaderboards, which does accept genreId. Until /tops grows the
// same parameter, changing this pill updates local state and nothing else.

const ROOT_CRUMB = { name: 'United States', jurisdictionId: null as string | null, tier: 0 };

interface NavItem {
  name: string;
  jurisdictionId: string | null;
  tier: number;
}

interface TopResult {
  id: string;
  name?: string;
  title?: string;
  artist?: string;
  artistId?: string;
  votes: number;
  artwork: string;
  fileUrl?: string;
}

const decodeJwt = (token: string): any | null => {
  try {
    const part = token.split('.')[1];
    const json = decodeURIComponent(
      atob(part.replace(/-/g, '+').replace(/_/g, '/'))
        .split('')
        .map((c) => `%${`00${c.charCodeAt(0).toString(16)}`.slice(-2)}`)
        .join('')
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
};

const isInHarlemChain = (n: string) => HARLEM_PARENT_CHAIN.includes(n);
const isActiveJurisdiction = (n: string) => ACTIVE_JURISDICTIONS.includes(n);

const FindScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { requestPlay } = usePlayer();

  const [userId, setUserId] = useState<string | null>(null);
  const [genre, setGenre] = useState(GENRES[0].value);
  const [showGenreDropdown, setShowGenreDropdown] = useState(false);

  const [navigationStack, setNavigationStack] = useState<NavItem[]>([ROOT_CRUMB]);
  const [currentJurisdictions, setCurrentJurisdictions] = useState<MapTerritory[]>([]);
  const [selectedJurisdiction, setSelectedJurisdiction] = useState<any>(null);
  const [focusState, setFocusState] = useState<string | null>(null);

  const [topArtists, setTopArtists] = useState<TopResult[]>([]);
  const [topSongs, setTopSongs] = useState<TopResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSelected, setHasSelected] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    (async () => {
      try {
        const token = await SecureStore.getItemAsync('token');
        if (token) setUserId(decodeJwt(token)?.userId ?? null);
      } catch (err) {
        console.warn('[FindScreen] token read failed:', err);
      }
    })();
  }, []);

  /* --------------------------------------------------------------- api -- */

  const fetchChildren = useCallback(async (id: string): Promise<MapTerritory[]> => {
    try {
      const res = await axiosInstance.get(`/v1/jurisdictions/${id}/children/detailed`);
      return res.data || [];
    } catch {
      try {
        const fb = await axiosInstance.get(`/v1/jurisdictions/${id}/children`);
        return (fb.data || []).map((j: any) => ({ ...j, hasChildren: true }));
      } catch (err) {
        console.warn('[FindScreen] children fetch failed:', err);
        return [];
      }
    }
  }, []);

  const fetchTopsById = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    setHasSelected(true);
    fadeAnim.setValue(0);
    try {
      const res = await axiosInstance.get(`/v1/jurisdictions/${id}/tops`);
      const raw = res.data || {};

      setTopArtists(
        (raw.topArtists || []).slice(0, 3).map((a: any, i: number) => ({
          id: a.userId || String(i),
          name: a.username,
          votes: a.score || 0,
          artwork: getMediaUrl(a.photoUrl) || '',   // '' => <Image> falls back below
        }))
      );
      setTopSongs(
        (raw.topSongs || []).slice(0, 3).map((s: any, i: number) => ({
          id: s.songId || String(i),
          title: s.title,
          artist: s.artist?.username || 'Unknown',
          artistId: s.artist?.userId,
          votes: s.score || 0,
          fileUrl: getMediaUrl(s.fileUrl),
          artwork: getMediaUrl(s.artworkUrl) || '',
        }))
      );
    } catch (err) {
      console.warn('[FindScreen] tops fetch failed:', err);
      setError('Top results are unavailable right now.');
      setTopArtists([]);
      setTopSongs([]);
    } finally {
      setLoading(false);
      Animated.timing(fadeAnim, { toValue: 1, duration: 420, useNativeDriver: true }).start();
    }
  }, [fadeAnim]);

  const fetchTopsByName = useCallback(async (name: string) => {
    const resolved = !isActiveJurisdiction(name) && isInHarlemChain(name) ? 'Harlem' : name;
    try {
      const res = await axiosInstance.get(
        `/v1/jurisdictions/byName/${encodeURIComponent(resolved)}`
      );
      const id = res.data?.[0]?.jurisdictionId;
      if (!id) throw new Error('not found');
      await fetchTopsById(id);
    } catch (err) {
      console.warn('[FindScreen] byName failed:', err);
      setError('Top results are unavailable right now.');
      setLoading(false);
    }
  }, [fetchTopsById]);

  /* ------------------------------------------------------ interactions -- */

  const handleStateSelect = useCallback(
    async (stateName: string) => {
      if (focusState === stateName) return;
      const isLive = ACTIVE_STATES.includes(stateName);

      setLoading(true);
      setHasSelected(true);
      setError(null);

      try {
        const res = await axiosInstance.get(
          `/v1/jurisdictions/byName/${encodeURIComponent(stateName)}`
        );
        const jur = res.data?.[0];
        if (!jur) {
          setLoading(false);
          setHasSelected(false);
          setError(`Unis isn't in ${stateName} yet.`);
          return;
        }

        // Charts only for live states — a dormant state has nothing to rank,
        // so asking for its tops is a guaranteed empty round trip.
        const [children] = await Promise.all([
          fetchChildren(jur.jurisdictionId),
          isLive ? fetchTopsById(jur.jurisdictionId) : Promise.resolve(),
        ]);

        setFocusState(stateName);
        setNavigationStack([
          ROOT_CRUMB,
          { name: stateName, jurisdictionId: jur.jurisdictionId, tier: 2 },
        ]);
        setCurrentJurisdictions(children);
        setSelectedJurisdiction(jur);

        if (!isLive) {
          setTopArtists([]);
          setTopSongs([]);
          setLoading(false);
        }
      } catch (err) {
        console.warn('[FindScreen] state select failed:', err);
        setError(`${stateName} could not be loaded.`);
        setLoading(false);
      }
    },
    [focusState, fetchChildren, fetchTopsById]
  );

  const handleTerritorySelect = useCallback(
    async (jur: MapTerritory) => {
      setSelectedJurisdiction(jur);

      // Inside a dormant state there is only one level of geometry, so a tap
      // highlights the region and stops rather than flying into an empty frame.
      if (!ACTIVE_STATES.includes(focusState || '')) return;

      const resolved =
        !isActiveJurisdiction(jur.name) && isInHarlemChain(jur.name) ? 'Harlem' : jur.name;

      const childrenPromise = jur.hasChildren
        ? fetchChildren(jur.jurisdictionId)
        : Promise.resolve([] as MapTerritory[]);
      const topsPromise =
        resolved === jur.name ? fetchTopsById(jur.jurisdictionId) : fetchTopsByName(jur.name);

      const [children] = await Promise.all([childrenPromise, topsPromise]);

      if (jur.hasChildren && children.length > 0) {
        setNavigationStack((prev) => [
          ...prev,
          {
            name: jur.name,
            jurisdictionId: jur.jurisdictionId,
            tier: prev[prev.length - 1].tier + 1,
          },
        ]);
        setCurrentJurisdictions(children);
      }
    },
    [focusState, fetchChildren, fetchTopsById, fetchTopsByName]
  );

  const resetToNational = useCallback(() => {
    setNavigationStack([ROOT_CRUMB]);
    setCurrentJurisdictions([]);
    setSelectedJurisdiction(null);
    setFocusState(null);
    setHasSelected(false);
    setTopArtists([]);
    setTopSongs([]);
    setError(null);
  }, []);

  const handleBack = useCallback(async () => {
    if (navigationStack.length <= 1) return;
    const stack = navigationStack.slice(0, -1);
    const prev = stack[stack.length - 1];

    if (prev.tier === 0) {
      resetToNational();
      return;
    }

    setNavigationStack(stack);
    const [children] = await Promise.all([
      fetchChildren(prev.jurisdictionId as string),
      fetchTopsByName(prev.name),
    ]);
    setCurrentJurisdictions(children);

    try {
      const res = await axiosInstance.get(`/v1/jurisdictions/${prev.jurisdictionId}`);
      setSelectedJurisdiction(res.data);
    } catch (err) {
      console.warn('[FindScreen] parent fetch failed:', err);
    }
  }, [navigationStack, fetchChildren, fetchTopsByName, resetToNational]);

  /* ------------------------------------------------------------ play --- */

  // requestPlay, not playMedia. requestPlay routes through PlayChoiceModal
  // when a queue already exists, which is the standard every other play
  // surface in the app follows.
  const handlePlay = useCallback(
    async (item: TopResult) => {
      let trackingId: string | null = null;

      if (item.fileUrl) {
        requestPlay({
          id: item.id,
          songId: item.id,
          title: item.title || item.name || 'Unknown',
          artist: item.artist || item.name,
          url: item.fileUrl,
          fileUrl: item.fileUrl,
          artwork: item.artwork,
          artworkUrl: item.artwork,
        });
        trackingId = item.id;
      } else if (item.id && item.name) {
        try {
          const res = await axiosInstance.get(`/v1/users/${item.id}/default-song`);
          const song = res.data;
          if (!song?.fileUrl) {
            setError(`${item.name} has no default song yet.`);
            return;
          }
          const url = getMediaUrl(song.fileUrl) as string;
          const art = getMediaUrl(song.artworkUrl) || item.artwork;
          requestPlay({
            id: song.songId || item.id,
            songId: song.songId || item.id,
            title: song.title,
            artist: item.name,
            url,
            fileUrl: url,
            artwork: art,
            artworkUrl: art,
          });
          trackingId = song.songId;
        } catch (err) {
          console.warn('[FindScreen] default song failed:', err);
          setError('Could not load that artist\u2019s song.');
          return;
        }
      }

      if (trackingId && userId) {
        try {
          await axiosInstance.post(`/v1/media/song/${trackingId}/play?userId=${userId}`);
        } catch (err) {
          console.warn('[FindScreen] play tracking failed:', err);
        }
      }
    },
    [requestPlay, userId]
  );

  const handleView = (item: TopResult, type: 'artist' | 'song') => {
    if (type === 'artist') {
      navigation.navigate('Home', { screen: 'Artist', params: { artistId: item.id } });
    } else {
      navigation.navigate('Home', { screen: 'Song', params: { songId: item.id, type: 'song' } });
    }
  };

  /* --------------------------------------------------------- derived --- */

  const mapMode = useMemo<'US' | 'STATE' | 'TERRITORY'>(() => {
    if (navigationStack.length <= 1) return 'US';
    if (navigationStack.length === 2) return 'STATE';
    return 'TERRITORY';
  }, [navigationStack]);

  const atNational = mapMode === 'US';
  const displayTerritory =
    selectedJurisdiction?.name ||
    navigationStack[navigationStack.length - 1]?.name ||
    'Select a state';

  const showComingSoon =
    !!selectedJurisdiction && !isInHarlemChain(selectedJurisdiction.name);

  const renderCard = (item: TopResult, index: number, type: 'artist' | 'song') => (
    <Animated.View key={item.id} style={[styles.card, { opacity: fadeAnim }]}>
      <Image
        source={item.artwork ? { uri: item.artwork } : FALLBACK_ART}
        style={styles.ambient}
        blurRadius={40}
      />
      <LinearGradient
        colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0.12)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.cardInner}
      >
        <Text style={styles.rank}>{index + 1}</Text>
        <Image
          source={item.artwork ? { uri: item.artwork } : FALLBACK_ART}
          defaultSource={FALLBACK_ART}
          style={styles.art}
        />
        <View style={styles.meta}>
          <Text style={styles.title} numberOfLines={1}>
            {type === 'song' ? item.title : item.name}
          </Text>
          {type === 'song' && (
            <Text style={styles.sub} numberOfLines={1}>
              {item.artist}
            </Text>
          )}
        </View>
        <TouchableOpacity style={styles.playBtn} onPress={() => handlePlay(item)}>
          <Text style={styles.playTxt}>Play</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.viewBtn} onPress={() => handleView(item, type)}>
          <Text style={styles.viewTxt}>View</Text>
        </TouchableOpacity>
      </LinearGradient>
    </Animated.View>
  );

  return (
    <View style={styles.container}>
      <ImageBackground
        source={require('../../assets/randomrapper.jpeg')}
        style={StyleSheet.absoluteFill as never}
        resizeMode="cover"
      >
        <LinearGradient
          colors={['rgba(0,0,0,0.7)', 'rgba(0,0,0,0.92)']}
          style={StyleSheet.absoluteFill as never}
        />
      </ImageBackground>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── filters ── */}
        <View style={[styles.filters, { zIndex: 100 }]}>
          <View style={styles.filterWrap}>
            <TouchableOpacity
              style={[styles.filterBtn, showGenreDropdown && styles.filterBtnActive]}
              onPress={() => setShowGenreDropdown(!showGenreDropdown)}
            >
              <Text style={styles.filterTxt}>
                {GENRES.find((g) => g.value === genre)?.label || 'Rap'}
              </Text>
            </TouchableOpacity>
            {showGenreDropdown && (
              <View style={styles.dropdown}>
                {GENRES.map((g) => (
                  <TouchableOpacity
                    key={g.value}
                    style={[styles.option, genre === g.value && styles.optionActive]}
                    onPress={() => {
                      setGenre(g.value);
                      setShowGenreDropdown(false);
                    }}
                  >
                    <Text
                      style={[styles.optionTxt, genre === g.value && styles.optionTxtActive]}
                    >
                      {g.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* ── map ── */}
        <View style={styles.mapSection}>
          <Text style={styles.territory} numberOfLines={1}>
            {displayTerritory}
          </Text>

          {!atNational && (
            <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
              <ChevronLeft size={15} color={COLORS.unisBlue} />
              <Text style={styles.backTxt}>Back</Text>
            </TouchableOpacity>
          )}

          <View style={styles.mapBox}>
            <UnisMap
              mode={mapMode}
              focusState={focusState}
              territories={currentJurisdictions}
              selectedId={selectedJurisdiction?.jurisdictionId || null}
              liveStates={ACTIVE_STATES}
              liveTerritories={ACTIVE_JURISDICTIONS}
              primary={COLORS.unisBlue}
              primaryBright={COLORS.unisBlueBright}
              onStateSelect={handleStateSelect}
              onTerritorySelect={handleTerritorySelect}
            />
          </View>

          <View style={styles.key}>
            <View style={styles.keyItem}>
              <View style={[styles.keyDot, { backgroundColor: COLORS.unisBlue }]} />
              <Text style={styles.keyTxt}>Live on Unis</Text>
            </View>
            <View style={styles.keyItem}>
              <View style={[styles.keyDot, styles.keyDotDark]} />
              <Text style={styles.keyTxt}>Not open yet</Text>
            </View>
          </View>

          {/* The rail is the reliable way in on a phone. Small states are hard
              to hit accurately with a thumb, and a tap that lands on the wrong
              one is worse than a list. */}
          {currentJurisdictions.length > 0 && (
            <View style={styles.rail}>
              <Text style={styles.railTitle}>
                Regions in {navigationStack[navigationStack.length - 1]?.name}
              </Text>
              <View style={styles.pills}>
                {currentJurisdictions.map((j) => {
                  const sel = selectedJurisdiction?.jurisdictionId === j.jurisdictionId;
                  return (
                    <TouchableOpacity
                      key={j.jurisdictionId}
                      style={[styles.pill, sel && styles.pillSel]}
                      onPress={() => handleTerritorySelect(j)}
                    >
                      <Text style={[styles.pillTxt, sel && styles.pillTxtSel]}>{j.name}</Text>
                      {isActiveJurisdiction(j.name) && <Text style={styles.liveDot}>●</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}
        </View>

        {!!error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorTxt}>{error}</Text>
          </View>
        )}

        {/* ── results ── */}
        {hasSelected && (
          <View style={styles.results}>
            {showComingSoon ? (
              <View style={styles.soon}>
                <Text style={styles.soonTitle}>{selectedJurisdiction?.name}</Text>
                <Text style={styles.soonTxt}>
                  No charts here yet. Join the waitlist and we'll tell you the day it opens.
                </Text>
              </View>
            ) : loading ? (
              <View style={styles.loading}>
                <ActivityIndicator size="large" color={COLORS.unisBlue} />
              </View>
            ) : (
              <>
                <View style={styles.column}>
                  <Text style={styles.colTitle}>Top songs in {displayTerritory}</Text>
                  {topSongs.length > 0 ? (
                    topSongs.map((s, i) => renderCard(s, i, 'song'))
                  ) : (
                    <Text style={styles.empty}>No songs charted here yet.</Text>
                  )}
                </View>

                <View style={styles.column}>
                  <Text style={styles.colTitle}>Top artists in {displayTerritory}</Text>
                  {topArtists.length > 0 ? (
                    topArtists.map((a, i) => renderCard(a, i, 'artist'))
                  ) : (
                    <Text style={styles.empty}>No artists charted here yet.</Text>
                  )}
                </View>
              </>
            )}
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgBlack },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: 20, paddingHorizontal: 12 },

  filters: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 18 },
  filterWrap: { position: 'relative' },
  filterBtn: {
    paddingVertical: 9,
    paddingHorizontal: 20,
    backgroundColor: COLORS.bgBlack,
    borderWidth: 1,
    borderColor: COLORS.borderSilver,
    borderRadius: 999,
    minWidth: 100,
  },
  filterBtnActive: { borderColor: COLORS.unisBlue },
  filterTxt: { color: COLORS.textSilver, fontSize: 13, textAlign: 'center' },
  dropdown: {
    position: 'absolute',
    top: 42,
    left: 0,
    right: 0,
    backgroundColor: COLORS.subtleBlack,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.borderSilver,
    overflow: 'hidden',
    zIndex: 1000,
    elevation: 10,
  },
  option: { paddingVertical: 10, paddingHorizontal: 15 },
  optionActive: { backgroundColor: 'rgba(22,51,135,0.25)' },
  optionTxt: { color: COLORS.textSilver, fontSize: 13 },
  optionTxtActive: { color: COLORS.accentWhite },

  mapSection: { width: '100%', alignItems: 'center' },
  territory: {
    color: COLORS.accentWhite,
    fontSize: IS_MOBILE ? 22 : 30,
    fontFamily: 'BitcountGridDouble',
    textAlign: 'center',
    marginBottom: 8,
    maxWidth: '100%',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: COLORS.unisBlue,
    borderRadius: 999,
    marginBottom: 10,
  },
  backTxt: { color: COLORS.unisBlue, fontSize: 12, marginLeft: 4 },
  mapBox: { width: '100%', aspectRatio: 4 / 3 },

  key: { flexDirection: 'row', gap: 14, marginTop: 10 },
  keyItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  keyDot: { width: 8, height: 8, borderRadius: 4 },
  keyDotDark: {
    backgroundColor: '#151822',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  keyTxt: { color: '#8b8f9e', fontSize: 10 },

  rail: { width: '100%', marginTop: 16 },
  railTitle: { color: '#7d818f', fontSize: 11, marginBottom: 8, letterSpacing: 1 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    backgroundColor: 'rgba(22,51,135,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(22,51,135,0.45)',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pillSel: { backgroundColor: COLORS.unisBlue, borderColor: COLORS.unisBlue },
  pillTxt: { color: COLORS.textSilver, fontSize: 13 },
  pillTxtSel: { color: COLORS.accentWhite },
  liveDot: { color: '#4CAF50', fontSize: 9 },

  errorBox: {
    marginTop: 14,
    padding: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(255,107,107,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,107,107,0.28)',
  },
  errorTxt: { color: '#ff9b9b', fontSize: 12 },

  results: { width: '100%', marginTop: 22, gap: 22 },
  column: { width: '100%' },
  colTitle: {
    color: COLORS.textGray,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 12,
  },
  loading: { alignItems: 'center', paddingVertical: 40 },
  empty: { color: '#7d818f', fontSize: 12, paddingVertical: 16, textAlign: 'center' },

  soon: {
    width: '100%',
    alignItems: 'center',
    padding: 24,
    backgroundColor: 'rgba(22,51,135,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(22,51,135,0.28)',
    borderRadius: 14,
  },
  soonTitle: { color: COLORS.unisBlueBright, fontSize: 22, marginBottom: 8, fontWeight: '600' },
  soonTxt: { color: '#8b8f9e', textAlign: 'center', fontSize: 13 },

  card: {
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(20,20,20,0.6)',
    marginBottom: 12,
  },
  ambient: {
    position: 'absolute',
    top: -50,
    left: -50,
    width: SCREEN_WIDTH * 2,
    height: 300,
    opacity: 0.3,
  },
  cardInner: { flexDirection: 'row', alignItems: 'center', padding: 10, gap: 10 },
  rank: { fontSize: 13, color: 'rgba(255,255,255,0.32)', minWidth: 18, textAlign: 'center' },
  art: { width: 45, height: 45, borderRadius: 8 },
  meta: { flex: 1, minWidth: 0 },
  title: { color: COLORS.accentWhite, fontSize: 14, fontWeight: '500' },
  sub: { color: COLORS.textSilver, fontSize: 12 },
  playBtn: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    backgroundColor: COLORS.unisBlue,
    borderRadius: 999,
  },
  playTxt: { color: COLORS.accentWhite, fontSize: 11, fontWeight: '600' },
  viewBtn: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    backgroundColor: COLORS.bgBlack,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 999,
  },
  viewTxt: { color: COLORS.textSilver, fontSize: 11, fontWeight: '600' },
});

export default FindScreen;