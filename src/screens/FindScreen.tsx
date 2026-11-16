// src/screens/FindScreen.tsx
// ─────────────────────────────────────────────────────────────
// Territory discovery — mobile port of web src/findpage.jsx.
//
// The map is src/components/UnisMap.tsx (no tile provider, no API key; state
// outlines ship pre-projected, jurisdiction polygons come from our API).
//
// Which places are open comes from the backend, never from this file:
// GET /v1/jurisdictions/open → [{ jurisdictionId, name, chain: [...] }].
// Opening a neighborhood is a one-line UPDATE in Supabase.
//
//   • Every state is enterable; a dormant one opens one level and stops.
//   • Tapping a live state (or a place above exactly one open place) walks
//     the map down to it a level at a time, so you see where it is.
//   • Top 3 songs and artists come from /v1/awards/standings: this week, in
//     the selected genre, ranked by the award formula, with rank movement.
//   • Plays go through playEntry → requestPlay; the Player counts them.
// ─────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Svg, { Circle, Rect } from 'react-native-svg';
import { usePlayer } from '../context/PlayerContext';
import { useFeedback } from '../context/FeedbackContext';
import axiosInstance from '../services/axiosInstance';
import { CANONICAL_GENRES } from '../utils/IdMappings';
import { fetchStandings, describeBoard, playEntry } from '../utils/standings';
import { useUnisTheme, UnisTheme } from '../theme/unisTheme';
import { webUrl } from '../config/links';
import UnisMap, { MapTerritory } from '../components/UnisMap';
import AdSlot from '../components/AdSlot';
import RankMove from '../components/RankMove';
import { Linking } from 'react-native';

type OpenEntry = { jurisdictionId: string; name: string; chain?: { jurisdictionId: string; name: string }[] };
type OpenIndex = {
  list: OpenEntry[];
  openIds: Set<string>;
  openNames: string[];
  pathIds: Set<string>;
  pathNames: Set<string>;
  liveStates: string[];
};

function buildOpenIndex(list: OpenEntry[]): OpenIndex {
  const openIds = new Set<string>();
  const openNames: string[] = [];
  const pathIds = new Set<string>();
  const pathNames = new Set<string>();
  for (const o of list) {
    openIds.add(o.jurisdictionId);
    openNames.push(o.name);
    for (const link of o.chain || []) {
      pathIds.add(link.jurisdictionId);
      pathNames.add(link.name);
    }
  }
  return { list, openIds, openNames, pathIds, pathNames, liveStates: [...pathNames] };
}
const EMPTY_OPEN = buildOpenIndex([]);

/** The one open place at or below `id`, and the steps to reach it; null if none or the way splits. */
function openTargetBelow(index: OpenIndex, id?: string | null) {
  if (!id || !index.pathIds.has(id)) return null;
  const found = new Map<string, { target: any; steps: any[] }>();
  for (const o of index.list) {
    const chain = o.chain || [];
    const at = chain.findIndex((link) => link.jurisdictionId === id);
    if (at === -1) continue;
    const rest = chain.slice(at);
    const hit = rest.findIndex((link) => index.openIds.has(link.jurisdictionId));
    if (hit === -1) continue;
    const target = rest[hit];
    if (!found.has(target.jurisdictionId)) found.set(target.jurisdictionId, { target, steps: rest.slice(1, hit + 1) });
  }
  return found.size === 1 ? [...found.values()][0] : null;
}

const DRILL_STEP_MS = 400;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const ROOT_CRUMB = { name: 'United States', jurisdictionId: null as string | null, tier: 0 };
const titleCase = (k: string) => k.charAt(0).toUpperCase() + k.slice(1);
const GENRES = (CANONICAL_GENRES as readonly string[]).map((key) => ({ value: key, label: titleCase(key) }));

type Top = { id: string; rank: number; title?: string; name?: string; artist?: string; artistId?: string | null; movement?: number | null; isNew?: boolean; fileUrl?: string | null; artwork?: string | null };

