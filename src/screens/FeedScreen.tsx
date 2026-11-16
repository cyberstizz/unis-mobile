// src/screens/FeedScreen.tsx
// ─────────────────────────────────────────────────────────────
// Mobile port of web src/feed.jsx.
//
//   Spotlight (today's leader → Song of the Week → Artist of the Week)
//   Lens bar: All · Charts · Playlists · Fresh
//   All:       Trending Today in <jurisdiction ▾> · New Releases · ad space ·
//              Songs of the Week timeline · Artist of the Week · Top 5 artists ·
//              Today's race · Your day · Movers · New from artists you follow
//   Charts:    this week's standings board (same formula as awards)
//   Playlists: featured (official, else top community) + community grid
//   Fresh:     dropped recently (+ Dropping soon once the backend has it)
//
// Plays are never recorded here — the Player records them after real
// listening (PLAY-FLOW). Taps go through requestPlay → PlayChoiceModal.
//
// All sub-components live at module scope: components defined inside the
// screen get a new identity every render and remount their subtree.
// ─────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
  Pressable,
  Modal,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Svg, { Circle, Path, Polygon, Rect } from 'react-native-svg';
import { useAuth } from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';
import { useReward } from '../context/RewardContext';
import { useFeedback } from '../context/FeedbackContext';
import axiosInstance from '../services/axiosInstance';
import { buildUrl } from '../utils/buildUrl';
import { JURISDICTION_NAMES, INTERVAL_IDS } from '../utils/IdMappings';
import { fetchStandings, describeBoard, formatCount, playEntry, Board, BoardEntry } from '../utils/standings';
import { toLocalISO } from '../utils/periodBounds';
import { useUnisTheme, UnisTheme } from '../theme/unisTheme';
import AdSlot from '../components/AdSlot';
import RankMove from '../components/RankMove';
import ArtistOfWeekCard, { ArtistOfWeek } from '../components/feed/ArtistOfWeekCard';
import { FeedSpotlight, TodayRace, DayTiles, MoversCard, FollowingDrops } from '../components/feed/FeedModules';
import LastWonNotification from './LastWonNotification';

const randomRapper = require('../../assets/randomrapper.jpeg');
const DEMO_ART = {
  one: require('../../assets/demo/songartworkONe.jpeg'),
  two: require('../../assets/demo/songartworktwo.jpeg'),
  three: require('../../assets/demo/songartworkthree.jpeg'),
  four: require('../../assets/demo/songartworkfour.jpeg'),
  five: require('../../assets/demo/songartfive.jpg'),
  six: require('../../assets/demo/songarteight.png'),
  nine: require('../../assets/demo/albumartnine.jpg'),
  ten: require('../../assets/demo/albumartten.jpeg'),
  eleven: require('../../assets/demo/rapperphotoOne.jpg'),
};

// ─── Pure formatters ───
const formatDuration = (ms?: number | null) => {
  if (!ms) return '';
  const totalSec = Math.floor(ms / 1000);
  return `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, '0')}`;
};

const formatTimeAgo = (dateString?: string | null) => {
  if (!dateString) return '';
  const diffSeconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  const m = Math.floor(diffSeconds / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  const w = Math.floor(d / 7);
  const mo = Math.floor(d / 30);
  const y = Math.floor(d / 365);
  const s = (n: number) => (n !== 1 ? 's' : '');
  if (diffSeconds < 60) return 'just now';
  if (m < 60) return `${m} minute${s(m)} ago`;
  if (h < 24) return `${h} hour${s(h)} ago`;
  if (d < 7) return `${d} day${s(d)} ago`;
  if (w < 4) return `${w} week${s(w)} ago`;
  if (mo < 12) return `${mo} month${s(mo)} ago`;
  return `${y} year${s(y)} ago`;
};

const formatPlayCount = (count: any) => {
  const value = Number(count) || 0;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`;
  return `${value}`;
};

const formatAwardDate = (dateString?: string) => {
  if (!dateString) return '';
  return new Date(`${dateString}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
};

const isWithinDays = (dateString: string | null | undefined, days: number) => {
  if (!dateString) return false;
  const diff = Date.now() - new Date(dateString).getTime();
  return diff >= 0 && diff <= days * 86400000;
};

// Awards are per jurisdiction PER GENRE, so one week yields one row per genre.
// Collapse to one row per award_date, keeping the highest totalPoints.
const bestPerAwardDate = (awards: any[]) => {
  const byDate = new Map<string, any>();
  const weight = (x: any) => x?.totalPoints ?? x?.weightedPoints ?? x?.votesCount ?? 0;
  awards.forEach((a) => {
    const key = a?.awardDate;
    if (!key) return;
    const held = byDate.get(key);
    if (!held || weight(a) > weight(held)) byDate.set(key, a);
  });
  return Array.from(byDate.values()).sort((a, b) => (a.awardDate < b.awardDate ? 1 : -1));
};

const pickPhoto = (obj: any): string | null => {
  if (!obj) return null;
  const c = obj.photoUrl || obj.imageUrl || obj.profilePhotoUrl || obj.avatarUrl || obj.pictureUrl || obj.photo || obj.profilePhoto || obj.avatar || obj.picture;
  return c ? buildUrl(c) : null;
};

const toApiDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const todayInEst = () => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
  } catch {
    return toApiDate(new Date());
  }
};

const artSource = (v: any) => (v == null ? randomRapper : typeof v === 'number' ? v : { uri: v });

// ─── Icons ───
const CardPlayIcon: React.FC = () => (
  <Svg viewBox="0 0 24 24" width={18} height={18} style={{ marginLeft: 2 }}>
    <Polygon points="5,3 19,12 5,21" fill="#ffffff" />
  </Svg>
);

const LensIcon: React.FC<{ type: string; color: string }> = ({ type, color }) => {
  const p = { stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24">
      {type === 'all' && (
        <>
          <Rect x={3} y={3} width={7} height={7} rx={1} {...p} />
          <Rect x={14} y={3} width={7} height={7} rx={1} {...p} />
          <Rect x={3} y={14} width={7} height={7} rx={1} {...p} />
          <Rect x={14} y={14} width={7} height={7} rx={1} {...p} />
        </>
      )}
      {type === 'charts' && (
        <>
          <Path d="M8 21h8" {...p} />
          <Path d="M12 17v4" {...p} />
          <Path d="M7 4h10v6a5 5 0 0 1-10 0V4z" {...p} />
          <Path d="M7 6H4a1 1 0 0 0-1 1c0 2 1.5 3.5 4 4" {...p} />
          <Path d="M17 6h3a1 1 0 0 1 1 1c0 2-1.5 3.5-4 4" {...p} />
        </>
      )}
      {type === 'playlists' && (
        <>
          <Path d="M3 6h13" {...p} />
          <Path d="M3 12h13" {...p} />
          <Path d="M3 18h8" {...p} />
          <Circle cx={18} cy={17} r={3} {...p} />
          <Path d="M21 17V9" {...p} />
        </>
      )}
      {type === 'fresh' && (
        <>
          <Path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" {...p} />
          <Path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" {...p} />
        </>
      )}
    </Svg>
  );
};

