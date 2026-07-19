// src/screens/FeedScreen.tsx
// Full port of web Feed.jsx with hero banner, jurisdiction selector,
// lens bar (All / Charts / Playlists / Fresh), Songs of the Week
// timeline, Artist of the Week, weekly most-played chart, playlists
// view, and fresh view. Header is handled by LayoutWrapper in
// AppNavigator.
//
// IMPORTANT: all sub-components live at module scope. Components
// defined inside the screen function get a new identity on every
// render, forcing React to unmount/remount their subtree on every
// state change (replayed animations, reloaded images). That bug was
// fixed on web — do not reintroduce it here.

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  Image,
  ActivityIndicator,
  StyleSheet,
  Dimensions,
  RefreshControl,
  ImageBackground,
  Animated,
  Easing,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { Picker } from '@react-native-picker/picker';
import { useAuth } from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';
import axiosInstance, { getMediaUrl } from '../services/axiosInstance';
import MediaCard, { MediaItem } from '../components/MediaCard';
import ArtistCard, { ArtistItem } from '../components/ArtistCard';
import { INTERVAL_IDS } from '../utils/IdMappings';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IS_MOBILE = SCREEN_WIDTH < 480;

// ─── Active jurisdictions (matches web + backend) ───
const ACTIVE_JURISDICTIONS = [
  { id: '1cf6ceb1-aae6-4113-98c0-d9fe8ad8b5e3', name: 'Harlem' },
  { id: '52740de0-e4e9-4c9e-b68e-1e170f6788c4', name: 'Uptown Harlem' },
  { id: '4b09eaa2-03bc-4778-b7c2-db8b42c9e732', name: 'Downtown Harlem' },
];

// ─── Theme hex map — mirrors ThemePicker / web --unis-primary ───
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

// Lighter companion tone for text-on-dark accents (mirrors --unis-primary-2)
const lightenHex = (hex: string, amt: number = 60): string => {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, (num >> 16) + amt);
  const g = Math.min(255, ((num >> 8) & 0xff) + amt);
  const b = Math.min(255, (num & 0xff) + amt);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
};

// ─── Feed lenses ───
type LensKey = 'all' | 'charts' | 'playlists' | 'fresh';

const LENSES: { key: LensKey; label: string; icon: string }[] = [
  { key: 'all', label: 'All', icon: '▦' },
  { key: 'charts', label: 'Charts', icon: '🏆' },
  { key: 'playlists', label: 'Playlists', icon: '♫' },
  { key: 'fresh', label: 'Fresh', icon: '✦' },
];

// ─── Chart entry shape (matches ChartsDto on the backend) ───
interface ChartEntry {
  rank: number;
  movement: number | null;
  plays: number;
  songId: string;
  title: string;
  artworkUrl?: string;
  fileUrl?: string;
  duration?: number;
  explicit?: boolean;
  artistId?: string;
  artistName?: string;
}

interface ChartData {
  totalPlaysThisWeek: number;
  entries: ChartEntry[];
  isDemo?: boolean;
}

interface WeeklyWinner {
  awardId?: string;
  awardDate?: string;
  songId: string;
  title: string;
  artworkUrl?: string;
  artistName: string;
  artistId?: string;
}

interface ArtistOfWeek {
  userId: string;
  username: string;
  photoUrl?: string;
  votesCount: number;
}

interface PlaylistSummary {
  playlistId: string;
  name: string;
  type?: string;
  songCount?: number;
  followerCount?: number;
  coverImageUrl?: string;
  creatorName?: string;
  creatorId?: string;
  firstFourArtworks?: string[];
}