const Art: React.FC<{ uri?: string | null; label: string; t: UnisTheme }> = ({ uri, label, t }) => {
  const [broken, setBroken] = useState(false);
  if (!uri || broken) {
    return <View style={[styles.art, { backgroundColor: t.soft, alignItems: 'center', justifyContent: 'center' }]}><Text style={{ color: t.textAccent, fontWeight: '900', fontSize: 18 }}>{(label || '?').trim().charAt(0).toUpperCase()}</Text></View>;
  }
  return <Image source={{ uri }} style={styles.art} onError={() => setBroken(true)} />;
};

const FindScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const feedback = useFeedback();
  const t = useUnisTheme();
  const { requestPlay } = usePlayer();

  const [navigationStack, setNavigationStack] = useState([ROOT_CRUMB]);
  const [currentJurisdictions, setCurrentJurisdictions] = useState<MapTerritory[]>([]);
  const [selectedJurisdiction, setSelectedJurisdiction] = useState<any>(null);
  const [focusState, setFocusState] = useState<string | null>(null);
  const [rawTops, setRawTops] = useState<{ artists: Top[]; songs: Top[]; status: any }>({ artists: [], songs: [], status: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSelectedJurisdiction, setHasSelectedJurisdiction] = useState(false);
  const [genre, setGenre] = useState<string>(GENRES[0].value);
  const genreRef = useRef(genre);
  const lastTopsIdRef = useRef<string | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const spinTimer = useRef<any>(null);
  const unmountedRef = useRef(false);
  const [openIndex, setOpenIndex] = useState<OpenIndex>(EMPTY_OPEN);
  const openPromiseRef = useRef<Promise<OpenIndex | null> | null>(null);
  const drillingRef = useRef(false);
  const [drilling, setDrilling] = useState(false);

  const isOpen = (j: any) => Boolean(j && openIndex.openIds.has(j.jurisdictionId));

  const showComingSoonToast = useCallback((name: string) => {
    feedback.info(`Unis isn't in ${name} yet`, {
      id: 'findpage-coming-soon',
      action: { label: 'Join the waitlist', onClick: () => Linking.openURL(webUrl('/waitlist')) },
    } as any);
  }, [feedback]);

  useEffect(() => () => {
    unmountedRef.current = true;
    if (spinTimer.current) clearInterval(spinTimer.current);
  }, []);

  const loadOpenIndex = useCallback(() => {
    if (!openPromiseRef.current) {
      openPromiseRef.current = axiosInstance.get('/v1/jurisdictions/open')
        .then((res) => {
          const index = buildOpenIndex(Array.isArray(res?.data) ? res.data : []);
          if (!unmountedRef.current) setOpenIndex(index);
          return index;
        })
        .catch((err) => {
          console.error('[find] open jurisdictions fetch failed:', err?.message || err);
          openPromiseRef.current = null;
          return null;
        });
    }
    return openPromiseRef.current;
  }, []);

  useEffect(() => { loadOpenIndex(); }, [loadOpenIndex]);

  const fetchChildren = useCallback(async (jurisdictionId: string): Promise<MapTerritory[]> => {
    try {
      const res = await axiosInstance.get(`/v1/jurisdictions/${jurisdictionId}/children/detailed`);
      return res.data || [];
    } catch (err: any) {
      console.warn(`[find] children/detailed failed for ${jurisdictionId}:`, err?.message || err);
      try {
        const fb = await axiosInstance.get(`/v1/jurisdictions/${jurisdictionId}/children`);
        return (fb.data || []).map((j: any) => ({ ...j, hasChildren: true }));
      } catch (e: any) {
        console.error('[find] children fetch failed:', e?.message || e);
        return [];
      }
    }
  }, []);

  const fetchTopResultsById = useCallback(async (jurisdictionId: string) => {
    setLoading(true);
    setError(null);
    setHasSelectedJurisdiction(true);
    lastTopsIdRef.current = jurisdictionId;
    const wanted = genreRef.current;
    try {
      const [artistBoard, songBoard] = await Promise.all([
        fetchStandings({ type: 'artist', jurisdictionId, genre: wanted, period: 'weekly', limit: 3 }),
        fetchStandings({ type: 'song', jurisdictionId, genre: wanted, period: 'weekly', limit: 3 }),
      ]);
      if (lastTopsIdRef.current !== jurisdictionId || genreRef.current !== wanted) return;
      setRawTops({
        status: describeBoard(songBoard),
        artists: artistBoard.entries.filter((e) => e.points > 0).map((a) => ({ id: a.id, rank: a.rank, name: a.name, movement: a.movement, isNew: a.isNew, artwork: a.artwork })),
        songs: songBoard.entries.filter((e) => e.points > 0).map((s) => ({
          id: s.id, rank: s.rank, title: s.name, artist: s.artistName || 'Unknown', artistId: s.artistId, movement: s.movement, isNew: s.isNew, fileUrl: s.fileUrl, artwork: s.artwork,
        })),
      });
    } catch (err: any) {
      console.error('[find] standings fetch failed:', err?.message || err);
      setError('Top results are unavailable right now. Try again in a moment.');
      setRawTops({ artists: [], songs: [], status: null });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    genreRef.current = genre;
    if (lastTopsIdRef.current && hasSelectedJurisdiction) fetchTopResultsById(lastTopsIdRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genre]);

  const clearTops = useCallback(() => {
    lastTopsIdRef.current = null;
    setRawTops({ artists: [], songs: [], status: null });
    setLoading(false);
  }, []);

  const autoDrill = useCallback(async (siblings: MapTerritory[], steps: any[]) => {
    if (!steps.length) return;
    drillingRef.current = true;
    setDrilling(true);
    setLoading(true);
    setHasSelectedJurisdiction(true);
    let onScreen = siblings;
    try {
      for (let i = 0; i < steps.length; i += 1) {
        const step = steps[i];
        const isTarget = i === steps.length - 1;
        await wait(DRILL_STEP_MS);
        if (unmountedRef.current) return;
        const full: any = onScreen.find((j) => j.jurisdictionId === step.jurisdictionId) || step;
        setSelectedJurisdiction(full);
        const [children] = await Promise.all([
          full.hasChildren === false ? Promise.resolve([]) : fetchChildren(step.jurisdictionId),
          isTarget ? fetchTopResultsById(step.jurisdictionId) : Promise.resolve(),
        ]);
        if (unmountedRef.current) return;
        if (children.length > 0) {
          setNavigationStack((prev) => [...prev, { name: step.name, jurisdictionId: step.jurisdictionId, tier: prev[prev.length - 1].tier + 1 }]);
          setCurrentJurisdictions(children);
          onScreen = children;
        }
      }
    } finally {
      drillingRef.current = false;
      if (!unmountedRef.current) setDrilling(false);
    }
  }, [fetchChildren, fetchTopResultsById]);

  const handleStateSelect = useCallback(async (stateName: string) => {
    if (drillingRef.current || focusState === stateName) return;
    setLoading(true);
    setHasSelectedJurisdiction(true);
    setError(null);
    try {
      const [stateRes, index] = await Promise.all([
        axiosInstance.get(`/v1/jurisdictions/byName/${encodeURIComponent(stateName)}`),
        loadOpenIndex(),
      ]);
      const jurisdiction = stateRes.data?.[0];
      if (!index) {
        setLoading(false);
        setHasSelectedJurisdiction(false);
        setError('The map could not load right now. Try again in a moment.');
        return;
      }
      if (!jurisdiction) {
        setLoading(false);
        setHasSelectedJurisdiction(false);
        showComingSoonToast(stateName);
        return;
      }
      const isLive = index.pathIds.has(jurisdiction.jurisdictionId);
      const way = isLive ? openTargetBelow(index, jurisdiction.jurisdictionId) : null;
      const opensHere = Boolean(way && way.steps.length === 0);
      const [children] = await Promise.all([
        fetchChildren(jurisdiction.jurisdictionId),
        opensHere ? fetchTopResultsById(jurisdiction.jurisdictionId) : Promise.resolve(),
      ]);
      setFocusState(stateName);
      setNavigationStack([ROOT_CRUMB, { name: stateName, jurisdictionId: jurisdiction.jurisdictionId, tier: 2 }]);
      setCurrentJurisdictions(children);
      setSelectedJurisdiction(jurisdiction);
      if (way && way.steps.length > 0) await autoDrill(children, way.steps);
      else if (!opensHere) clearTops();
    } catch (err: any) {
      console.error('[find] state select failed:', err?.message || err);
      setError(`${stateName} could not be loaded. Try again in a moment.`);
      setLoading(false);
    }
  }, [fetchChildren, fetchTopResultsById, showComingSoonToast, focusState, loadOpenIndex, autoDrill, clearTops]);

  const handleTerritorySelect = useCallback(async (jurisdiction: MapTerritory) => {
    if (drillingRef.current) return;
    const { jurisdictionId, name, hasChildren } = jurisdiction;
    setSelectedJurisdiction(jurisdiction);
    if (!openIndex.pathNames.has(focusState || '')) {
      showComingSoonToast(name);
      return;
    }
    setHasSelectedJurisdiction(true);
    setError(null);
    const way = openTargetBelow(openIndex, jurisdictionId);
    const opensHere = Boolean(way && way.steps.length === 0);
    const drillTo = way && way.steps.length > 0 ? way.steps : null;
    if (drillTo) setLoading(true);
    const [children] = await Promise.all([
      hasChildren ? fetchChildren(jurisdictionId) : Promise.resolve([] as MapTerritory[]),
      opensHere ? fetchTopResultsById(jurisdictionId) : Promise.resolve(),
    ]);
    if (!opensHere && !drillTo) clearTops();
    if (hasChildren && children.length > 0) {
      setNavigationStack((prev) => [...prev, { name, jurisdictionId, tier: prev[prev.length - 1].tier + 1 }]);
      setCurrentJurisdictions(children);
    }
    if (drillTo) await autoDrill(children, drillTo);
  }, [fetchChildren, fetchTopResultsById, focusState, showComingSoonToast, openIndex, autoDrill, clearTops]);

  const resetToNational = useCallback(() => {
    setNavigationStack([ROOT_CRUMB]);
    setCurrentJurisdictions([]);
    setSelectedJurisdiction(null);
    setFocusState(null);
    setHasSelectedJurisdiction(false);
    setRawTops({ artists: [], songs: [], status: null });
    lastTopsIdRef.current = null;
    setError(null);
  }, []);

  const navigateToCrumb = useCallback(async (targetIndex: number) => {
    if (drillingRef.current) return;
    if (targetIndex >= navigationStack.length - 1) return;
    const target = navigationStack[targetIndex];
    if (target.tier === 0 || !target.jurisdictionId) { resetToNational(); return; }
    setNavigationStack(navigationStack.slice(0, targetIndex + 1));
    const way = openTargetBelow(openIndex, target.jurisdictionId);
    const [children] = await Promise.all([
      fetchChildren(target.jurisdictionId),
      way ? fetchTopResultsById(way.target.jurisdictionId) : Promise.resolve(clearTops()),
    ]);
    setCurrentJurisdictions(children);
    try {
      const res = await axiosInstance.get(`/v1/jurisdictions/${target.jurisdictionId}`);
      setSelectedJurisdiction(res.data);
    } catch (err: any) {
      console.warn('[find] crumb detail fetch failed:', err?.message || err);
    }
  }, [navigationStack, fetchChildren, fetchTopResultsById, resetToNational, openIndex, clearTops]);

  const handleBack = useCallback(() => {
    if (drillingRef.current || navigationStack.length <= 1) return;
    navigateToCrumb(navigationStack.length - 2);
  }, [navigationStack, navigateToCrumb]);

  const handleRandom = useCallback(() => {
    if (isAnimating || drillingRef.current) return;
    setIsAnimating(true);
    const pool = ['California', 'Texas', 'Georgia', 'Illinois', 'New York', 'Florida'];
    let count = 0;
    spinTimer.current = setInterval(() => {
      count += 1;
      if (count >= 8) {
        clearInterval(spinTimer.current);
        setIsAnimating(false);
        const landed = pool[Math.floor(Math.random() * pool.length)];
        if (openIndex.pathNames.has(landed)) handleStateSelect(landed);
        else showComingSoonToast(landed);
      }
    }, 110);
  }, [isAnimating, handleStateSelect, showComingSoonToast, openIndex]);

  const handlePlay = useCallback((item: Top, kind: 'song' | 'artist') => playEntry(
    kind === 'song'
      ? { type: 'song', id: item.id, name: item.title, artistName: item.artist, artistId: item.artistId, fileUrl: item.fileUrl, artwork: item.artwork } as any
      : { type: 'artist', id: item.id, name: item.name, artwork: item.artwork } as any,
    requestPlay as any,
    'findpage',
  ).then((played: boolean) => { if (!played) feedback.info(`${item.name || item.title} hasn’t picked a song to feature yet`); }), [requestPlay, feedback]);

  const genreLabel = titleCase(genre);
  const mapMode = useMemo<'US' | 'STATE' | 'TERRITORY'>(() => (navigationStack.length <= 1 ? 'US' : navigationStack.length === 2 ? 'STATE' : 'TERRITORY'), [navigationStack]);
  const atNationalLevel = mapMode === 'US';
  const displayTerritory = selectedJurisdiction?.name || navigationStack[navigationStack.length - 1]?.name || 'Select a state';
  const showComingSoonPanel = Boolean(selectedJurisdiction) && !openIndex.pathIds.has(selectedJurisdiction?.jurisdictionId);
  const showPickPanel = !drilling && Boolean(selectedJurisdiction) && !showComingSoonPanel && !isOpen(selectedJurisdiction)
    && openTargetBelow(openIndex, selectedJurisdiction?.jurisdictionId) === null;
  const songs = rawTops.songs.slice(0, 3);
  const artists = rawTops.artists.slice(0, 3);
  const chartPlace = (() => {
    const key = String(displayTerritory || '').trim().toLowerCase().replace(/\s+/g, '-');
    return ['harlem', 'uptown-harlem', 'downtown-harlem'].includes(key) ? key : 'harlem';
  })();
  const openChart = () => navigation.navigate('Charts', { type: 'song', period: 'weekly', genre, place: chartPlace });
  const openJurisdiction = () => {
    if (!selectedJurisdiction?.name) return;
    navigation.navigate('Home', { screen: 'Jurisdiction', params: { jurisdictionName: selectedJurisdiction.name, jurisdictionId: selectedJurisdiction.jurisdictionId } });
  };
  const openItem = (item: Top, kind: 'song' | 'artist') =>
    navigation.navigate('Home', kind === 'song' ? { screen: 'Song', params: { songId: item.id } } : { screen: 'Artist', params: { artistId: item.id } });

  const renderColumn = (heading: string, items: Top[], kind: 'song' | 'artist', emptyCopy: string) => (
    <View style={styles.column}>
      <Pressable onPress={openJurisdiction}>
        <Text style={styles.colTitle}>{heading} {rawTops.status?.tone === 'final' ? 'last week' : 'this week'} in {displayTerritory}</Text>
      </Pressable>
      {loading ? (
        <View style={[styles.row, styles.skel]} />
      ) : items.length > 0 ? items.map((item, i) => (
        <View key={item.id || i} style={styles.row}>
          {!!item.artwork && <Image source={{ uri: item.artwork }} style={styles.ambient} blurRadius={40} />}
          <View style={styles.rank}>
            <Text style={styles.rankNum}>{item.rank || i + 1}</Text>
            <RankMove movement={item.movement} isNew={item.isNew} />
          </View>
          <Art uri={item.artwork} label={(kind === 'song' ? item.title : item.name) || '?'} t={t} />
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>{kind === 'song' ? item.title : item.name}</Text>
            {kind === 'song' && <Text style={styles.sub} numberOfLines={1}>{item.artist}</Text>}
          </View>
          <Pressable style={[styles.playBtn, { backgroundColor: t.primary }]} onPress={() => handlePlay(item, kind)} accessibilityLabel={`Play ${kind === 'song' ? item.title : item.name}`}>
            <Text style={styles.btnTxt}>Play</Text>
          </Pressable>
          <Pressable style={styles.viewBtn} onPress={() => openItem(item, kind)}>
            <Text style={styles.btnTxt}>View</Text>
          </Pressable>
        </View>
      )) : (
        <View style={[styles.row, { justifyContent: 'center' }]}><Text style={styles.sub}>{emptyCopy}</Text></View>
      )}
    </View>
  );

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.filters}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {GENRES.map((g) => {
            const on = genre === g.value;
            return (
              <Pressable key={g.value} onPress={() => setGenre(g.value)} style={[styles.pill, on && { backgroundColor: t.primary, borderColor: t.primary }]} accessibilityState={{ selected: on }}>
                <Text style={[styles.pillText, on && { color: '#fff' }]}>{g.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Pressable style={styles.random} onPress={handleRandom} disabled={isAnimating || loading}>
          <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
            <Rect x={3} y={3} width={18} height={18} rx={4} stroke="#fff" strokeWidth={2} />
            <Circle cx={8.5} cy={8.5} r={1.3} fill="#fff" />
            <Circle cx={15.5} cy={15.5} r={1.3} fill="#fff" />
            <Circle cx={15.5} cy={8.5} r={1.3} fill="#fff" />
            <Circle cx={8.5} cy={15.5} r={1.3} fill="#fff" />
          </Svg>
          <Text style={styles.randomText}>{isAnimating ? 'Spinning' : 'Surprise me'}</Text>
        </Pressable>
      </View>

      <View pointerEvents={drilling ? 'none' : 'auto'}>
        <View style={styles.crumbs} accessibilityLabel="Territory path">
          {navigationStack.map((level, i) => {
            const isLast = i === navigationStack.length - 1;
            return (
              <View key={`${level.name}-${i}`} style={styles.crumbGroup}>
                {isLast ? <Text style={styles.here}>{level.name}</Text> : (
                  <Pressable onPress={() => navigateToCrumb(i)} hitSlop={4}><Text style={styles.crumb}>{level.name}</Text></Pressable>
                )}
                {!isLast && <Text style={styles.sep}>›</Text>}
              </View>
            );
          })}
        </View>

        <View style={styles.heroRow}>
          <Text style={styles.territory} numberOfLines={1}>{displayTerritory}</Text>
          {(loading || drilling) && <ActivityIndicator color={t.textAccent} size="small" />}
        </View>

        <Pressable onPress={handleBack} style={[styles.back, atNationalLevel && { opacity: 0 }]} disabled={atNationalLevel}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>

        <View style={styles.mapFrame}>
          <UnisMap
            mode={mapMode}
            focusState={focusState}
            territories={currentJurisdictions}
            selectedId={selectedJurisdiction?.jurisdictionId || null}
            liveStates={openIndex.liveStates}
            liveTerritories={openIndex.openNames}
            primary={t.primary}
            primaryBright={t.primary2}
            onStateSelect={handleStateSelect}
            onTerritorySelect={handleTerritorySelect}
          />
          <View style={styles.key}>
            <View style={styles.keyItem}><View style={[styles.keyDot, { backgroundColor: t.primary2 }]} /><Text style={styles.keyText}>Live on Unis</Text></View>
            <View style={styles.keyItem}><View style={[styles.keyDot, { backgroundColor: '#2a2e3a' }]} /><Text style={styles.keyText}>Not open yet</Text></View>
          </View>
        </View>

        {currentJurisdictions.length > 0 && (
          <View style={styles.rail}>
            <Text style={styles.railTitle}>Regions in {navigationStack[navigationStack.length - 1]?.name}</Text>
            <View style={styles.chips}>
              {currentJurisdictions.map((j) => {
                const sel = selectedJurisdiction?.jurisdictionId === j.jurisdictionId;
                return (
                  <Pressable key={j.jurisdictionId} onPress={() => handleTerritorySelect(j)} style={[styles.chip, sel && { borderColor: t.primary, backgroundColor: t.soft }]}>
                    <Text style={styles.chipText}>{j.name}</Text>
                    {isOpen(j) && <View style={styles.liveDot} accessibilityLabel="live" />}
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
      </View>

      {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}

      {hasSelectedJurisdiction && (
        <View style={styles.results}>
          {showComingSoonPanel ? (
            <View style={styles.soon}>
              <Text style={styles.soonTitle}>{selectedJurisdiction?.name}</Text>
              <Text style={styles.soonText}>No charts here yet. Join the waitlist and we'll tell you the day it opens.</Text>
              <Pressable style={[styles.cta, { backgroundColor: t.primary }]} onPress={() => Linking.openURL(webUrl('/waitlist'))}><Text style={styles.btnTxt}>Join the waitlist</Text></Pressable>
            </View>
          ) : showPickPanel ? (
            <View style={styles.soon}>
              <Text style={styles.soonTitle}>{selectedJurisdiction?.name}</Text>
              <Text style={styles.soonText}>Pick a neighborhood on the map to see its charts.</Text>
            </View>
          ) : (
            <>
              {renderColumn('Top songs', songs, 'song', `No ${genreLabel} songs charted here yet.`)}
              {renderColumn('Top artists', artists, 'artist', `No ${genreLabel} artists charted here yet.`)}
              <Pressable style={styles.fullChart} onPress={openChart}>
                <Text style={styles.btnTxt}>See the full {genreLabel} chart for {displayTerritory}</Text>
              </Pressable>
            </>
          )}
        </View>
      )}

      <View style={{ marginTop: 18 }}><AdSlot placement="find" /></View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 160 },
  filters: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  pill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', backgroundColor: 'rgba(255,255,255,0.04)' },
  pillText: { color: 'rgba(255,255,255,0.8)', fontWeight: '700', fontSize: 13 },
  random: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 'auto', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)' },
  randomText: { color: '#fff', fontWeight: '700', fontSize: 12.5 },
  crumbs: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
  crumbGroup: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  crumb: { color: 'rgba(255,255,255,0.6)', fontSize: 12.5, fontWeight: '600', textDecorationLine: 'underline' },
  here: { color: '#fff', fontSize: 12.5, fontWeight: '800' },
  sep: { color: 'rgba(255,255,255,0.35)', fontSize: 12.5 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  territory: { color: '#fff', fontSize: 28, fontWeight: '900', letterSpacing: -0.6, flexShrink: 1 },
  back: { alignSelf: 'flex-start', paddingVertical: 6, marginTop: 2 },
  backText: { color: 'rgba(255,255,255,0.8)', fontWeight: '700', fontSize: 14 },
  mapFrame: { borderRadius: 20, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  key: { flexDirection: 'row', gap: 14, padding: 10 },
  keyItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  keyDot: { width: 9, height: 9, borderRadius: 5 },
  keyText: { color: 'rgba(255,255,255,0.6)', fontSize: 11.5 },
  rail: { marginTop: 14 },
  railTitle: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  chipText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#4ade80' },
  error: { color: '#fca5a5', fontSize: 13.5, textAlign: 'center', marginTop: 14 },
  results: { marginTop: 18, gap: 18 },
  column: { gap: 8 },
  colTitle: { color: '#fff', fontSize: 17, fontWeight: '800', textDecorationLine: 'underline' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 16, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', minHeight: 68 },
  skel: { backgroundColor: 'rgba(255,255,255,0.06)' },
  ambient: { ...StyleSheet.absoluteFillObject, opacity: 0.22 },
  rank: { width: 28, alignItems: 'center', gap: 2 },
  rankNum: { color: '#fff', fontWeight: '900', fontSize: 16 },
  art: { width: 46, height: 46, borderRadius: 10 },
  title: { color: '#fff', fontWeight: '700', fontSize: 14.5 },
  sub: { color: 'rgba(255,255,255,0.6)', fontSize: 12.5, marginTop: 1 },
  playBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  viewBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.1)' },
  btnTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
  fullChart: { alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)' },
  soon: { alignItems: 'center', padding: 20, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.04)', gap: 8 },
  soonTitle: { color: '#fff', fontSize: 20, fontWeight: '900' },
  soonText: { color: 'rgba(255,255,255,0.7)', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  cta: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, marginTop: 4 },
});

export default FindScreen;