// ─── Playlist cover (image or mosaic fallback) ───
const PlaylistCover: React.FC<{ playlist: any; style: any }> = ({ playlist, style }) => {
  const cover = playlist.coverImageUrl ? buildUrl(playlist.coverImageUrl) : null;
  const mosaic = (playlist.firstFourArtworks || []).filter(Boolean).slice(0, 4);
  if (cover) return <View style={style}><Image source={{ uri: cover }} defaultSource={randomRapper} style={StyleSheet.absoluteFill} /></View>;
  if (mosaic.length) {
    return (
      <View style={[style, { flexDirection: 'row', flexWrap: 'wrap' }]}>
        {mosaic.map((art: string, i: number) => (
          <Image key={i} source={{ uri: buildUrl(art) || undefined }} defaultSource={randomRapper} style={mosaic.length >= 4 ? { width: '50%', height: '50%' } : StyleSheet.absoluteFill} />
        ))}
      </View>
    );
  }
  return <View style={style}><Image source={randomRapper} style={StyleSheet.absoluteFill} /></View>;
};

// ─── Song card (Trending / New releases rows) ───
const SongCard: React.FC<{ item: any; onNav: (id: string, type?: string) => void; onArtistNav: (id: string) => void; onPlay: (item: any) => void }> = React.memo(({ item, onNav, onArtistNav, onPlay }) => (
  <Pressable style={({ pressed }) => [cardStyles.card, pressed && { opacity: 0.85 }]} onPress={() => onNav(item.id, item.type)}>
    <View style={cardStyles.art}>
      <Image source={artSource(item.artworkUrl || item.artwork)} defaultSource={randomRapper} style={StyleSheet.absoluteFill} />
      {!!item.duration && <Text style={cardStyles.duration}>{formatDuration(item.duration)}</Text>}
      {!!item.explicit && <Text style={cardStyles.explicit}>E</Text>}
      <Pressable style={cardStyles.play} onPress={() => onPlay(item)} accessibilityLabel={`Play ${item.title}`} hitSlop={6}>
        <CardPlayIcon />
      </Pressable>
    </View>
    <Text style={cardStyles.title} numberOfLines={1}>{item.title}</Text>
    <View style={cardStyles.subrow}>
      <Pressable style={{ flexShrink: 1 }} onPress={() => onArtistNav(item.artistData?.userId || 'unknown')} hitSlop={4}>
        <Text style={cardStyles.artist} numberOfLines={1}>{item.artistData?.username || item.artist || 'Unknown'}</Text>
      </Pressable>
      <View style={cardStyles.plays} accessibilityLabel={`${item.playCount || 0} total plays`}>
        <Svg viewBox="0 0 24 24" width={10} height={10}><Path d="M8 5v14l11-7z" fill="rgba(255,255,255,0.5)" /></Svg>
        <Text style={cardStyles.playsText}>{formatPlayCount(item.playCount)}</Text>
      </View>
    </View>
    {!!item.createdAt && <Text style={cardStyles.meta}>{formatTimeAgo(item.createdAt)}</Text>}
  </Pressable>
));

// ─── Ghost jurisdiction dropdown ───
const ACTIVE_JURISDICTIONS = [
  { id: '1cf6ceb1-aae6-4113-98c0-d9fe8ad8b5e3', name: 'Harlem' },
  { id: '52740de0-e4e9-4c9e-b68e-1e170f6788c4', name: 'Uptown Harlem' },
  { id: '4b09eaa2-03bc-4778-b7c2-db8b42c9e732', name: 'Downtown Harlem' },
];
const DEFAULT_JURISDICTION_ID = '1cf6ceb1-aae6-4113-98c0-d9fe8ad8b5e3';