// ─── Pure formatters (module scope) ───
const formatPlayCount = (count?: number): string => {
  const value = Number(count) || 0;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`;
  return `${value}`;
};

const formatTimeAgo = (dateString?: string | null): string => {
  if (!dateString) return '';
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return `${diffWeeks}w ago`;
};

const formatAwardDate = (dateString?: string): string => {
  if (!dateString) return '';
  const d = new Date(`${dateString}T12:00:00`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
};

const isWithinDays = (dateString: string | null | undefined, days: number): boolean => {
  if (!dateString) return false;
  const diff = Date.now() - new Date(dateString).getTime();
  return diff >= 0 && diff <= days * 24 * 60 * 60 * 1000;
};

const toApiDate = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const todayInEst = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());

const pickPhoto = (obj: any): string | undefined => {
  if (!obj) return undefined;
  const candidate =
    obj.photoUrl || obj.imageUrl || obj.profilePhotoUrl || obj.avatarUrl ||
    obj.pictureUrl || obj.photo || obj.profilePhoto || obj.avatar || obj.picture;
  return candidate ? getMediaUrl(candidate) : undefined;
};

// ─────────────────────────────────────────────
// ANIMATED SECTION — slides in from left like web
// ─────────────────────────────────────────────
const AnimatedSection: React.FC<{
  children: React.ReactNode;
  delay: number;
}> = ({ children, delay }) => {
  const slideX = useRef(new Animated.Value(-50)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;

  useFocusEffect(
    useCallback(() => {
      slideX.setValue(-50);
      fadeIn.setValue(0);

      const timer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(slideX, {
            toValue: 0,
            duration: 600,
            delay,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(fadeIn, {
            toValue: 1,
            duration: 600,
            delay,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]).start();
      }, 50);

      return () => clearTimeout(timer);
    }, [])
  );

  return (
    <Animated.View
      style={{
        opacity: fadeIn,
        transform: [{ translateX: slideX }],
      }}
    >
      {children}
    </Animated.View>
  );
};

// ─────────────────────────────────────────────
// HERO PARTICLES — floating circles like web
// ─────────────────────────────────────────────
const HeroParticles: React.FC = () => {
  const float1 = useRef(new Animated.Value(0)).current;
  const float2 = useRef(new Animated.Value(0)).current;
  const float3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const createFloat = (anim: Animated.Value, duration: number) => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: -12,
            duration: duration / 2,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: duration / 2,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      ).start();
    };
    createFloat(float1, 6000);
    createFloat(float2, 8000);
    createFloat(float3, 5000);
  }, []);

  return (
    <View style={particleStyles.container}>
      <Animated.View
        style={[
          particleStyles.particle,
          particleStyles.p1,
          { transform: [{ translateY: float1 }] },
        ]}
      />
      <Animated.View
        style={[
          particleStyles.particle,
          particleStyles.p2,
          { transform: [{ translateY: float2 }] },
        ]}
      />
      <Animated.View
        style={[
          particleStyles.particle,
          particleStyles.p3,
          { transform: [{ translateY: float3 }] },
        ]}
      />
    </View>
  );
};

const particleStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 30,
    top: 0,
    bottom: 0,
    width: 150,
  },
  particle: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.4,
  },
  p1: {
    width: 60,
    height: 60,
    backgroundColor: 'rgba(78, 168, 245, 0.25)',
    top: 20,
    right: 30,
  },
  p2: {
    width: 90,
    height: 90,
    backgroundColor: 'rgba(124, 94, 245, 0.15)',
    top: 40,
    right: 70,
  },
  p3: {
    width: 45,
    height: 45,
    backgroundColor: 'rgba(78, 168, 245, 0.2)',
    top: 70,
    right: 5,
  },
});

// ─────────────────────────────────────────────
// LENS BAR — rectangular YouTube-chip buttons, theme colored
// ─────────────────────────────────────────────
const LensBar: React.FC<{
  activeLens: LensKey;
  onSelect: (key: LensKey) => void;
  primary: string;
}> = ({ activeLens, onSelect, primary }) => (
  <ScrollView
    horizontal
    showsHorizontalScrollIndicator={false}
    style={lensStyles.bar}
    contentContainerStyle={lensStyles.barContent}
  >
    {LENSES.map((lens) => {
      const active = activeLens === lens.key;
      return (
        <TouchableOpacity
          key={lens.key}
          activeOpacity={0.8}
          onPress={() => onSelect(lens.key)}
          style={[
            lensStyles.button,
            active && { backgroundColor: primary, borderColor: 'rgba(255,255,255,0.22)' },
          ]}
          accessibilityRole="tab"
          accessibilityState={{ selected: active }}
        >
          <Text style={[lensStyles.icon, active && lensStyles.iconActive]}>{lens.icon}</Text>
          <Text style={[lensStyles.label, active && lensStyles.labelActive]}>{lens.label}</Text>
        </TouchableOpacity>
      );
    })}
  </ScrollView>
);

const lensStyles = StyleSheet.create({
  bar: {
    marginBottom: 28,
    flexGrow: 0,
  },
  barContent: {
    gap: 8,
    paddingRight: 16,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  icon: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
  },
  iconActive: {
    color: '#FFFFFF',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 0.1,
  },
  labelActive: {
    color: '#FFFFFF',
  },
});

// ─────────────────────────────────────────────
// MOVEMENT BADGE — chart rank movement
// ─────────────────────────────────────────────
const MovementBadge: React.FC<{ movement: number | null | undefined; primaryLight: string }> = ({
  movement,
  primaryLight,
}) => {
  if (movement === null || movement === undefined) {
    return (
      <View style={[chartStyles.newBadge, { borderColor: primaryLight }]}>
        <Text style={[chartStyles.newBadgeText, { color: primaryLight }]}>NEW</Text>
      </View>
    );
  }
  if (movement > 0) {
    return <Text style={[chartStyles.movement, chartStyles.movementUp]}>▲ {movement}</Text>;
  }
  if (movement < 0) {
    return <Text style={[chartStyles.movement, chartStyles.movementDown]}>▼ {Math.abs(movement)}</Text>;
  }
  return <Text style={[chartStyles.movement, chartStyles.movementFlat]}>—</Text>;
};

// ─────────────────────────────────────────────
// PLAYLIST COVER — image or 2x2 mosaic fallback
// ─────────────────────────────────────────────
const PlaylistCover: React.FC<{ playlist: PlaylistSummary; size: number; radius?: number }> = ({
  playlist,
  size,
  radius = 10,
}) => {
  const cover = playlist.coverImageUrl ? getMediaUrl(playlist.coverImageUrl) : undefined;
  const mosaic = (playlist.firstFourArtworks || []).filter(Boolean).slice(0, 4);

  if (cover) {
    return (
      <Image
        source={{ uri: cover }}
        style={{ width: size, height: size, borderRadius: radius, backgroundColor: '#18181c' }}
      />
    );
  }
  if (mosaic.length) {
    const half = size / 2;
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          overflow: 'hidden',
          flexDirection: 'row',
          flexWrap: 'wrap',
          backgroundColor: '#18181c',
        }}
      >
        {[0, 1, 2, 3].map((i) => (
          <Image
            key={i}
            source={mosaic[i] ? { uri: getMediaUrl(mosaic[i]) } : undefined}
            style={{ width: half, height: half, backgroundColor: '#18181c' }}
          />
        ))}
      </View>
    );
  }
  return (
    <Image
      source={require('../../assets/randomrapper.jpeg')}
      style={{ width: size, height: size, borderRadius: radius }}
    />
  );
};

// ─────────────────────────────────────────────
// GHOST JURISDICTION SELECTOR (inline in title)
// ─────────────────────────────────────────────
const JurisdictionSelect: React.FC<{
  selectedId: string;
  onChange: (id: string) => void;
}> = ({ selectedId, onChange }) => {
  const selectedName = ACTIVE_JURISDICTIONS.find(j => j.id === selectedId)?.name || 'Harlem';
  const [showPicker, setShowPicker] = useState(false);

  if (Platform.OS === 'ios') {
    return (
      <>
        <TouchableOpacity
          style={ghostStyles.wrapper}
          onPress={() => setShowPicker(!showPicker)}
          activeOpacity={0.7}
        >
          <Text style={ghostStyles.label}>{selectedName}</Text>
          <Text style={ghostStyles.arrow}>▾</Text>
        </TouchableOpacity>
        {showPicker && (
          <View style={ghostStyles.pickerContainer}>
            <Picker
              selectedValue={selectedId}
              onValueChange={(val) => {
                onChange(val);
                setShowPicker(false);
              }}
              style={ghostStyles.picker}
              itemStyle={ghostStyles.pickerItem}
            >
              {ACTIVE_JURISDICTIONS.map((j) => (
                <Picker.Item key={j.id} label={j.name} value={j.id} />
              ))}
            </Picker>
          </View>
        )}
      </>
    );
  }

  // Android — native picker inline
  return (
    <View style={ghostStyles.androidWrapper}>
      <Picker
        selectedValue={selectedId}
        onValueChange={onChange}
        style={ghostStyles.androidPicker}
        dropdownIconColor="#4ea8f5"
        mode="dropdown"
      >
        {ACTIVE_JURISDICTIONS.map((j) => (
          <Picker.Item
            key={j.id}
            label={j.name}
            value={j.id}
            style={ghostStyles.androidItem}
          />
        ))}
      </Picker>
    </View>
  );
};

const ghostStyles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  label: {
    color: '#FFFFFF',
    fontSize: IS_MOBILE ? 18 : 22,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  arrow: {
    color: '#4ea8f5',
    fontSize: 12,
    marginLeft: 4,
    opacity: 0.5,
  },
  pickerContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    marginTop: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  picker: {
    color: '#fff',
    backgroundColor: '#1a1a1a',
  },
  pickerItem: {
    color: '#fff',
    fontSize: 16,
  },
  androidWrapper: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 6,
    overflow: 'hidden',
    minWidth: 140,
    height: 36,
    justifyContent: 'center',
  },
  androidPicker: {
    color: '#FFFFFF',
    fontSize: 16,
    marginTop: -8,
    marginBottom: -8,
  },
  androidItem: {
    backgroundColor: '#1a1a1a',
    color: '#FFFFFF',
    fontSize: 14,
  },
});

// ─────────────────────────────────────────────
// FOOTER
// ─────────────────────────────────────────────
const FeedFooter: React.FC = () => (
  <View style={footerStyles.container}>
    <View style={footerStyles.divider} />
    <Text style={footerStyles.copyright}>
      © {new Date().getFullYear()} Unis Music. All rights reserved.
    </Text>
  </View>
);

const footerStyles = StyleSheet.create({
  container: { alignItems: 'center', paddingTop: 20, paddingBottom: 10, marginTop: 10 },
  divider: { width: '40%', height: 1, backgroundColor: 'rgba(192,192,192,0.15)', marginBottom: 16 },
  copyright: { color: 'rgba(192,192,192,0.25)', fontSize: 10, letterSpacing: 0.5 },
});

// ─────────────────────────────────────────────
// DUMMY DATA
// ─────────────────────────────────────────────
const getDummyTrending = (): MediaItem[] => [
  { id: 'd1', title: 'Paranoid', artistData: { userId: '1', username: 'Tony Fadd' }, artworkUrl: 'https://picsum.photos/200?random=1', type: 'song', duration: 180000, explicit: false, createdAt: new Date(Date.now() - 2 * 86400000).toISOString() },
  { id: 'd2', title: 'Waited All Night', artistData: { userId: '2', username: 'SD Boomin' }, artworkUrl: 'https://picsum.photos/200?random=2', type: 'song', duration: 210000, explicit: true, createdAt: new Date(Date.now() - 5 * 86400000).toISOString() },
  { id: 'd3', title: 'Golden Hour', artistData: { userId: '3', username: 'Artist Three' }, artworkUrl: 'https://picsum.photos/200?random=3', type: 'song', duration: 195000, explicit: false, createdAt: new Date(Date.now() - 86400000).toISOString() },
  { id: 'd4', title: 'Midnight Dreams', artistData: { userId: '4', username: 'Artist Four' }, artworkUrl: 'https://picsum.photos/200?random=4', type: 'song', duration: 240000, explicit: true, createdAt: new Date(Date.now() - 3 * 86400000).toISOString() },
  { id: 'd5', title: 'Street Lights', artistData: { userId: '5', username: 'Artist Five' }, artworkUrl: 'https://picsum.photos/200?random=5', type: 'song', duration: 175000, explicit: false, createdAt: new Date(Date.now() - 7 * 86400000).toISOString() },
];

const getDummyNew = (): MediaItem[] => [
  { id: 'd6', title: 'The Outside', artistData: { userId: '6', username: 'Artist Six' }, artworkUrl: 'https://picsum.photos/200?random=6', type: 'song', duration: 155000, explicit: false, createdAt: new Date(Date.now() - 3600000).toISOString() },
  { id: 'd7', title: 'Original Man', artistData: { userId: '7', username: 'Artist Seven' }, artworkUrl: 'https://picsum.photos/200?random=7', type: 'song', duration: 205000, explicit: true, createdAt: new Date(Date.now() - 43200000).toISOString() },
  { id: 'd8', title: 'Flavorfall', artistData: { userId: '8', username: 'Artist Eight' }, artworkUrl: 'https://picsum.photos/200?random=8', type: 'song', duration: 175000, explicit: false, createdAt: new Date(Date.now() - 2 * 86400000).toISOString() },
];

const getDummyArtists = (): ArtistItem[] => [
  { userId: 'art1', username: 'Tony Fadd', photoUrl: 'https://picsum.photos/400/300?random=a1', score: 100 },
  { userId: 'art2', username: 'SD Boomin', photoUrl: 'https://picsum.photos/400/300?random=a2', score: 80 },
  { userId: 'art3', username: 'Artist Three', photoUrl: 'https://picsum.photos/400/300?random=a3', score: 60 },
];

const getDummyChart = (): ChartData => ({
  totalPlaysThisWeek: 0,
  entries: getDummyTrending().map((d, i) => ({
    rank: i + 1,
    movement: i === 0 ? 2 : i === 1 ? -1 : i === 2 ? 0 : null,
    plays: [124, 88, 76, 61, 44][i],
    songId: d.id,
    title: d.title,
    artworkUrl: d.artworkUrl,
    fileUrl: d.mediaUrl,
    artistId: d.artistData?.userId,
    artistName: d.artistData?.username,
  })),
  isDemo: true,
});

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────
const FeedScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { user, theme } = useAuth();
  const { playMedia } = usePlayer();
  const navigation = useNavigation<any>();

  const primary = getThemeHex(theme);
  const primaryLight = lightenHex(primary);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  // ─── Lens state ───
  const [activeLens, setActiveLens] = useState<LensKey>('all');

  // Jurisdiction selector
  const userJurisdictionId = user?.jurisdiction?.jurisdictionId || '1cf6ceb1-aae6-4113-98c0-d9fe8ad8b5e3';
  const [selectedJurisdictionId, setSelectedJurisdictionId] = useState(userJurisdictionId);
  const selectedJurisdictionName = ACTIVE_JURISDICTIONS.find(j => j.id === selectedJurisdictionId)?.name || 'Harlem';

  useEffect(() => {
    if (userJurisdictionId) setSelectedJurisdictionId(userJurisdictionId);
  }, [userJurisdictionId]);

  // Data — All lens
  const [trendingToday, setTrendingToday] = useState<MediaItem[]>([]);
  const [topRated, setTopRated] = useState<MediaItem[]>([]);
  const [newMedia, setNewMedia] = useState<MediaItem[]>([]);
  const [popularArtists, setPopularArtists] = useState<ArtistItem[]>([]);

  // Data — awards-derived (timeline + artist of the week + hero winner)
  const [weeklyWinners, setWeeklyWinners] = useState<WeeklyWinner[]>([]);
  const [artistOfWeek, setArtistOfWeek] = useState<ArtistOfWeek | null>(null);
  const lastWinner = weeklyWinners.length ? weeklyWinners[0] : null;

  // Data — Charts lens
  const [chart, setChart] = useState<ChartData | null>(null);
  const [chartLoading, setChartLoading] = useState(false);

  // Data — Playlists lens
  const [featuredPlaylist, setFeaturedPlaylist] = useState<PlaylistSummary | null>(null);
  const [communityPlaylists, setCommunityPlaylists] = useState<PlaylistSummary[]>([]);
  const [playlistsLoading, setPlaylistsLoading] = useState(false);

  // Data — Fresh lens (upcoming hidden until backend scheduling exists)
  const [upcoming, setUpcoming] = useState<any[]>([]);

  // ─── Normalize media (same as web) ───
  const normalizeMedia = useCallback((items: any[]): MediaItem[] => {
    return (items || []).map(item => ({
      id: item.songId || item.videoId,
      title: item.title,
      artist: item.artist?.username || 'Unknown',
      artistData: item.artist || { userId: 'unknown', username: 'Unknown' },
      artworkUrl: getMediaUrl(item.artworkUrl),
      mediaUrl: getMediaUrl(item.fileUrl),
      url: getMediaUrl(item.fileUrl),
      artwork: getMediaUrl(item.artworkUrl),
      type: item.songId ? 'song' : 'video',
      score: item.score || 0,
      artistId: item.artist?.userId || 'unknown',
      duration: item.duration || null,
      createdAt: item.createdAt || null,
      explicit: item.explicit || false,
      playsToday: item.playsToday || 0,
      playCount: item.playCount || 0,
    }));
  }, []);

  // ─── Fetch profile ───
  const fetchProfile = async () => {
    try {
      const token = await SecureStore.getItemAsync('token');
      if (!token) throw new Error('Not authenticated');
      const payload = JSON.parse(atob(token.split('.')[1]));
      setUserId(payload.userId);
    } catch (err) {
      console.error('Profile load error:', err);
      setError('Profile unavailable—using default feed.');
    }
  };

  // ─── Fetch all feed data (same 6 calls as web) ───
  const fetchMediaData = async () => {
    if (!userId || !selectedJurisdictionId) return;

    try {
      const jId = selectedJurisdictionId;

      const [trendingTodayRes, topRatedRes, newRes, popularRes] = await Promise.all([
        axiosInstance.get(`/v1/media/trending/today?jurisdictionId=${jId}&limit=10`),
        axiosInstance.get(`/v1/media/trending?jurisdictionId=${jId}&limit=5`),
        axiosInstance.get(`/v1/media/new?jurisdictionId=${jId}&limit=5`),
        axiosInstance.get(`/v1/users/artist/top?jurisdictionId=${jId}&limit=5`),
      ]);

      setTrendingToday(normalizeMedia(trendingTodayRes.data || []));
      setTopRated(normalizeMedia(topRatedRes.data || []));
      setNewMedia(normalizeMedia(newRes.data || []));

      // Normalize artists with photoUrl
      const normalizedArtists = (popularRes.data || []).map((artist: any) => ({
        ...artist,
        photoUrl: pickPhoto(artist),
      }));
      setPopularArtists(normalizedArtists);

      // Fallback: extract artists from media if API returns none
      if (normalizedArtists.length === 0) {
        const artistMap = new Map<string, ArtistItem>();
        const allMedia = [...(trendingTodayRes.data || []), ...(newRes.data || [])];
        allMedia.forEach((media: any) => {
          if (media.artist && !artistMap.has(media.artist.userId)) {
            artistMap.set(media.artist.userId, {
              userId: media.artist.userId,
              username: media.artist.username,
              photoUrl: getMediaUrl(media.artist.photoUrl) || undefined,
              score: media.artist.score || 0,
            });
          }
        });
        setPopularArtists(
          Array.from(artistMap.values()).sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 5)
        );
      }

      setError('');
    } catch (err) {
      console.error('Media load error:', err);
      setError('Feed unavailable—showing demo content.');
      setTrendingToday(getDummyTrending());
      setNewMedia(getDummyNew());
    }
  };

  // ─── Fetch weekly winners (timeline + hero) + artist of the week ───
  const fetchAwardsData = async () => {
    if (!selectedJurisdictionId) return;

    const today = new Date();
    const sixtyDaysAgo = new Date(today);
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const baseParams = `startDate=${toApiDate(sixtyDaysAgo)}&endDate=${toApiDate(today)}&jurisdictionId=${selectedJurisdictionId}&intervalId=${INTERVAL_IDS['weekly']}`;
    // Same defensive filter web uses — reject future-dated awards that
    // leak through from the UTC-midnight cron.
    const cutoff = todayInEst();

    try {
      const [songAwardsRes, artistAwardsRes] = await Promise.all([
        axiosInstance.get(`/v1/awards/past?type=song&${baseParams}`),
        axiosInstance.get(`/v1/awards/past?type=artist&${baseParams}`),
      ]);

      const songAwards = (songAwardsRes.data || [])
        .filter((a: any) => !a?.awardDate || a.awardDate <= cutoff)
        .filter((a: any) => a?.song);

      setWeeklyWinners(
        songAwards.slice(0, 3).map((award: any) => ({
          awardId: award.awardId,
          awardDate: award.awardDate,
          songId: award.song.songId || award.targetId,
          title: award.song.title || 'Unknown',
          artworkUrl: getMediaUrl(award.song.artworkUrl),
          artistName: award.song.artist?.username || 'Unknown',
          artistId: award.song.artist?.userId,
        }))
      );

      const artistAwards = (artistAwardsRes.data || [])
        .filter((a: any) => !a?.awardDate || a.awardDate <= cutoff)
        .filter((a: any) => a?.user);

      if (artistAwards.length) {
        const award = artistAwards[0];
        setArtistOfWeek({
          userId: award.user.userId || award.targetId,
          username: award.user.username || 'Unknown',
          photoUrl: pickPhoto(award.user),
          votesCount: award.votesCount || 0,
        });
      } else {
        setArtistOfWeek(null);
      }
    } catch (err) {
      setWeeklyWinners([]);
      setArtistOfWeek(null);
    }
  };

  // ─── Lifecycle ───
  useEffect(() => {
    fetchProfile().finally(() => {});
  }, []);

  useEffect(() => {
    if (userId && selectedJurisdictionId) {
      setLoading(true);
      Promise.all([fetchMediaData(), fetchAwardsData()]).finally(() => setLoading(false));
    }
  }, [userId, selectedJurisdictionId]);

  // ─── Fetch weekly most-played chart — lazy, when Charts lens is active ───
  useEffect(() => {
    if (activeLens !== 'charts' || !selectedJurisdictionId) return;

    const fetchChart = async () => {
      setChartLoading(true);
      try {
        const res = await axiosInstance.get(
          `/v1/charts?jurisdictionId=${selectedJurisdictionId}&limit=10`
        );
        setChart(res.data || null);
      } catch (err) {
        // Endpoint not deployed yet — fall back to demo
        setChart(null);
      } finally {
        setChartLoading(false);
      }
    };

    fetchChart();
  }, [activeLens, selectedJurisdictionId, refreshTick]);

  // ─── Fetch playlists — lazy, when Playlists lens is active ───
  useEffect(() => {
    if (activeLens !== 'playlists' || !selectedJurisdictionId) return;

    const fetchPlaylists = async () => {
      setPlaylistsLoading(true);
      try {
        const [officialRes, communityRes] = await Promise.all([
          axiosInstance.get(`/v1/playlists/official`),
          axiosInstance.get(`/v1/playlists/community/${selectedJurisdictionId}`),
        ]);

        const official: PlaylistSummary[] = officialRes.data || [];
        const community: PlaylistSummary[] = (communityRes.data || [])
          .slice()
          .sort((a: PlaylistSummary, b: PlaylistSummary) => (b.followerCount || 0) - (a.followerCount || 0));

        setFeaturedPlaylist(official.length ? official[0] : (community.length ? community[0] : null));
        setCommunityPlaylists(official.length ? community : community.slice(1));
      } catch (err) {
        setFeaturedPlaylist(null);
        setCommunityPlaylists([]);
      } finally {
        setPlaylistsLoading(false);
      }
    };

    fetchPlaylists();
  }, [activeLens, selectedJurisdictionId, refreshTick]);

  // ─── Fetch upcoming releases — lazy, when Fresh lens is active ───
  // Backend endpoint doesn't exist yet; section stays hidden until it does.
  useEffect(() => {
    if (activeLens !== 'fresh' || !selectedJurisdictionId) return;

    const fetchUpcoming = async () => {
      try {
        const res = await axiosInstance.get(
          `/v1/media/upcoming?jurisdictionId=${selectedJurisdictionId}&limit=5`
        );
        setUpcoming(res.data || []);
      } catch (err) {
        setUpcoming([]);
      }
    };

    fetchUpcoming();
  }, [activeLens, selectedJurisdictionId, refreshTick]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchMediaData(), fetchAwardsData()]);
    setRefreshTick((t) => t + 1); // re-fires the active lens fetch
    setRefreshing(false);
  }, [userId, selectedJurisdictionId]);

  // ─── Navigation ───
  const handleSongNav = (mediaId: string, type: string = 'song') => {
    navigation.navigate('Song', { songId: mediaId, type });
  };

  const handleArtistNav = (artistId: string) => {
    navigation.navigate('Artist', { artistId });
  };

  const handlePlaylistNav = () => {
    // No playlist detail screen on mobile yet — drawer route is a placeholder.
    navigation.navigate('Playlists');
  };

  // ─── Play media (same logic as before) ───
  const handlePlayMedia = async (media: MediaItem) => {
    try {
      const endpoint = media.type === 'song'
        ? `/v1/media/song/${media.id}/play?userId=${userId}`
        : `/v1/media/video/${media.id}/play?userId=${userId}`;
      await axiosInstance.post(endpoint);
    } catch (err) {
      console.error('Failed to track play:', err);
    }

    const playlist = [media, ...newMedia.slice(0, 2).filter(m => m.id !== media.id)];
    playMedia(media as any, playlist as any);
  };

  // ─── Play a chart entry (ChartsDto shape → MediaItem shape) ───
  const handlePlayChartEntry = (entry: ChartEntry) => {
    const media: MediaItem = {
      id: entry.songId,
      title: entry.title,
      artist: entry.artistName,
      artistData: { userId: entry.artistId || 'unknown', username: entry.artistName || 'Unknown' },
      artworkUrl: getMediaUrl(entry.artworkUrl),
      artwork: getMediaUrl(entry.artworkUrl),
      mediaUrl: getMediaUrl(entry.fileUrl),
      url: getMediaUrl(entry.fileUrl),
      type: 'song',
      duration: entry.duration,
      explicit: entry.explicit,
    };
    handlePlayMedia(media);
  };

  // ─── Lens switch — no-op when already active ───
  const handleLensSelect = (key: LensKey) => {
    setActiveLens((current) => (current === key ? current : key));
  };

  // ─── Display lists with fallback ───
  const trendingList = trendingToday.length > 0 ? trendingToday.slice(0, 10) : getDummyTrending();
  const newMediaList = newMedia.length > 0 ? newMedia.slice(0, 5) : getDummyNew();
  const artistsList = popularArtists.length > 0 ? popularArtists.slice(0, 5) : getDummyArtists();
  const chartData: ChartData = (chart && chart.entries && chart.entries.length) ? chart : getDummyChart();

  // ─── Loading state ───
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={primary} />
        <Text style={styles.loadingText}>Loading your feed...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ImageBackground
        source={require('../../assets/randomrapper.jpeg')}
        style={styles.backgroundImage}
        resizeMode="cover"
      >
        <LinearGradient
          colors={['transparent', '#000000']}
          locations={[0, 0.9]}
          style={styles.backgroundGradient}
        />
      </ImageBackground>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={primary}
            colors={[primary]}
          />
        }
      >
        {error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* ═══════ HERO BANNER (static across all lenses) ═══════ */}
        <TouchableOpacity
          style={styles.heroBanner}
          onPress={() => navigation.navigate('VoteAwards')}
          activeOpacity={0.95}
        >
          <LinearGradient
            colors={['#1a1a2e', '#16213e', '#0f3460']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={['rgba(10,10,12,0.9)', 'rgba(10,10,12,0.4)', 'transparent']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
          {lastWinner ? (
            <TouchableOpacity
              style={styles.heroWinner}
              activeOpacity={0.8}
              onPress={() => handleSongNav(lastWinner.songId, 'song')}
            >
              <View style={styles.heroWinnerLabelRow}>
                <View style={[styles.heroWinnerDot, { backgroundColor: primary }]} />
                <Text style={styles.heroWinnerLabel}>SONG OF THE WEEK</Text>
              </View>
              <Image
                source={lastWinner.artworkUrl ? { uri: lastWinner.artworkUrl } : require('../../assets/randomrapper.jpeg')}
                style={styles.heroWinnerThumb}
              />
            </TouchableOpacity>
          ) : (
            <HeroParticles />
          )}
          <View style={styles.heroContent}>
            <Text style={styles.heroLabel}>
              Featured in {selectedJurisdictionName}
            </Text>
            <Text style={styles.heroTitle}>
              Vote for This Week's Top Track
            </Text>
            <Text style={styles.heroSubtitle}>
              Your vote decides who tops the neighborhood leaderboard.
            </Text>
            <TouchableOpacity
              style={styles.heroCta}
              onPress={() => navigation.navigate('VoteAwards')}
              activeOpacity={0.8}
            >
              <Text style={styles.heroCtaText}>✓ Vote Now</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>

        {/* ═══════ LENS BAR ═══════ */}
        <LensBar activeLens={activeLens} onSelect={handleLensSelect} primary={primary} />

        {/* ═══════════════════════════════════════ */}
        {/* ═══════ LENS: ALL ═══════ */}
        {/* ═══════════════════════════════════════ */}
        {activeLens === 'all' && (
          <>
            {/* ═══════ TRENDING TODAY ═══════ */}
            <AnimatedSection delay={100}>
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionTitleRow}>
                    <Text style={styles.sectionTitle}>Trending Today in </Text>
                    <JurisdictionSelect
                      selectedId={selectedJurisdictionId}
                      onChange={setSelectedJurisdictionId}
                    />
                  </View>
                  <TouchableOpacity onPress={() => navigation.navigate('Find')}>
                    <Text style={styles.seeAll}>Show all</Text>
                  </TouchableOpacity>
                </View>
                <FlatList
                  data={trendingList}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.carouselContent}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => (
                    <MediaCard
                      item={item}
                      onPress={() => handleSongNav(item.id, item.type)}
                      onPlayPress={() => handlePlayMedia(item)}
                    />
                  )}
                  ItemSeparatorComponent={() => <View style={{ width: 14 }} />}
                />
              </View>
            </AnimatedSection>

            {/* ═══════ NEW RELEASES ═══════ */}
            <AnimatedSection delay={200}>
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>New Releases</Text>
                  <TouchableOpacity onPress={() => navigation.navigate('Find')}>
                    <Text style={styles.seeAll}>Show all</Text>
                  </TouchableOpacity>
                </View>
                <FlatList
                  data={newMediaList}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.carouselContent}
                  keyExtractor={(item) => `new-${item.id}`}
                  renderItem={({ item }) => (
                    <MediaCard
                      item={item}
                      onPress={() => handleSongNav(item.id, item.type)}
                      onPlayPress={() => handlePlayMedia(item)}
                    />
                  )}
                  ItemSeparatorComponent={() => <View style={{ width: 14 }} />}
                />
              </View>
            </AnimatedSection>

            {/* ═══════ SONGS OF THE WEEK TIMELINE ═══════ */}
            {weeklyWinners.length > 0 && (
              <AnimatedSection delay={300}>
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Songs of the Week</Text>
                  </View>
                  <View style={timelineStyles.container}>
                    <View style={timelineStyles.rail} />
                    {weeklyWinners.map((winner, i) => (
                      <TouchableOpacity
                        key={winner.awardId || winner.songId}
                        style={timelineStyles.node}
                        activeOpacity={0.8}
                        onPress={() => handleSongNav(winner.songId, 'song')}
                      >
                        <Image
                          source={winner.artworkUrl ? { uri: winner.artworkUrl } : require('../../assets/randomrapper.jpeg')}
                          style={[
                            timelineStyles.thumb,
                            i === 0 && { borderColor: primary },
                          ]}
                        />
                        <Text style={[timelineStyles.date, i === 0 && { color: primaryLight }]}>
                          {formatAwardDate(winner.awardDate)}
                        </Text>
                        <Text style={timelineStyles.song} numberOfLines={1}>{winner.title}</Text>
                        <Text style={timelineStyles.artist} numberOfLines={1}>{winner.artistName}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </AnimatedSection>
            )}

            {/* ═══════ ARTIST OF THE WEEK ═══════ */}
            {artistOfWeek && (
              <AnimatedSection delay={400}>
                <View style={styles.section}>
                  <TouchableOpacity
                    style={aowStyles.card}
                    activeOpacity={0.85}
                    onPress={() => handleArtistNav(artistOfWeek.userId)}
                  >
                    <View style={aowStyles.photoWrap}>
                      <Text style={aowStyles.crown}>👑</Text>
                      <Image
                        source={artistOfWeek.photoUrl ? { uri: artistOfWeek.photoUrl } : require('../../assets/randomrapper.jpeg')}
                        style={[aowStyles.photo, { borderColor: primary }]}
                      />
                    </View>
                    <View style={aowStyles.info}>
                      <Text style={[aowStyles.label, { color: primaryLight }]}>
                        ARTIST OF THE WEEK · {selectedJurisdictionName.toUpperCase()}
                      </Text>
                      <Text style={aowStyles.name} numberOfLines={1}>{artistOfWeek.username}</Text>
                      {artistOfWeek.votesCount > 0 && (
                        <Text style={aowStyles.meta}>
                          {artistOfWeek.votesCount} vote{artistOfWeek.votesCount !== 1 ? 's' : ''} this week
                        </Text>
                      )}
                    </View>
                    <Text style={aowStyles.chevron}>›</Text>
                  </TouchableOpacity>
                </View>
              </AnimatedSection>
            )}

            {/* ═══════ POPULAR ARTISTS ═══════ */}
            <AnimatedSection delay={500}>
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Popular Artists</Text>
                </View>
                <View style={styles.artistsGrid}>
                  {artistsList.map((artist, index) => (
                    <ArtistCard
                      key={artist.userId}
                      artist={artist}
                      index={index}
                      onPress={() => handleArtistNav(artist.userId)}
                      onViewPress={() => handleArtistNav(artist.userId)}
                    />
                  ))}
                </View>
              </View>
            </AnimatedSection>
          </>
        )}

        {/* ═══════════════════════════════════════ */}
        {/* ═══════ LENS: CHARTS ═══════ */}
        {/* ═══════════════════════════════════════ */}
        {activeLens === 'charts' && (
          <AnimatedSection delay={100}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Most Played This Week</Text>
              <Text style={chartStyles.caption}>
                Voting closes Sunday 11:59 PM
                {!chartData.isDemo &&
                  ` · ${formatPlayCount(chartData.totalPlaysThisWeek)} play${chartData.totalPlaysThisWeek !== 1 ? 's' : ''} this week`}
              </Text>

              {chartLoading ? (
                <View style={chartStyles.loading}>
                  <ActivityIndicator size="small" color={primary} />
                </View>
              ) : (
                <View style={chartStyles.list}>
                  {chartData.entries.map((entry) => (
                    <TouchableOpacity
                      key={entry.songId}
                      style={[
                        chartStyles.row,
                        entry.rank === 1 && { borderColor: primary },
                      ]}
                      activeOpacity={0.85}
                      onPress={() => handleSongNav(entry.songId, 'song')}
                    >
                      <Image
                        source={entry.artworkUrl ? { uri: getMediaUrl(entry.artworkUrl) || entry.artworkUrl } : require('../../assets/randomrapper.jpeg')}
                        style={chartStyles.ambient}
                        blurRadius={25}
                      />
                      <View style={chartStyles.ambientOverlay} />
                      <Text
                        style={[
                          chartStyles.rank,
                          entry.rank === 1 && { color: primaryLight },
                        ]}
                      >
                        {entry.rank}
                      </Text>
                      <Image
                        source={entry.artworkUrl ? { uri: getMediaUrl(entry.artworkUrl) || entry.artworkUrl } : require('../../assets/randomrapper.jpeg')}
                        style={chartStyles.artwork}
                      />
                      <View style={chartStyles.info}>
                        <Text style={chartStyles.songTitle} numberOfLines={1}>{entry.title}</Text>
                        <Text style={chartStyles.songArtist} numberOfLines={1}>
                          {entry.artistName} · {formatPlayCount(entry.plays)} play{entry.plays !== 1 ? 's' : ''}
                        </Text>
                      </View>
                      <MovementBadge movement={entry.movement} primaryLight={primaryLight} />
                      <TouchableOpacity
                        style={[chartStyles.playButton, { backgroundColor: primary }]}
                        activeOpacity={0.8}
                        onPress={() => handlePlayChartEntry(entry)}
                      >
                        <Text style={chartStyles.playIcon}>▶</Text>
                      </TouchableOpacity>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {lastWinner && (
                <TouchableOpacity
                  style={chartStyles.lastWinner}
                  activeOpacity={0.85}
                  onPress={() => handleSongNav(lastWinner.songId, 'song')}
                >
                  <Text style={chartStyles.lastWinnerTrophy}>🏆</Text>
                  <Text style={chartStyles.lastWinnerText} numberOfLines={2}>
                    Last week's winner:{' '}
                    <Text style={chartStyles.lastWinnerStrong}>
                      {lastWinner.title} — {lastWinner.artistName}
                    </Text>
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </AnimatedSection>
        )}

        {/* ═══════════════════════════════════════ */}
        {/* ═══════ LENS: PLAYLISTS ═══════ */}
        {/* ═══════════════════════════════════════ */}
        {activeLens === 'playlists' && (
          <AnimatedSection delay={100}>
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Playlists Rising in {selectedJurisdictionName}</Text>
              </View>

              {playlistsLoading ? (
                <View style={chartStyles.loading}>
                  <ActivityIndicator size="small" color={primary} />
                </View>
              ) : (
                <>
                  {featuredPlaylist && (
                    <TouchableOpacity
                      style={playlistStyles.featured}
                      activeOpacity={0.85}
                      onPress={handlePlaylistNav}
                    >
                      <PlaylistCover
                        playlist={featuredPlaylist}
                        size={SCREEN_WIDTH - 32}
                        radius={0}
                      />
                      <View style={playlistStyles.featuredBody}>
                        <View style={[playlistStyles.featuredBadge, { backgroundColor: primary }]}>
                          <Text style={playlistStyles.featuredBadgeText}>
                            {featuredPlaylist.type === 'official' ? 'CURATED BY UNIS' : 'COMMUNITY FAVORITE'}
                          </Text>
                        </View>
                        <Text style={playlistStyles.featuredName} numberOfLines={1}>
                          {featuredPlaylist.name}
                        </Text>
                        <Text style={playlistStyles.featuredMeta}>
                          {featuredPlaylist.songCount || 0} track{(featuredPlaylist.songCount || 0) !== 1 ? 's' : ''}
                          {featuredPlaylist.creatorName ? ` · by ${featuredPlaylist.creatorName}` : ''}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )}

                  {communityPlaylists.length > 0 ? (
                    <View style={playlistStyles.grid}>
                      {communityPlaylists.slice(0, 8).map((playlist) => (
                        <TouchableOpacity
                          key={playlist.playlistId}
                          style={playlistStyles.tile}
                          activeOpacity={0.85}
                          onPress={handlePlaylistNav}
                        >
                          <PlaylistCover
                            playlist={playlist}
                            size={(SCREEN_WIDTH - 32 - 14) / 2}
                          />
                          <Text style={playlistStyles.tileName} numberOfLines={1}>{playlist.name}</Text>
                          <Text style={playlistStyles.tileMeta} numberOfLines={1}>
                            {playlist.songCount || 0} track{(playlist.songCount || 0) !== 1 ? 's' : ''}
                            {playlist.creatorName ? ` · ${playlist.creatorName}` : ''}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : (
                    !featuredPlaylist && (
                      <View style={playlistStyles.empty}>
                        <Text style={playlistStyles.emptyText}>
                          No public playlists in {selectedJurisdictionName} yet. Be the first to make one.
                        </Text>
                      </View>
                    )
                  )}
                </>
              )}
            </View>
          </AnimatedSection>
        )}

        {/* ═══════════════════════════════════════ */}
        {/* ═══════ LENS: FRESH ═══════ */}
        {/* ═══════════════════════════════════════ */}
        {activeLens === 'fresh' && (
          <AnimatedSection delay={100}>
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Dropped Recently</Text>
              </View>
              <View style={chartStyles.list}>
                {newMediaList.map((item) => (
                  <TouchableOpacity
                    key={`fresh-${item.id}`}
                    style={chartStyles.row}
                    activeOpacity={0.85}
                    onPress={() => handleSongNav(item.id, item.type)}
                  >
                    <Image
                      source={item.artworkUrl ? { uri: item.artworkUrl } : require('../../assets/randomrapper.jpeg')}
                      style={chartStyles.artwork}
                    />
                    <View style={chartStyles.info}>
                      <Text style={chartStyles.songTitle} numberOfLines={1}>{item.title}</Text>
                      <Text style={chartStyles.songArtist} numberOfLines={1}>
                        {item.artistData?.username || item.artist || 'Unknown'}
                        {item.createdAt ? ` · ${formatTimeAgo(item.createdAt)}` : ''}
                      </Text>
                    </View>
                    {isWithinDays(item.createdAt, 7) && (
                      <View style={freshStyles.newBadge}>
                        <Text style={freshStyles.newBadgeText}>NEW</Text>
                      </View>
                    )}
                    <TouchableOpacity
                      style={[chartStyles.playButton, { backgroundColor: primary }]}
                      activeOpacity={0.8}
                      onPress={() => handlePlayMedia(item)}
                    >
                      <Text style={chartStyles.playIcon}>▶</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Dropping soon — renders only once /v1/media/upcoming exists and returns data */}
              {upcoming.length > 0 && (
                <>
                  <View style={[styles.sectionHeader, freshStyles.upcomingHeader]}>
                    <Text style={styles.sectionTitle}>Dropping Soon</Text>
                  </View>
                  <View style={chartStyles.list}>
                    {upcoming.map((item: any) => (
                      <View key={`up-${item.songId}`} style={[chartStyles.row, freshStyles.upcomingRow]}>
                        <Image
                          source={item.artworkUrl ? { uri: getMediaUrl(item.artworkUrl) } : require('../../assets/randomrapper.jpeg')}
                          style={chartStyles.artwork}
                        />
                        <View style={chartStyles.info}>
                          <Text style={chartStyles.songTitle} numberOfLines={1}>{item.title}</Text>
                          <Text style={chartStyles.songArtist} numberOfLines={1}>
                            {item.artist?.username || 'Unknown'}
                          </Text>
                        </View>
                        <Text style={[freshStyles.date, { color: primaryLight }]}>
                          {item.scheduledReleaseAt
                            ? new Date(item.scheduledReleaseAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                            : 'Soon'}
                        </Text>
                      </View>
                    ))}
                  </View>
                </>
              )}
            </View>
          </AnimatedSection>
        )}

        <FeedFooter />
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
};

// ─── Base64 decode for token parsing ───
const atob = (input: string): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let str = input.replace(/=+$/, '');
  let output = '';
  if (str.length % 4 === 1) throw new Error('Invalid base64 string');
  for (let bc = 0, bs = 0, buffer, i = 0; (buffer = str.charAt(i++)); ) {
    buffer = chars.indexOf(buffer) as any;
    if ((buffer as number) === -1) continue;
    bs = bc % 4 ? bs * 64 + (buffer as number) : (buffer as number);
    if (bc++ % 4) output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)));
  }
  return output;
};

// ─────────────────────────────────────────────
// TIMELINE STYLES
// ─────────────────────────────────────────────
const timelineStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    position: 'relative',
    paddingHorizontal: 4,
  },
  rail: {
    position: 'absolute',
    top: 32,
    left: 44,
    right: 44,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  node: {
    alignItems: 'center',
    width: '31%',
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#18181c',
  },
  date: {
    marginTop: 7,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: 'rgba(255,255,255,0.35)',
  },
  song: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    color: '#f0f0f2',
    maxWidth: '100%',
  },
  artist: {
    fontSize: 10.5,
    color: 'rgba(255,255,255,0.55)',
    maxWidth: '100%',
  },
});

// ─────────────────────────────────────────────
// ARTIST OF THE WEEK STYLES
// ─────────────────────────────────────────────
const aowStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  photoWrap: {
    position: 'relative',
  },
  crown: {
    position: 'absolute',
    top: -14,
    alignSelf: 'center',
    fontSize: 16,
    zIndex: 2,
  },
  photo: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    backgroundColor: '#18181c',
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 3,
  },
  name: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f0f0f2',
    letterSpacing: -0.3,
  },
  meta: {
    fontSize: 11.5,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 2,
  },
  chevron: {
    fontSize: 24,
    color: 'rgba(255,255,255,0.35)',
    paddingLeft: 4,
  },
});

// ─────────────────────────────────────────────
// CHART / FRESH ROW STYLES
// ─────────────────────────────────────────────
const chartStyles = StyleSheet.create({
  caption: {
    fontSize: 12.5,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 4,
    marginBottom: 16,
  },
  loading: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  list: {
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    position: 'relative',
    overflow: 'hidden',
  },
  // Ambient blurred artwork layer (matches Trophy Case / VotingWizard)
  ambient: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.45,
  },
  ambientOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,10,12,0.72)',
  },
  rank: {
    width: 22,
    fontSize: 16,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
  },
  artwork: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#18181c',
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  songTitle: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#f0f0f2',
  },
  songArtist: {
    fontSize: 11.5,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 2,
  },
  movement: {
    fontSize: 11,
    fontWeight: '700',
    minWidth: 34,
    textAlign: 'right',
  },
  movementUp: {
    color: '#22c58b',
  },
  movementDown: {
    color: '#e2564b',
  },
  movementFlat: {
    color: 'rgba(255,255,255,0.35)',
  },
  newBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  newBadgeText: {
    fontSize: 8.5,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  playButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: {
    color: '#fff',
    fontSize: 12,
    marginLeft: 2,
  },
  lastWinner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  lastWinnerTrophy: {
    fontSize: 15,
  },
  lastWinnerText: {
    flex: 1,
    fontSize: 11.5,
    color: 'rgba(255,255,255,0.55)',
    lineHeight: 16,
  },
  lastWinnerStrong: {
    color: '#f0f0f2',
    fontWeight: '600',
  },
});

// ─────────────────────────────────────────────
// PLAYLIST STYLES
// ─────────────────────────────────────────────
const playlistStyles = StyleSheet.create({
  featured: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 20,
  },
  featuredBody: {
    padding: 14,
  },
  featuredBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 8,
  },
  featuredBadgeText: {
    color: '#fff',
    fontSize: 8.5,
    fontWeight: '700',
    letterSpacing: 1,
  },
  featuredName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#f0f0f2',
    letterSpacing: -0.3,
  },
  featuredMeta: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 3,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  tile: {
    width: (SCREEN_WIDTH - 32 - 14) / 2,
  },
  tileName: {
    marginTop: 7,
    fontSize: 13,
    fontWeight: '600',
    color: '#f0f0f2',
  },
  tileMeta: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 2,
  },
  empty: {
    padding: 32,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  emptyText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
});

// ─────────────────────────────────────────────
// FRESH STYLES
// ─────────────────────────────────────────────
const freshStyles = StyleSheet.create({
  newBadge: {
    backgroundColor: 'rgba(34, 197, 139, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 139, 0.3)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  newBadgeText: {
    color: '#22c58b',
    fontSize: 8.5,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  upcomingHeader: {
    marginTop: 28,
  },
  upcomingRow: {
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  date: {
    fontSize: 11,
    fontWeight: '700',
  },
});

// ─────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  backgroundImage: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    opacity: 0.15,
  },
  backgroundGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#A9A9A9',
    marginTop: 16,
    fontSize: 16,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
  },
  errorContainer: {
    backgroundColor: 'rgba(255, 165, 0, 0.15)',
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 165, 0, 0.2)',
  },
  errorText: {
    color: '#FFA500',
    textAlign: 'center',
    fontSize: 14,
  },

  // ── Hero banner ──
  heroBanner: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 20,
    height: IS_MOBILE ? 170 : 200,
    position: 'relative',
  },
  heroContent: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    padding: IS_MOBILE ? 20 : 32,
    justifyContent: 'center',
    zIndex: 2,
  },
  heroLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: '#4ea8f5',
    marginBottom: 6,
  },
  heroTitle: {
    fontSize: IS_MOBILE ? 22 : 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: '#f0f0f2',
    marginBottom: 4,
  },
  heroSubtitle: {
    fontSize: IS_MOBILE ? 12 : 14,
    color: 'rgba(255,255,255,0.55)',
    maxWidth: 280,
    lineHeight: 18,
  },
  heroCta: {
    marginTop: 14,
    backgroundColor: '#4ea8f5',
    borderRadius: 40,
    paddingHorizontal: 20,
    paddingVertical: 9,
    alignSelf: 'flex-start',
  },
  heroCtaText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },

  // ── Hero winner (bottom-right thumb) ──
  heroWinner: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    zIndex: 3,
    alignItems: 'flex-end',
    gap: 4,
  },
  heroWinnerLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  heroWinnerDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  heroWinnerLabel: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.7)',
  },
  heroWinnerThumb: {
    width: 44,
    height: 44,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: '#18181c',
  },

  // ── Sections ──
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 16,
    flexWrap: 'wrap',
    gap: 4,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    flex: 1,
  },
  sectionTitle: {
    color: '#f0f0f2',
    fontSize: IS_MOBILE ? 20 : 24,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  seeAll: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.55)',
  },
  carouselContent: {
    paddingRight: 16,
  },

  // ── Artists ──
  artistsGrid: {
    gap: 16,
  },
});

export default FeedScreen;