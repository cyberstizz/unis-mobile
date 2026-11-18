// src/screens/ChartsScreen.tsx
// ─────────────────────────────────────────────────────────────
// CHARTS — the long list. Mobile port of web src/chartsPage.jsx.
//
//   • The chart's own #1 is the only hero, with its lead over #2.
//   • Each row: rank + movement, the entry, why it's there (votes, plays,
//     likes), points, play.
//   • Filters always visible (Songs/Artists, period, genre, place).
//   • The song that's playing lights up in the list.
//   • Entries with no points this period sit below a divider.
//   • Keeps loading 50 at a time as you reach the end.
//
// Ranking comes from /v1/awards/standings (utils/standings): the same formula
// that decides awards. This screen never counts plays.
//
// Deep link params: { type, period, genre, place } — e.g. from the feed's
// "See the full chart".
// ─────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';
import { ChevronDown, Check } from 'lucide-react-native';
import { usePlayer } from '../context/PlayerContext';
import { useAuth } from '../context/AuthContext';
import { JURISDICTION_IDS, JURISDICTION_NAMES } from '../utils/IdMappings';
import { PERIODS, periodByKey, fetchStandings, describeBoard, formatCount, playEntry, Board, BoardEntry } from '../utils/standings';
import { useUnisTheme, UnisTheme, rgba } from '../theme/unisTheme';
import { openScreen } from '../navigation/navigationRef';
import RankMove from '../components/RankMove';

const PAGE_SIZE = 50;
const TYPES = [{ key: 'song', label: 'Songs' }, { key: 'artist', label: 'Artists' }];
const GENRES = [{ key: 'all', label: 'All genres' }, { key: 'rap', label: 'Rap' }, { key: 'rock', label: 'Rock' }, { key: 'pop', label: 'Pop' }];
const PLACES = [{ key: 'harlem', label: 'Harlem' }, { key: 'uptown-harlem', label: 'Uptown Harlem' }, { key: 'downtown-harlem', label: 'Downtown Harlem' }];

const pick = (list: { key: string }[], value: any, fallback: string) => (list.some((o) => o.key === value) ? value : fallback);

const reasonLine = (e: BoardEntry) => {
  const parts: string[] = [];
  if (e.votes) parts.push(`${formatCount(e.votes)} vote${e.votes === 1 ? '' : 's'}`);
  if (e.plays) parts.push(`${formatCount(e.plays)} play${e.plays === 1 ? '' : 's'}`);
  if (e.likes) parts.push(`${formatCount(e.likes)} like${e.likes === 1 ? '' : 's'}`);
  return parts.join(' · ');
};

const PlayGlyph = ({ color = '#fff' }) => (<Svg viewBox="0 0 24 24" width={14} height={14}><Path d="M8 5.5v13l10.5-6.5z" fill={color} /></Svg>);
const PauseGlyph = ({ color = '#fff' }) => (<Svg viewBox="0 0 24 24" width={14} height={14}><Path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill={color} /></Svg>);

const Equalizer: React.FC<{ color: string }> = ({ color }) => (
  <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 12 }}>
    <View style={{ width: 3, height: 8, backgroundColor: color, borderRadius: 1 }} />
    <View style={{ width: 3, height: 12, backgroundColor: color, borderRadius: 1 }} />
    <View style={{ width: 3, height: 6, backgroundColor: color, borderRadius: 1 }} />
  </View>
);

const Art: React.FC<{ src?: string | null; label: string; size: number; round?: boolean; t: UnisTheme }> = ({ src, label, size, round, t }) => {
  const [broken, setBroken] = useState(false);
  const radius = round ? size / 2 : Math.round(size * 0.18);
  if (!src || broken) {
    return (
      <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: t.soft, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: t.textAccent, fontWeight: '900', fontSize: size * 0.4 }}>{(label || '?').trim().charAt(0).toUpperCase()}</Text>
      </View>
    );
  }
  return <Image source={{ uri: src }} style={{ width: size, height: size, borderRadius: radius }} onError={() => setBroken(true)} />;
};