const JurisdictionSelect: React.FC<{ value: string; label: string; onChange: (id: string) => void; t: UnisTheme }> = ({ value, label, onChange, t }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable style={styles.ghost} onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`Jurisdiction: ${label}. Change`}>
        <Text style={styles.ghostLabel}>{label}</Text>
        <Text style={[styles.ghostArrow, { color: t.textAccent }]}>▾</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.pickerBackdrop} onPress={() => setOpen(false)}>
          <View style={[styles.pickerCard, { borderColor: t.border }]}>
            {ACTIVE_JURISDICTIONS.map((j) => {
              const on = j.id === value;
              return (
                <Pressable
                  key={j.id}
                  style={[styles.pickerRow, on && { backgroundColor: t.soft }]}
                  onPress={() => { onChange(j.id); setOpen(false); }}
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.pickerText, on && { color: '#fff', fontWeight: '800' }]}>{j.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </>
  );
};

// ─── Chart row (Top 5 artists / This week's chart) ───
const ChartRow: React.FC<{
  entry: BoardEntry;
  artist: boolean;
  t: UnisTheme;
  onSong: (id: string, type?: string) => void;
  onArtist: (id: string) => void;
  onPlay: (e: BoardEntry) => void;
}> = ({ entry, artist, t, onSong, onArtist, onPlay }) => (
  <Pressable
    style={({ pressed }) => [styles.chartRow, entry.rank === 1 && { borderColor: t.border, backgroundColor: t.subtle }, pressed && { opacity: 0.8 }]}
    onPress={() => (artist ? onArtist(entry.id) : onSong(entry.id, 'song'))}
  >
    {!!entry.artwork && <Image source={{ uri: entry.artwork }} style={styles.chartAmbient} blurRadius={30} />}
    <Text style={[styles.chartRank, entry.rank === 1 && { color: t.textAccent }]}>{entry.rank}</Text>
    <Image source={artSource(entry.artwork)} defaultSource={randomRapper} style={[styles.chartArt, artist && { borderRadius: 24 }]} />
    <View style={{ flex: 1 }}>
      <Text style={styles.chartTitle} numberOfLines={1}>{entry.name}</Text>
      {artist ? (
        <Text style={styles.chartSub} numberOfLines={1}>
          {formatCount(entry.points)} pts{entry.votes > 0 ? ` · ${formatCount(entry.votes)} vote${entry.votes === 1 ? '' : 's'}` : ''}
        </Text>
      ) : (
        <Pressable onPress={() => entry.artistId && onArtist(entry.artistId)} hitSlop={4}>
          <Text style={styles.chartSub} numberOfLines={1}>{entry.artistName} · {formatCount(entry.points)} pts</Text>
        </Pressable>
      )}
    </View>
    <RankMove movement={entry.movement} isNew={entry.isNew} />
    <Pressable style={[styles.roundPlay, { backgroundColor: t.primary }]} onPress={() => onPlay(entry)} accessibilityLabel={`Play ${entry.name}`} hitSlop={6}>
      <CardPlayIcon />
    </Pressable>
  </Pressable>
);

const LENSES = [
  { key: 'all', label: 'All' },
  { key: 'charts', label: 'Charts' },
  { key: 'playlists', label: 'Playlists' },
  { key: 'fresh', label: 'Fresh' },
] as const;
type LensKey = (typeof LENSES)[number]['key'];

// ─── Dummies (fallback content when the feed can't load) ───
const getDummyTrending = () => [
  { id: 'dummy1', title: 'Tony Fadd - Paranoid', artistData: { userId: '1', username: 'Tony Fadd' }, artworkUrl: DEMO_ART.one, type: 'song', score: 100, createdAt: new Date(Date.now() - 2 * 86400000).toISOString(), duration: 180000, explicit: false, playsToday: 45, demo: true },
  { id: 'dummy2', title: 'SD Boomin - Waited All Night', artistData: { userId: '2', username: 'SD Boomin' }, artworkUrl: DEMO_ART.two, type: 'song', score: 80, createdAt: new Date(Date.now() - 5 * 86400000).toISOString(), duration: 210000, explicit: true, playsToday: 32, demo: true },
  { id: 'dummy3', title: 'Bad Video', artistData: { userId: '3', username: 'some guy' }, artworkUrl: DEMO_ART.three, type: 'video', score: 60, createdAt: new Date(Date.now() - 30 * 86400000).toISOString(), duration: 120000, explicit: false, playsToday: 18, demo: true },
  { id: 'dummy4', title: 'Song 4', artistData: { userId: '4', username: 'Artist 4' }, artworkUrl: DEMO_ART.four, type: 'song', score: 50, createdAt: new Date(Date.now() - 90 * 86400000).toISOString(), duration: 195000, explicit: true, playsToday: 12, demo: true },
  { id: 'dummy5', title: 'Song 5', artistData: { userId: '5', username: 'Artist 5' }, artworkUrl: DEMO_ART.five, type: 'song', score: 40, createdAt: new Date(Date.now() - 365 * 86400000).toISOString(), duration: 240000, explicit: false, playsToday: 8, demo: true },
];

const getDummyNew = () => [
  { id: 'dummy6', title: 'The Outside', artistData: { userId: '6', username: 'Artist Six' }, artworkUrl: DEMO_ART.six, type: 'song', score: 30, createdAt: new Date(Date.now() - 3600000).toISOString(), duration: 155000, explicit: false, demo: true },
  { id: 'dummy7', title: 'Original Man', artistData: { userId: '7', username: 'Artist Seven' }, artworkUrl: DEMO_ART.nine, type: 'song', score: 25, createdAt: new Date(Date.now() - 12 * 3600000).toISOString(), duration: 205000, explicit: true, demo: true },
  { id: 'dummy8', title: 'flavorfall', artistData: { userId: '8', username: 'Artist Eight' }, artworkUrl: DEMO_ART.ten, type: 'song', score: 20, createdAt: new Date(Date.now() - 7 * 86400000).toISOString(), duration: 175000, explicit: false, demo: true },
  { id: 'dummy9', title: 'Golden Son', artistData: { userId: '9', username: 'Artist Nine' }, artworkUrl: DEMO_ART.eleven, type: 'song', score: 15, createdAt: new Date(Date.now() - 14 * 86400000).toISOString(), duration: 188000, explicit: false, demo: true },
  { id: 'dummy10', title: 'New Track', artistData: { userId: '10', username: 'Artist Ten' }, artworkUrl: DEMO_ART.one, type: 'song', score: 10, createdAt: new Date().toISOString(), duration: 220000, explicit: true, demo: true },
];

// ═════════════════════════════════════════════════════════════
const FeedScreen: React.FC = () => {
  const t = useUnisTheme();
  const navigation = useNavigation<any>();
  const { requestPlay } = usePlayer();
  const { user, isGuest } = useAuth() as any;
  const { displayedScore } = useReward();
  const feedback = useFeedback();

  const [trendingToday, setTrendingToday] = useState<any[]>([]);
  const [newMedia, setNewMedia] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [error, setError] = useState('');
  const [activeLens, setActiveLens] = useState<LensKey>('all');

  const [weeklyWinners, setWeeklyWinners] = useState<any[]>([]);
  const [artistOfWeek, setArtistOfWeek] = useState<ArtistOfWeek | null>(null);
  const lastWinner = weeklyWinners.length ? weeklyWinners[0] : null;

  const [chart, setChart] = useState<Board | null>(null);
  const [chartLoading, setChartLoading] = useState(false);
  const [topFive, setTopFive] = useState<Board | null>(null);

  const [featuredPlaylist, setFeaturedPlaylist] = useState<any>(null);
  const [communityPlaylists, setCommunityPlaylists] = useState<any[]>([]);
  const [playlistsLoading, setPlaylistsLoading] = useState(false);
  const [upcoming, setUpcoming] = useState<any[]>([]);

  const [dailySongBoard, setDailySongBoard] = useState<Board | null>(null);
  const [dailyArtistBoard, setDailyArtistBoard] = useState<Board | null>(null);
  const [raceCategory, setRaceCategory] = useState<'song' | 'artist'>('song');
  const [moversPeriod, setMoversPeriod] = useState<'daily' | 'weekly'>('daily');
  const [weeklyMoversBoard, setWeeklyMoversBoard] = useState<Board | null>(null);
  const [voteHistory, setVoteHistory] = useState<any[]>([]);
  const [followingDrops, setFollowingDrops] = useState<any[]>([]);

  const userId = user?.userId;
  const userJurisdictionId = user?.jurisdiction?.jurisdictionId || DEFAULT_JURISDICTION_ID;
  const [selectedJurisdictionId, setSelectedJurisdictionId] = useState(userJurisdictionId);
  useEffect(() => { if (userJurisdictionId) setSelectedJurisdictionId(userJurisdictionId); }, [userJurisdictionId]);
  const selectedJurisdictionName = ACTIVE_JURISDICTIONS.find((j) => j.id === selectedJurisdictionId)?.name || 'Your Area';

  const normalizeMedia = useCallback((items: any[]) => (items || []).map((item) => ({
    id: item.songId || item.videoId,
    title: item.title,
    artist: item.artist?.username || 'Unknown',
    artistData: item.artist || { userId: 'unknown', username: 'Unknown' },
    artworkUrl: buildUrl(item.artworkUrl),
    mediaUrl: buildUrl(item.fileUrl),
    url: buildUrl(item.fileUrl),
    artwork: buildUrl(item.artworkUrl),
    type: item.songId ? 'song' : 'video',
    score: item.score || 0,
    artistId: item.artist?.userId || 'unknown',
    duration: item.duration || null,
    createdAt: item.createdAt || null,
    explicit: item.explicit || false,
    playsToday: item.playsToday || 0,
    playCount: item.playCount || 0,
  })), []);

  // ─── Songs of the Week timeline + Artist of the Week ───
  useEffect(() => {
    if (!selectedJurisdictionId) return;
    const run = async () => {
      const today = new Date();
      today.setDate(today.getDate() - 1);
      const sixtyDaysAgo = new Date(today);
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
      const baseParams = `startDate=${toApiDate(sixtyDaysAgo)}&endDate=${toApiDate(today)}&jurisdictionId=${selectedJurisdictionId}&intervalId=${INTERVAL_IDS.weekly}`;
      const cutoff = todayInEst();
      try {
        const [songAwardsRes, artistAwardsRes] = await Promise.all([
          axiosInstance.get(`/v1/awards/past?type=song&${baseParams}`),
          axiosInstance.get(`/v1/awards/past?type=artist&${baseParams}`),
        ]);
        const songAwards = bestPerAwardDate((songAwardsRes.data || []).filter((a: any) => !a?.awardDate || a.awardDate <= cutoff).filter((a: any) => a?.song));
        setWeeklyWinners(songAwards.slice(0, 4).map((award: any) => ({
          awardId: award.awardId,
          awardDate: award.awardDate,
          songId: award.song.songId || award.targetId,
          title: award.song.title || 'Unknown',
          artworkUrl: buildUrl(award.song.artworkUrl),
          artistName: award.song.artist?.username || 'Unknown',
          artistId: award.song.artist?.userId,
        })));
        const artistAwards = bestPerAwardDate((artistAwardsRes.data || []).filter((a: any) => !a?.awardDate || a.awardDate <= cutoff).filter((a: any) => a?.user));
        if (artistAwards.length) {
          const award = artistAwards[0];
          setArtistOfWeek({
            userId: award.user.userId || award.targetId,
            username: award.user.username || 'Unknown',
            photoUrl: pickPhoto(award.user),
            votesCount: award.votesCount || 0,
            awardDate: award.awardDate,
          });
        } else {
          setArtistOfWeek(null);
        }
      } catch (err) {
        console.error('[Feed] awards fetch failed (timeline + artist of week hidden):', err);
        setWeeklyWinners([]);
        setArtistOfWeek(null);
      }
    };
    run();
  }, [selectedJurisdictionId, refreshTick]);

  // ─── Main feed rows ───
  useEffect(() => {
    if (!selectedJurisdictionId) return;
    const run = async () => {
      if (!refreshing) setLoading(true);
      setError('');
      try {
        const jId = selectedJurisdictionId;
        const [trendingTodayRes, newRes] = await Promise.all([
          axiosInstance.get(`/v1/media/trending/today?jurisdictionId=${jId}&limit=10`),
          axiosInstance.get(`/v1/media/new?jurisdictionId=${jId}&limit=5`),
        ]);
        setTrendingToday(normalizeMedia(trendingTodayRes.data || []));
        setNewMedia(normalizeMedia(newRes.data || []));
      } catch (err) {
        console.error('Media load error:', err);
        setError('Feed unavailable—showing demo content.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedJurisdictionId, normalizeMedia, refreshTick]);

  // ─── Charts lens (lazy, cached per jurisdiction) ───
  const chartFetchedFor = useRef<string | null>(null);
  useEffect(() => {
    if (activeLens !== 'charts' || !selectedJurisdictionId) return;
    const key = `${selectedJurisdictionId}:${refreshTick}`;
    if (chartFetchedFor.current === key) return;
    setChartLoading(true);
    fetchStandings({ type: 'song', jurisdictionId: selectedJurisdictionId, genre: 'all', period: 'weekly', limit: 10 })
      .then((board) => setChart(board))
      .catch((err) => { console.error('[Feed] chart fetch failed (empty state shown):', err); setChart(null); })
      .finally(() => { chartFetchedFor.current = key; setChartLoading(false); });
  }, [activeLens, selectedJurisdictionId, refreshTick]);

  // ─── Top 5 artists this week ───
  useEffect(() => {
    if (!selectedJurisdictionId) return undefined;
    let cancelled = false;
    fetchStandings({ type: 'artist', jurisdictionId: selectedJurisdictionId, genre: 'all', period: 'weekly', limit: 5 })
      .then((board) => { if (!cancelled) setTopFive(board); })
      .catch((err) => { console.error('[Feed] top five fetch failed (section hidden):', err?.message || err); if (!cancelled) setTopFive(null); });
    return () => { cancelled = true; };
  }, [selectedJurisdictionId, refreshTick]);

  // ─── Today's song race ───
  useEffect(() => {
    if (!selectedJurisdictionId) return undefined;
    let cancelled = false;
    setDailySongBoard(null);
    fetchStandings({ type: 'song', jurisdictionId: selectedJurisdictionId, genre: 'all', period: 'daily', limit: 50 })
      .then((board) => { if (!cancelled) setDailySongBoard(board); })
      .catch((err) => {
        console.error('[Feed] daily song race fetch failed (race shows empty):', err?.message || err);
        if (!cancelled) setDailySongBoard({ state: 'LIVE', entries: [], closesAt: null } as any);
      });
    return () => { cancelled = true; };
  }, [selectedJurisdictionId, refreshTick]);

  // ─── Today's artist race (only once flipped to Artists) ───
  useEffect(() => {
    if (raceCategory !== 'artist' || !selectedJurisdictionId) return undefined;
    let cancelled = false;
    setDailyArtistBoard(null);
    fetchStandings({ type: 'artist', jurisdictionId: selectedJurisdictionId, genre: 'all', period: 'daily', limit: 50 })
      .then((board) => { if (!cancelled) setDailyArtistBoard(board); })
      .catch((err) => {
        console.error('[Feed] daily artist race fetch failed (race shows empty):', err?.message || err);
        if (!cancelled) setDailyArtistBoard({ state: 'LIVE', entries: [], closesAt: null } as any);
      });
    return () => { cancelled = true; };
  }, [raceCategory, selectedJurisdictionId, refreshTick]);

  // ─── This week's movers (only once flipped to Week) ───
  useEffect(() => {
    if (moversPeriod !== 'weekly' || !selectedJurisdictionId) return undefined;
    let cancelled = false;
    setWeeklyMoversBoard(null);
    fetchStandings({ type: 'song', jurisdictionId: selectedJurisdictionId, genre: 'all', period: 'weekly', limit: 50 })
      .then((board) => { if (!cancelled) setWeeklyMoversBoard(board); })
      .catch((err) => {
        console.error('[Feed] weekly movers fetch failed (empty state shown):', err?.message || err);
        if (!cancelled) setWeeklyMoversBoard({ state: 'LIVE', entries: [] } as any);
      });
    return () => { cancelled = true; };
  }, [moversPeriod, selectedJurisdictionId, refreshTick]);

  // ─── Your votes (marks "Your vote" + the votes tile) ───
  useEffect(() => {
    if (!userId) { setVoteHistory([]); return undefined; }
    let cancelled = false;
    axiosInstance.get('/v1/vote/history?limit=20')
      .then((res) => { if (!cancelled) setVoteHistory(Array.isArray(res.data) ? res.data : []); })
      .catch((err) => { console.error('[Feed] vote history fetch failed (vote marks hidden):', err?.message || err); if (!cancelled) setVoteHistory([]); });
    return () => { cancelled = true; };
  }, [userId, refreshTick]);

  // ─── New songs from artists you follow ───
  useEffect(() => {
    if (!userId) { setFollowingDrops([]); return undefined; }
    let cancelled = false;
    axiosInstance.get('/v1/media/following/new?days=7&limit=12')
      .then((res) => {
        if (cancelled) return;
        const raw = Array.isArray(res.data) ? res.data : [];
        setFollowingDrops(normalizeMedia(raw).map((song, i) => ({ ...song, artistPhoto: pickPhoto(raw[i]?.artist) })));
      })
      .catch((err) => { console.error('[Feed] following drops fetch failed (row hidden):', err?.message || err); if (!cancelled) setFollowingDrops([]); });
    return () => { cancelled = true; };
  }, [userId, normalizeMedia, refreshTick]);

  // ─── Playlists lens ───
  const playlistsFetchedFor = useRef<string | null>(null);
  useEffect(() => {
    if (activeLens !== 'playlists' || !selectedJurisdictionId) return;
    const key = `${selectedJurisdictionId}:${refreshTick}`;
    if (playlistsFetchedFor.current === key) return;
    const run = async () => {
      setPlaylistsLoading(true);
      try {
        const [officialRes, communityRes] = await Promise.all([
          axiosInstance.get('/v1/playlists/official'),
          axiosInstance.get(`/v1/playlists/community/${selectedJurisdictionId}`),
        ]);
        const official = officialRes.data || [];
        const community = (communityRes.data || []).slice().sort((a: any, b: any) => (b.followerCount || 0) - (a.followerCount || 0));
        setFeaturedPlaylist(official.length ? official[0] : community.length ? community[0] : null);
        setCommunityPlaylists(official.length ? community : community.slice(1));
      } catch (err) {
        console.error('[Feed] playlists fetch failed (empty state shown):', err);
        setFeaturedPlaylist(null);
        setCommunityPlaylists([]);
      } finally {
        playlistsFetchedFor.current = key;
        setPlaylistsLoading(false);
      }
    };
    run();
  }, [activeLens, selectedJurisdictionId, refreshTick]);

  // ─── Fresh lens: upcoming (hidden until scheduling exists on backend) ───
  const upcomingFetchedFor = useRef<string | null>(null);
  useEffect(() => {
    if (activeLens !== 'fresh' || !selectedJurisdictionId) return;
    if (upcomingFetchedFor.current === selectedJurisdictionId) return;
    axiosInstance.get(`/v1/media/upcoming?jurisdictionId=${selectedJurisdictionId}&limit=5`)
      .then((res) => setUpcoming(res.data || []))
      .catch(() => { console.warn('[Feed] /v1/media/upcoming unavailable (Dropping Soon hidden)'); setUpcoming([]); })
      .finally(() => { upcomingFetchedFor.current = selectedJurisdictionId; });
  }, [activeLens, selectedJurisdictionId]);

  // ─── Navigation ───
  const handleSongNav = useCallback((mediaId: string, type = 'song') => {
    if (!mediaId || String(mediaId).startsWith('dummy')) return;
    if (type === 'video') navigation.navigate('Video', { videoId: mediaId });
    else navigation.navigate('Song', { songId: mediaId });
  }, [navigation]);
  const handleArtistNav = useCallback((artistId: string) => {
    if (!artistId || artistId === 'unknown' || /^\d+$/.test(artistId)) return;
    navigation.navigate('Artist', { artistId });
  }, [navigation]);
  const handlePlaylistNav = useCallback((playlistId: string) => navigation.navigate('Playlist', { playlistId }), [navigation]);

  const handlePlayMedia = useCallback(async (media: any) => {
    if (media.demo) {
      feedback.info('This is demo content — the live feed couldn’t load.');
      return;
    }
    let playMediaObj = media;
    if (media.type === 'artist') {
      try {
        const res = await axiosInstance.get(`/v1/users/${media.artistData.userId}/default-song`);
        const url = buildUrl(res.data.fileUrl);
        if (!url) throw new Error('no default song');
        playMediaObj = {
          type: 'song',
          id: res.data.songId,
          songId: res.data.songId,
          url,
          fileUrl: url,
          title: res.data.title || 'Default Track',
          artist: media.artistData?.username || media.artist,
          artistId: media.artistData?.userId,
          artwork: buildUrl(res.data.artworkUrl) || media.artworkUrl,
          artworkUrl: buildUrl(res.data.artworkUrl) || media.artworkUrl,
        };
      } catch (err) {
        console.error('Default song fetch error:', err);
        feedback.info(`${media.artistData?.username || media.artist || 'This artist'} hasn’t picked a song to feature yet`);
        return;
      }
    }
    requestPlay(playMediaObj);
  }, [requestPlay, feedback]);

  const handlePlayChartEntry = useCallback(async (entry: BoardEntry) => {
    const played = await playEntry(entry, requestPlay as any, 'feed');
    if (!played) feedback.info(`${entry?.name || 'This artist'} hasn’t picked a song to feature yet`);
  }, [requestPlay, feedback]);

  const handleVoteClick = useCallback(() => navigation.navigate('Vote'), [navigation]);

  const onRefresh = () => {
    setRefreshing(true);
    setRefreshTick((n) => n + 1);
  };

  const trendingTodayList = trendingToday.length ? trendingToday.slice(0, 10) : getDummyTrending();
  const newMediaList = newMedia.length ? newMedia.slice(0, 5) : getDummyNew();
  // Charts NEVER falls back to demo content — only entries that scored.
  const chartEntries = chart ? chart.entries.filter((e) => e.points > 0) : [];
  const chartStatus = chart ? describeBoard(chart) : null;
  const topFiveEntries = topFive ? topFive.entries.filter((e) => e.points > 0) : [];
  const topFiveStatus = topFive ? describeBoard(topFive) : null;
  const placeKey = JURISDICTION_NAMES[selectedJurisdictionId] || 'harlem';
  const openChart = (type: string, period = 'weekly') => navigation.navigate('Charts', { type, period, genre: 'all', place: placeKey });

  const todayIso = toLocalISO(new Date());
  const todaysVotes = voteHistory.filter((v) =>
    v?.voteDate === todayIso && /^(dai|day)/i.test(v?.interval || 'day') && (!v?.jurisdictionId || v.jurisdictionId === selectedJurisdictionId));
  const isVoteType = (v: any, type: string) => String(v?.targetType || '').toLowerCase() === type;
  const votedSongToday = todaysVotes.some((v) => isVoteType(v, 'song'));
  const votedArtistToday = todaysVotes.some((v) => isVoteType(v, 'artist'));
  const votedTargetIds = new Set<string>(todaysVotes.filter((v) => isVoteType(v, raceCategory)).map((v) => v.targetId));
  const moversBoard = moversPeriod === 'weekly' ? weeklyMoversBoard : dailySongBoard;
  const raceClosesAt = (dailySongBoard?.state || 'LIVE') === 'LIVE' ? dailySongBoard?.closesAt : null;
  const openRaceEntry = (entry: BoardEntry) => (entry.type === 'artist' ? handleArtistNav(entry.id) : handleSongNav(entry.id, 'song'));
  const openStandings = () => openChart(raceCategory, 'daily');

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={t.primary} size="large" />
        <Text style={styles.loadingText}>Loading your feed...</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
      >
        {!!error && <Text style={styles.error}>{error}</Text>}

        <FeedSpotlight
          jurisdictionName={selectedJurisdictionName}
          dailyBoard={dailySongBoard}
          weeklyWinner={lastWinner}
          artistOfWeek={artistOfWeek}
          onVote={handleVoteClick}
          onSongNav={handleSongNav}
          onArtistNav={handleArtistNav}
        />

        {/* Lens bar */}
        <View style={styles.lensBar} accessibilityRole="tablist">
          {LENSES.map((lens) => {
            const on = activeLens === lens.key;
            return (
              <Pressable
                key={lens.key}
                onPress={() => setActiveLens((cur) => (cur === lens.key ? cur : lens.key))}
                style={[styles.lensBtn, on && { backgroundColor: t.primary, borderColor: t.primary }]}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
              >
                <LensIcon type={lens.key} color={on ? '#fff' : 'rgba(255,255,255,0.7)'} />
                <Text style={[styles.lensText, on && { color: '#fff' }]}>{lens.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* ═══════ ALL ═══════ */}
        {activeLens === 'all' && (
          <>
            <View style={styles.section}>
              <View style={styles.titleRow}>
                <Text style={styles.sectionTitle}>Trending Today in </Text>
                <JurisdictionSelect value={selectedJurisdictionId} label={selectedJurisdictionName} onChange={setSelectedJurisdictionId} t={t} />
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardRow}>
                {trendingTodayList.map((item) => (
                  <SongCard key={item.id} item={item} onNav={handleSongNav} onArtistNav={handleArtistNav} onPlay={handlePlayMedia} />
                ))}
              </ScrollView>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>New Releases</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardRow}>
                {newMediaList.map((item) => (
                  <SongCard key={item.id} item={item} onNav={handleSongNav} onArtistNav={handleArtistNav} onPlay={handlePlayMedia} />
                ))}
              </ScrollView>
            </View>

            <AdSlot placement="feed" />

            {weeklyWinners.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Songs of the Week</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingTop: 12, paddingRight: 8 }}>
                  <View style={styles.rail} />
                  {weeklyWinners.map((winner, i) => (
                    <Pressable key={winner.awardId || winner.songId} style={styles.node} onPress={() => handleSongNav(winner.songId, 'song')}>
                      <View style={[styles.nodeThumb, i === 0 && { borderColor: t.primary, borderWidth: 3, shadowColor: t.primary, shadowOpacity: 0.7, shadowRadius: 12 }]}>
                        <Image source={artSource(winner.artworkUrl)} defaultSource={randomRapper} style={StyleSheet.absoluteFill} />
                      </View>
                      <Text style={[styles.nodeDate, i === 0 && { color: t.textAccent }]}>{formatAwardDate(winner.awardDate)}</Text>
                      <Text style={styles.nodeSong} numberOfLines={1}>{winner.title}</Text>
                      <Pressable onPress={() => winner.artistId && handleArtistNav(winner.artistId)} hitSlop={4}>
                        <Text style={styles.nodeArtist} numberOfLines={1}>{winner.artistName}</Text>
                      </Pressable>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            {artistOfWeek && (
              <View style={styles.section}>
                <ArtistOfWeekCard artist={artistOfWeek} place={selectedJurisdictionName} onOpen={() => handleArtistNav(artistOfWeek.userId)} />
              </View>
            )}

            {topFiveEntries.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Top 5 artists in {selectedJurisdictionName}</Text>
                {topFiveStatus && <Text style={styles.caption}>{topFiveStatus.title}</Text>}
                <View style={{ marginTop: 10, gap: 8 }}>
                  {topFiveEntries.map((entry) => <ChartRow key={entry.id} entry={entry} artist t={t} onSong={handleSongNav} onArtist={handleArtistNav} onPlay={handlePlayChartEntry} />)}
                </View>
                <Pressable style={styles.fullChart} onPress={() => openChart('artist')}><Text style={styles.fullChartText}>See the full chart</Text></Pressable>
              </View>
            )}

            <TodayRace
              jurisdictionName={selectedJurisdictionName}
              songBoard={dailySongBoard}
              artistBoard={dailyArtistBoard}
              category={raceCategory}
              onCategoryChange={setRaceCategory}
              votedTargetIds={votedTargetIds}
              onVote={handleVoteClick}
              onOpenEntry={openRaceEntry}
              onOpenStandings={openStandings}
            />
            <DayTiles
              isGuest={isGuest}
              jurisdictionName={selectedJurisdictionName}
              votedSongToday={votedSongToday}
              votedArtistToday={votedArtistToday}
              score={displayedScore ?? user?.score}
              level={user?.level}
              closesAt={raceClosesAt}
            />
            <MoversCard
              jurisdictionName={selectedJurisdictionName}
              board={moversBoard}
              period={moversPeriod}
              onPeriodChange={setMoversPeriod}
              onOpenEntry={openRaceEntry}
              fallbackArt={randomRapper}
            />
            <FollowingDrops drops={followingDrops} onOpen={(song) => handleSongNav(song.id, 'song')} />
          </>
        )}

        {/* ═══════ CHARTS ═══════ */}
        {activeLens === 'charts' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>This Week{'’'}s Chart in {selectedJurisdictionName}</Text>
            {chartStatus && <Text style={styles.caption}>{chartStatus.title}. {chartStatus.detail}</Text>}
            {chartLoading ? (
              <View style={styles.lensLoading}><ActivityIndicator color="#fff" /></View>
            ) : chartEntries.length === 0 ? (
              <Text style={styles.lensEmpty}>
                Nothing has scored yet this week in {selectedJurisdictionName}. Plays, likes and votes put songs on the chart.
              </Text>
            ) : (
              <View style={{ marginTop: 10, gap: 8 }}>
                {chartEntries.map((entry) => <ChartRow key={entry.id} entry={entry} artist={false} t={t} onSong={handleSongNav} onArtist={handleArtistNav} onPlay={handlePlayChartEntry} />)}
              </View>
            )}
            <Pressable style={styles.fullChart} onPress={() => openChart('song')}><Text style={styles.fullChartText}>See the full chart</Text></Pressable>
            {lastWinner && (
              <Pressable style={styles.lastWinner} onPress={() => handleSongNav(lastWinner.songId, 'song')}>
                <Svg viewBox="0 0 24 24" width={18} height={18}>
                  <Path d="M8 21h8M12 17v4M7 4h10v6a5 5 0 0 1-10 0V4z" fill="none" stroke="#eab308" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
                <Text style={styles.lastWinnerText} numberOfLines={2}>
                  Last week{'’'}s winner: <Text style={{ fontWeight: '800', color: '#fff' }}>{lastWinner.title} — {lastWinner.artistName}</Text>
                </Text>
              </Pressable>
            )}
          </View>
        )}

        {/* ═══════ PLAYLISTS ═══════ */}
        {activeLens === 'playlists' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Playlists Rising in {selectedJurisdictionName}</Text>
            {playlistsLoading ? (
              <View style={styles.lensLoading}><ActivityIndicator color="#fff" /></View>
            ) : (
              <>
                {featuredPlaylist && (
                  <Pressable style={[styles.featured, { borderColor: t.border }]} onPress={() => handlePlaylistNav(featuredPlaylist.playlistId)}>
                    <PlaylistCover playlist={featuredPlaylist} style={styles.featuredCover} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.featuredBadge, { color: t.textAccent }]}>
                        {featuredPlaylist.type === 'official' ? 'Curated by Unis' : 'Community Favorite'}
                      </Text>
                      <Text style={styles.featuredName} numberOfLines={2}>{featuredPlaylist.name}</Text>
                      <Text style={styles.featuredMeta}>
                        {featuredPlaylist.songCount || 0} track{(featuredPlaylist.songCount || 0) !== 1 ? 's' : ''}
                        {featuredPlaylist.creatorName ? ` · by ${featuredPlaylist.creatorName}` : ''}
                      </Text>
                    </View>
                  </Pressable>
                )}
                {communityPlaylists.length > 0 ? (
                  <View style={styles.plGrid}>
                    {communityPlaylists.slice(0, 8).map((pl) => (
                      <Pressable key={pl.playlistId} style={styles.plTile} onPress={() => handlePlaylistNav(pl.playlistId)}>
                        <View>
                          <PlaylistCover playlist={pl} style={styles.plCover} />
                          <Text style={styles.plCount}>{pl.songCount || 0} track{(pl.songCount || 0) !== 1 ? 's' : ''}</Text>
                        </View>
                        <Text style={styles.plName} numberOfLines={1}>{pl.name}</Text>
                        <Text style={styles.plMeta} numberOfLines={1}>
                          {pl.creatorName ? `by ${pl.creatorName}` : ''}
                          {pl.followerCount ? ` · ${formatPlayCount(pl.followerCount)} followers` : ''}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  !featuredPlaylist && (
                    <Text style={styles.lensEmpty}>No public playlists in {selectedJurisdictionName} yet. Be the first to make one.</Text>
                  )
                )}
              </>
            )}
          </View>
        )}

        {/* ═══════ FRESH ═══════ */}
        {activeLens === 'fresh' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Dropped Recently</Text>
            <View style={{ marginTop: 10, gap: 8 }}>
              {newMediaList.map((item) => (
                <Pressable key={item.id} style={styles.freshRow} onPress={() => handleSongNav(item.id, item.type)}>
                  <Image source={artSource(item.artworkUrl || item.artwork)} defaultSource={randomRapper} style={styles.freshArt} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.chartTitle} numberOfLines={1}>{item.title}</Text>
                    <Pressable onPress={() => handleArtistNav(item.artistData?.userId || 'unknown')} hitSlop={4}>
                      <Text style={styles.chartSub} numberOfLines={1}>
                        {item.artistData?.username || item.artist || 'Unknown'}{item.createdAt ? ` · ${formatTimeAgo(item.createdAt)}` : ''}
                      </Text>
                    </Pressable>
                  </View>
                  {isWithinDays(item.createdAt, 7) && <Text style={[styles.freshBadge, { backgroundColor: t.primary }]}>NEW</Text>}
                  <Pressable style={[styles.roundPlay, { backgroundColor: t.primary }]} onPress={() => handlePlayMedia(item)} accessibilityLabel={`Play ${item.title}`} hitSlop={6}>
                    <CardPlayIcon />
                  </Pressable>
                </Pressable>
              ))}
            </View>

            {upcoming.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { marginTop: 22 }]}>Dropping Soon</Text>
                <View style={{ marginTop: 10, gap: 8 }}>
                  {upcoming.map((item) => (
                    <View key={item.songId} style={[styles.freshRow, { opacity: 0.85 }]}>
                      <Image source={artSource(buildUrl(item.artworkUrl))} defaultSource={randomRapper} style={styles.freshArt} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.chartTitle} numberOfLines={1}>{item.title}</Text>
                        <Text style={styles.chartSub}>{item.artist?.username || 'Unknown'}</Text>
                      </View>
                      <Text style={styles.freshDate}>
                        {item.scheduledReleaseAt ? new Date(item.scheduledReleaseAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Soon'}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </View>
        )}
      </ScrollView>

      {!isGuest && <LastWonNotification />}
    </View>
  );
};

const cardStyles = StyleSheet.create({
  card: { width: 148 },
  art: { width: 148, height: 148, borderRadius: 14, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.05)' },
  duration: { position: 'absolute', left: 8, bottom: 8, color: '#fff', fontSize: 11, fontWeight: '700', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  explicit: { position: 'absolute', left: 8, top: 8, color: '#0b0b0f', fontSize: 10, fontWeight: '900', backgroundColor: 'rgba(255,255,255,0.85)', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, overflow: 'hidden' },
  play: { position: 'absolute', right: 8, bottom: 8, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' },
  title: { color: '#fff', fontSize: 14, fontWeight: '700', marginTop: 8 },
  subrow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 2 },
  artist: { color: 'rgba(255,255,255,0.6)', fontSize: 12.5 },
  plays: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  playsText: { color: 'rgba(255,255,255,0.5)', fontSize: 11.5, fontWeight: '600' },
  meta: { color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 2 },
});

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 160 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 80 },
  loadingText: { color: 'rgba(255,255,255,0.7)', fontSize: 14 },
  error: { color: '#fbbf24', fontSize: 13, textAlign: 'center', marginBottom: 10 },
  lensBar: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  lensBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.04)' },
  lensText: { color: 'rgba(255,255,255,0.7)', fontWeight: '700', fontSize: 13 },
  section: { marginBottom: 24 },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: 2 },
  sectionTitle: { color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  caption: { color: 'rgba(255,255,255,0.55)', fontSize: 12.5, marginTop: 4 },
  cardRow: { gap: 12, paddingTop: 12, paddingRight: 8 },
  ghost: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  ghostLabel: { color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  ghostArrow: { fontSize: 12 },
  pickerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 40 },
  pickerCard: { borderRadius: 18, backgroundColor: '#11141c', borderWidth: 1, overflow: 'hidden' },
  pickerRow: { paddingHorizontal: 18, paddingVertical: 15 },
  pickerText: { color: 'rgba(255,255,255,0.8)', fontSize: 16, fontWeight: '600' },
  rail: { position: 'absolute', left: 36, right: 36, top: 48, height: 2, backgroundColor: 'rgba(255,255,255,0.12)' },
  node: { width: 112, alignItems: 'center', marginRight: 8 },
  nodeThumb: { width: 72, height: 72, borderRadius: 36, overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)', backgroundColor: '#0b0e16' },
  nodeDate: { color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginTop: 8 },
  nodeSong: { color: '#fff', fontSize: 13.5, fontWeight: '700', marginTop: 2, maxWidth: 108 },
  nodeArtist: { color: 'rgba(255,255,255,0.6)', fontSize: 12, maxWidth: 108 },
  chartRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' },
  chartAmbient: { ...StyleSheet.absoluteFillObject, opacity: 0.18 },
  chartRank: { color: 'rgba(255,255,255,0.7)', fontSize: 16, fontWeight: '900', width: 22, textAlign: 'center' },
  chartArt: { width: 48, height: 48, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)' },
  chartTitle: { color: '#fff', fontWeight: '700', fontSize: 14.5 },
  chartSub: { color: 'rgba(255,255,255,0.55)', fontSize: 12.5, marginTop: 2 },
  roundPlay: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  fullChart: { alignSelf: 'center', marginTop: 12, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.07)' },
  fullChartText: { color: '#fff', fontWeight: '700', fontSize: 13.5 },
  lensLoading: { paddingVertical: 40, alignItems: 'center' },
  lensEmpty: { color: 'rgba(255,255,255,0.6)', fontSize: 14, lineHeight: 20, textAlign: 'center', paddingVertical: 30, paddingHorizontal: 10 },
  lastWinner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, padding: 12, borderRadius: 14, backgroundColor: 'rgba(234,179,8,0.08)', borderWidth: 1, borderColor: 'rgba(234,179,8,0.25)' },
  lastWinnerText: { color: 'rgba(255,255,255,0.75)', fontSize: 13, flex: 1 },
  featured: { flexDirection: 'row', gap: 14, alignItems: 'center', padding: 12, borderRadius: 18, borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.04)', marginTop: 12 },
  featuredCover: { width: 110, height: 110, borderRadius: 14, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.06)' },
  featuredBadge: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  featuredName: { color: '#fff', fontSize: 19, fontWeight: '800', marginTop: 4 },
  featuredMeta: { color: 'rgba(255,255,255,0.55)', fontSize: 12.5, marginTop: 4 },
  plGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 14 },
  plTile: { width: '47%', flexGrow: 1, maxWidth: '48.5%' },
  plCover: { width: '100%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.06)' },
  plCount: { position: 'absolute', right: 6, bottom: 6, color: '#fff', fontSize: 11, fontWeight: '700', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  plName: { color: '#fff', fontSize: 14, fontWeight: '700', marginTop: 8 },
  plMeta: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 },
  freshRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.04)' },
  freshArt: { width: 52, height: 52, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)' },
  freshBadge: { color: '#fff', fontSize: 10, fontWeight: '900', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  freshDate: { color: 'rgba(255,255,255,0.7)', fontWeight: '700', fontSize: 12.5 },
});

export default FeedScreen;