const Segmented: React.FC<{ options: { key: string; label: string }[]; value: string; onChange: (v: string) => void; t: UnisTheme; label: string }> = ({ options, value, onChange, t, label }) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.seg} accessibilityLabel={label}>
    {options.map((o) => {
      const on = o.key === value;
      return (
        <Pressable key={o.key} onPress={() => onChange(o.key)} style={[styles.segBtn, on && { backgroundColor: t.primary, borderColor: t.primary }]} accessibilityState={{ selected: on }}>
          <Text style={[styles.segText, on && { color: '#fff' }]}>{o.label}</Text>
        </Pressable>
      );
    })}
  </ScrollView>
);

const ChartsScreen: React.FC = () => {
  const t = useUnisTheme();
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { requestPlay, currentMedia, isPlaying, togglePlayPause } = usePlayer();
  const listRef = useRef<FlatList>(null);

  const homeKey = JURISDICTION_NAMES[user?.jurisdiction?.jurisdictionId || ''];
  const [filters, setFilters] = useState(() => ({
    type: pick(TYPES, route.params?.type, 'song'),
    period: PERIODS.some((p) => p.key === route.params?.period) ? route.params?.period : 'weekly',
    genre: pick(GENRES, route.params?.genre, 'all'),
    place: pick(PLACES, route.params?.place, pick(PLACES, homeKey, 'harlem')),
  }));

  // New deep link while the screen is already mounted (feed → See the full chart).
  useEffect(() => {
    const p = route.params || {};
    if (!p.type && !p.period && !p.genre && !p.place) return;
    setFilters((cur) => ({
      type: pick(TYPES, p.type, cur.type),
      period: PERIODS.some((x) => x.key === p.period) ? p.period : cur.period,
      genre: pick(GENRES, p.genre, cur.genre),
      place: pick(PLACES, p.place, cur.place),
    }));
  }, [route.params]);

  const { type, period, genre, place } = filters;
  const jurisdictionId = JURISDICTION_IDS[place];
  const placeLabel = PLACES.find((p) => p.key === place)?.label || 'Harlem';
  const setFilter = (key: keyof typeof filters, value: string) => setFilters((cur) => ({ ...cur, [key]: value }));

  const [board, setBoard] = useState<Board | null>(null);
  const [entries, setEntries] = useState<BoardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moreFailed, setMoreFailed] = useState(false);
  const [placeOpen, setPlaceOpen] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const requestRef = useRef(0);

  const loadFirst = useCallback(async () => {
    const id = ++requestRef.current;
    setLoading(true);
    setError(null);
    setMoreFailed(false);
    setEntries([]);
    setBoard(null);
    try {
      const b = await fetchStandings({ type: type as any, jurisdictionId, genre, period, limit: PAGE_SIZE, offset: 0 });
      if (id !== requestRef.current) return;
      setBoard(b);
      setEntries(b.entries);
    } catch (err: any) {
      if (id !== requestRef.current) return;
      console.error('[Charts] load failed:', err?.message || err);
      setError("The chart didn't load. Check your connection and try again.");
    } finally {
      if (id === requestRef.current) setLoading(false);
    }
  }, [type, jurisdictionId, genre, period]);

  useEffect(() => { loadFirst(); }, [loadFirst]);

  const hasMore = !!board && entries.length < board.total;

  const loadMore = useCallback(async (force = false) => {
    if (loading || loadingMore || (moreFailed && !force) || !board || entries.length >= board.total) return;
    setMoreFailed(false);
    const id = requestRef.current;
    setLoadingMore(true);
    try {
      const b = await fetchStandings({ type: type as any, jurisdictionId, genre, period, limit: PAGE_SIZE, offset: entries.length });
      if (id !== requestRef.current) return;
      // A period closed between pages (midnight) — start again from the top.
      if (b.state !== board.state || b.periodStart !== board.periodStart) { loadFirst(); return; }
      setEntries((prev) => {
        const seen = new Set(prev.map((e) => e.id));
        return [...prev, ...b.entries.filter((e) => !seen.has(e.id))];
      });
      setBoard((prev) => (prev ? { ...prev, total: b.total } : prev));
    } catch (err: any) {
      if (id !== requestRef.current) return;
      console.error('[Charts] next page failed:', err?.message || err);
      setMoreFailed(true);
    } finally {
      if (id === requestRef.current) setLoadingMore(false);
    }
  }, [loading, loadingMore, moreFailed, board, entries.length, type, jurisdictionId, genre, period, loadFirst]);

  // ── Playing ─────────────────────────────────────────────
  const playingSongId = currentMedia?.songId || currentMedia?.id || null;
  const isCurrent = (e: BoardEntry) => (e.type === 'song' ? !!playingSongId && e.id === playingSongId : !!currentMedia?.artistId && e.id === currentMedia.artistId);
  const handlePlay = async (e: BoardEntry) => {
    if (isCurrent(e)) { togglePlayPause(); return; }
    await playEntry(e, requestPlay as any, 'charts');
  };
  const openEntry = (e: BoardEntry) => openScreen(e.type === 'artist' ? 'Artist' : 'Song', e.type === 'artist' ? { artistId: e.id } : { songId: e.id });
  const openArtist = (e: BoardEntry) => { if (e.artistId) openScreen('Artist', { artistId: e.artistId }); };

  // ── Derived ─────────────────────────────────────────────
  const status = board ? describeBoard(board) : null;
  const shownPeriod = periodByKey(board?.periodKey || period);
  const periodPhrase = board?.state === 'LIVE' ? shownPeriod.current : shownPeriod.previous.toLowerCase();
  const lead = entries[0] && entries[0].points > 0 ? entries[0] : null;
  const runnerUp = entries[1] || null;
  const rows = useMemo(() => (lead ? entries.slice(1) : entries), [entries, lead]);
  const firstUnscored = rows.findIndex((e) => e.points === 0);

  let leadLine: string | null = null;
  if (lead) {
    if (!runnerUp || runnerUp.points === 0) leadLine = 'Nobody else has scored yet';
    else if (runnerUp.points === lead.points) leadLine = `Tied with ${runnerUp.name}, ahead on the tiebreak`;
    else {
      const gap = lead.points - runnerUp.points;
      leadLine = `Ahead by ${formatCount(gap)} point${gap === 1 ? '' : 's'}`;
    }
  }
  const leadKicker = board?.state === 'PREVIOUS_FINAL'
    ? (lead?.winner ? 'Won' : 'Finished first')
    : board?.state === 'PREVIOUS_CLOSING' ? 'Leading, still counting' : 'Number one right now';
  const noun = type === 'artist' ? 'artist' : 'song';
  const statusColor = status?.tone === 'live' ? '#4ade80' : status?.tone === 'closing' ? '#fbbf24' : 'rgba(255,255,255,0.5)';

  const PlayBtn = ({ e, big = false }: { e: BoardEntry; big?: boolean }) => {
    const current = isCurrent(e);
    const playing = current && isPlaying;
    return (
      <Pressable
        onPress={() => handlePlay(e)}
        style={[big ? styles.playBig : styles.play, { backgroundColor: current ? t.primary : big ? '#fff' : 'rgba(255,255,255,0.1)' }]}
        accessibilityLabel={playing ? `Pause ${e.name}` : `Play ${e.name}`}
        hitSlop={6}
      >
        {playing ? (big ? <PauseGlyph /> : <Equalizer color="#fff" />) : <PlayGlyph color={big && !current ? '#0b0b0f' : '#fff'} />}
        {big && <Text style={[styles.playBigText, { color: current ? '#fff' : '#0b0b0f' }]}>{playing ? 'Pause' : 'Play'}</Text>}
      </Pressable>
    );
  };

  const header = (
    <View>
      <Text style={styles.title} accessibilityRole="header">{placeLabel} charts</Text>
      {status && (
        <View style={styles.statusRow} accessibilityRole="text">
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={styles.statusText}><Text style={{ color: '#fff', fontWeight: '800' }}>{status.title}.</Text>{status.detail ? ` ${status.detail}` : ''}</Text>
        </View>
      )}

      <View style={{ gap: 8, marginTop: 14, marginBottom: 14 }}>
        <Segmented label="Show" options={TYPES} value={type} onChange={(v) => setFilter('type', v)} t={t} />
        <Segmented label="Period" options={PERIODS.map((p) => ({ key: p.key, label: p.label }))} value={period} onChange={(v) => setFilter('period', v)} t={t} />
        <Segmented label="Genre" options={GENRES} value={genre} onChange={(v) => setFilter('genre', v)} t={t} />
        <Pressable style={styles.place} onPress={() => setPlaceOpen(true)} accessibilityLabel={`Place: ${placeLabel}`}>
          <Text style={styles.placeText}>{placeLabel}</Text>
          <ChevronDown size={16} color="rgba(255,255,255,0.7)" />
        </Pressable>
      </View>

      {!loading && !error && entries.length > 0 && lead && (
        <View style={[styles.lead, { borderColor: t.border }]} accessibilityLabel={`Number one: ${lead.name}`}>
          {!!lead.artwork && <Image source={{ uri: lead.artwork }} style={styles.leadGlow} blurRadius={40} />}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: rgba(t.primaryDeep, 0.45) }]} />
          <View style={styles.leadTop}>
            <View style={{ alignItems: 'center', gap: 4 }}>
              <Text style={[styles.leadNum, { color: t.textAccent }]}>{lead.rank}</Text>
              <RankMove movement={lead.movement} isNew={lead.isNew} />
            </View>
            <Pressable onPress={() => openEntry(lead)} accessibilityLabel={`Open ${lead.name}`}>
              <Art src={lead.artwork} label={lead.name} size={88} round={lead.type === 'artist'} t={t} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={[styles.leadKicker, { color: t.textAccent }]}>{leadKicker}</Text>
              <Pressable onPress={() => openEntry(lead)}><Text style={styles.leadName} numberOfLines={2}>{lead.name}</Text></Pressable>
              {lead.type === 'song' && !!lead.artistName && (
                <Pressable onPress={() => openArtist(lead)}><Text style={styles.leadArtist} numberOfLines={1}>{lead.artistName}</Text></Pressable>
              )}
              <Text style={styles.leadMeta}>{reasonLine(lead)}</Text>
            </View>
          </View>
          <View style={styles.leadSide}>
            <View>
              <Text style={styles.leadPoints}>{formatCount(lead.points)} <Text style={styles.leadPointsUnit}>points</Text></Text>
              <Text style={styles.leadGap}>{leadLine}</Text>
            </View>
            <PlayBtn e={lead} big />
          </View>
        </View>
      )}

      {!loading && !error && entries.length > 0 && !lead && (
        <Text style={styles.note}>Nothing has scored {periodPhrase} yet. Everyone below is listed by all-time points.</Text>
      )}
    </View>
  );

  const renderRow = ({ item: e, index: i }: { item: BoardEntry; index: number }) => {
    const unscored = e.points === 0;
    const current = isCurrent(e);
    return (
      <View>
        {lead && i === firstUnscored && (
          <Text style={styles.divider}>No points {periodPhrase} yet, listed by all-time points</Text>
        )}
        <View style={[styles.row, e.rank <= 3 && !unscored && styles.rowTop, current && { borderColor: t.primary, backgroundColor: rgba(t.primary, 0.12) }, unscored && { opacity: 0.7 }]}>
          <View style={styles.rank}>
            <Text style={[styles.rankNum, e.rank <= 3 && !unscored && { color: t.textAccent }]}>{e.rank}</Text>
            {!unscored && <RankMove movement={e.movement} isNew={e.isNew} />}
          </View>
          <Pressable onPress={() => openEntry(e)} accessibilityElementsHidden importantForAccessibility="no">
            <Art src={e.artwork} label={e.name} size={46} round={e.type === 'artist'} t={t} />
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Pressable onPress={() => openEntry(e)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.name} numberOfLines={1}>{e.name}</Text>
              {e.winner && <Text style={styles.won}>Won</Text>}
            </Pressable>
            {e.type === 'song' && !!e.artistName && (
              <Pressable onPress={() => openArtist(e)}><Text style={styles.artist} numberOfLines={1}>{e.artistName}</Text></Pressable>
            )}
            {!unscored && !!reasonLine(e) && <Text style={styles.reason} numberOfLines={1}>{reasonLine(e)}</Text>}
          </View>
          <View style={styles.points}>
            {unscored ? <Text style={styles.pointsNone}>—</Text> : (
              <>
                <Text style={styles.pointsNum}>{formatCount(e.points)}</Text>
                <Text style={styles.pointsUnit}>pts</Text>
              </>
            )}
          </View>
          <PlayBtn e={e} />
        </View>
      </View>
    );
  };

  const footer = (
    <View style={styles.foot}>
      {loadingMore && <ActivityIndicator color="#fff" style={{ marginBottom: 8 }} />}
      {entries.length > 0 && (
        <Text style={styles.footText}>
          Showing {formatCount(entries.length)} of {formatCount(board?.total || entries.length)} {noun}{(board?.total || entries.length) === 1 ? '' : 's'}
        </Text>
      )}
      {hasMore && moreFailed && (
        <Pressable style={styles.btn} onPress={() => loadMore(true)} disabled={loadingMore}>
          <Text style={styles.btnText}>Try loading more again</Text>
        </Pressable>
      )}
    </View>
  );

  const empty = loading ? (
    <View>
      {Array.from({ length: 8 }).map((_, i) => <View key={i} style={styles.skel} />)}
    </View>
  ) : error ? (
    <View style={styles.empty} accessibilityRole="alert">
      <Text style={styles.emptyText}>{error}</Text>
      <Pressable style={styles.btn} onPress={loadFirst}><Text style={styles.btnText}>Try again</Text></Pressable>
    </View>
  ) : (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>No {genre === 'all' ? '' : `${GENRES.find((g) => g.key === genre)?.label} `}{noun}s in {placeLabel} yet.</Text>
      <Pressable style={styles.btn} onPress={() => navigation.navigate('Discover')}><Text style={styles.btnText}>Explore Discover</Text></Pressable>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        ref={listRef}
        data={loading || error ? [] : rows}
        keyExtractor={(e) => e.id}
        renderItem={renderRow}
        ListHeaderComponent={header}
        ListEmptyComponent={entries.length === 0 ? empty : null}
        ListFooterComponent={footer}
        contentContainerStyle={styles.page}
        onEndReached={() => loadMore()}
        onEndReachedThreshold={1.5}
        onScroll={(ev) => setShowTop(ev.nativeEvent.contentOffset.y > 1200)}
        scrollEventThrottle={64}
        ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
      />

      {showTop && (
        <Pressable style={[styles.top, { backgroundColor: t.primary }]} onPress={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })}>
          <Text style={styles.topText}>Back to top</Text>
        </Pressable>
      )}

      <Modal visible={placeOpen} transparent animationType="fade" onRequestClose={() => setPlaceOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setPlaceOpen(false)}>
          <View style={[styles.placeCard, { borderColor: t.border }]}>
            {PLACES.map((p) => {
              const on = p.key === place;
              return (
                <Pressable key={p.key} style={[styles.placeRow, on && { backgroundColor: t.soft }]} onPress={() => { setFilter('place', p.key); setPlaceOpen(false); }}>
                  <Text style={[styles.placeRowText, on && { color: '#fff', fontWeight: '800' }]}>{p.label}</Text>
                  {on && <Check size={16} color={t.textAccent} />}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 160 },
  title: { color: '#fff', fontSize: 30, fontWeight: '900', letterSpacing: -0.6 },
  statusRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  statusText: { color: 'rgba(255,255,255,0.65)', fontSize: 13.5, lineHeight: 19, flex: 1 },
  seg: { gap: 6 },
  segBtn: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.04)' },
  segText: { color: 'rgba(255,255,255,0.75)', fontWeight: '700', fontSize: 13 },
  place: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.04)' },
  placeText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  lead: { borderRadius: 22, borderWidth: 1, overflow: 'hidden', padding: 14, marginBottom: 14 },
  leadGlow: { ...StyleSheet.absoluteFillObject, opacity: 0.6, transform: [{ scale: 1.4 }] },
  leadTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  leadNum: { fontSize: 40, fontWeight: '900', letterSpacing: -1 },
  leadKicker: { fontSize: 11.5, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  leadName: { color: '#fff', fontSize: 20, fontWeight: '900', marginTop: 2 },
  leadArtist: { color: 'rgba(255,255,255,0.75)', fontSize: 13.5, fontWeight: '600', marginTop: 1 },
  leadMeta: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 4 },
  leadSide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.2)' },
  leadPoints: { color: '#fff', fontSize: 22, fontWeight: '900' },
  leadPointsUnit: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.65)' },
  leadGap: { color: 'rgba(255,255,255,0.65)', fontSize: 12.5, marginTop: 2 },
  playBig: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999 },
  playBigText: { fontWeight: '800', fontSize: 14 },
  note: { color: 'rgba(255,255,255,0.6)', fontSize: 13.5, lineHeight: 19, marginBottom: 12 },
  divider: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '700', textAlign: 'center', paddingVertical: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', backgroundColor: 'rgba(255,255,255,0.03)' },
  rowTop: { backgroundColor: 'rgba(255,255,255,0.05)' },
  rank: { width: 32, alignItems: 'center', gap: 2 },
  rankNum: { color: 'rgba(255,255,255,0.75)', fontSize: 16, fontWeight: '900' },
  name: { color: '#fff', fontSize: 14.5, fontWeight: '700', flexShrink: 1 },
  won: { color: '#facc15', fontSize: 10, fontWeight: '900', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, backgroundColor: 'rgba(250,204,21,0.15)', overflow: 'hidden' },
  artist: { color: 'rgba(255,255,255,0.6)', fontSize: 12.5, marginTop: 1 },
  reason: { color: 'rgba(255,255,255,0.45)', fontSize: 11.5, marginTop: 2 },
  points: { alignItems: 'flex-end', minWidth: 40 },
  pointsNum: { color: '#fff', fontWeight: '900', fontSize: 14 },
  pointsUnit: { color: 'rgba(255,255,255,0.5)', fontSize: 10.5, fontWeight: '700' },
  pointsNone: { color: 'rgba(255,255,255,0.35)', fontSize: 14 },
  play: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  skel: { height: 66, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.05)', marginBottom: 6 },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  emptyText: { color: 'rgba(255,255,255,0.7)', fontSize: 14.5, textAlign: 'center' },
  btn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)', alignSelf: 'center' },
  btnText: { color: '#fff', fontWeight: '700' },
  foot: { alignItems: 'center', paddingVertical: 20, gap: 10 },
  footText: { color: 'rgba(255,255,255,0.5)', fontSize: 12.5 },
  top: { position: 'absolute', right: 16, bottom: 110, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999 },
  topText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 40 },
  placeCard: { borderRadius: 18, backgroundColor: '#11141c', borderWidth: 1, overflow: 'hidden' },
  placeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 15 },
  placeRowText: { color: 'rgba(255,255,255,0.8)', fontSize: 16, fontWeight: '600' },
});

export default ChartsScreen;
