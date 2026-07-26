// src/screens/ArtistScreen.tsx
// FULL PORT of the finished web artist page (artistpage.jsx v3).
//
// What this brings over from web, in order:
//   • Full-bleed hero portrait with scrim + vignette, bottom-anchored content
//   • Sticky artist header that slides in on scroll (Spotify-style)
//   • Award medal rails on both hero edges (ArtistAwardRails)
//   • Support = SUPPORTED-ARTIST SWITCH (not a tip) via ArtistSheets
//   • Shop sheet → download hand-off
//   • Public territory rank (ArtistTerritory)
//   • Fans Pick card with ambient tint, no score shown
//   • Popular list with See all / Show less
//   • Connect = real brand logos in the user's theme colour
//   • Instagram-style photo gallery + swipeable lightbox
//
// BUGS FIXED IN THE PORT (all were live on mobile):
//   1. playMedia → requestPlay. playMedia bypasses PlayChoiceModal entirely;
//      requestPlay is what routes through it. Play counting is unchanged.
//   2. getMediaUrl → buildUrl, everywhere (project convention / CDN rules).
//   3. Play counts read `playCount` (the real Song entity field). The old code
//      read `plays`, which does not exist on the payload — hence "0 plays".
//   4. MessageButton now receives recipientName + photo, so threads stop
//      opening as "Member" (MessageScreen falls back to that string).
//   5. Sequential awaits → one Promise.all batch (8 calls, one round trip).
//
// BACKEND PREREQS (see SECURITY_CONFIG_PATCH.md):
//   GET /api/v1/users/*/awards          → permitAll  (else guests see no medals)
//   GET /api/v1/users/*/standing        → permitAll
//   GET /api/v1/users/*/territory-rank  → permitAll  (PublicTerritoryRankController)

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  TextInput,
  Dimensions,
  ActivityIndicator,
  Linking,
  Alert,
  Animated,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Play, UserPlus, Star, Zap, ShoppingBag, MapPin } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';

import { usePlayer } from '../context/PlayerContext';
import { useAuth } from '../context/AuthContext';
import axiosInstance from '../services/axiosInstance';
import { buildUrl } from '../utils/buildUrl';
import VotingWizard from '../components/VotingWizard';
import MessageButton from '../components/MessageButton';
import ArtistAwardRails, { normalizeAwards } from '../components/ArtistAwardRails';
import ArtistPhotoGallery, { ArtistPhoto } from '../components/ArtistPhotoGallery';
import ArtistTerritory from '../components/ArtistTerritory';
import { SupporterSheet, ShopSheet, ShopSong, SupporterResult } from '../components/ArtistSheets';
import type { Nominee as VotingNominee } from '../types/voting';

const { width: SCREEN_W } = Dimensions.get('window');
const HERO_H = Math.round(Dimensions.get('window').height * 0.62);

// ─── Theme (mirrors web --unis-primary; same map as FeedScreen) ─
const THEME_HEX: Record<string, string> = {
  blue: '#163387',
  orange: '#C44B0A',
  red: '#B51C24',
  green: '#0F7A3E',
  purple: '#4A1A8C',
  yellow: '#C49A0A',
  dianna: '#C49A0A',
};
const getThemeHex = (t?: string): string => THEME_HEX[t || 'blue'] || THEME_HEX.blue;

/** Lighter companion tone for text/icons on dark (mirrors --unis-primary-2). */
const lightenHex = (hex: string, amt = 70): string => {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, (num >> 16) + amt);
  const g = Math.min(255, ((num >> 8) & 0xff) + amt);
  const b = Math.min(255, (num & 0xff) + amt);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
};

const C = {
  base: '#111114',
  surface: 'rgba(20, 20, 24, 0.85)',
  text1: '#f2f2f4',
  text2: '#a8a8b3',
  text3: '#6a6a78',
  border: 'rgba(255, 255, 255, 0.08)',
};

// The Song entity's play column is `playCount`; `plays` does not exist on the
// payload. Keeping the fallback matches changeDefaultSongWizard's pattern.
const playsOf = (s: any): number => Number(s?.playCount ?? s?.plays ?? 0);
const fmt = (n?: number | null): string => Number(n || 0).toLocaleString();

// ─── Real social brand marks (theme-coloured, no boxes) ────────
const SOCIAL_PATHS: Record<string, string> = {
  instagram:
    'M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.209 0-4-1.79-4-4 0-2.209 1.79-4 4-4 2.209 0 4 1.79 4 4 0 2.209-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z',
  twitter:
    'M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z',
  tiktok:
    'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z',
  youtube:
    'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z',
};

const SOCIAL_DEFS = [
  { key: 'instagram', name: 'Instagram', field: 'instagramUrl' },
  { key: 'twitter', name: 'X', field: 'twitterUrl' },
  { key: 'tiktok', name: 'TikTok', field: 'tiktokUrl' },
  { key: 'youtube', name: 'YouTube', field: 'youtubeUrl' },
];

// ============================================================================
const ArtistScreen: React.FC = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const artistId: string | undefined = route.params?.artistId;

  const { requestPlay } = usePlayer();
  const { user, theme, refreshUser } = useAuth();
  // Mobile auth context has no isGuest flag — a null user IS the guest signal.
  // In practice this screen is unreachable while signed out (see requireAuth).
  const isGuest = !user;
  const userId = user?.userId;

  const themeColor = getThemeHex(theme);
  const themeSoft = lightenHex(themeColor, 90);

  const [artist, setArtist] = useState<any>(null);
  const [songs, setSongs] = useState<any[]>([]);
  const [photos, setPhotos] = useState<ArtistPhoto[]>([]);
  const [awards, setAwards] = useState<Record<string, number>>({});
  const [standing, setStanding] = useState<any>(null);
  const [defaultSong, setDefaultSong] = useState<any>(null);
  const [followerCount, setFollowerCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [bio, setBio] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showAllSongs, setShowAllSongs] = useState(false);
  const [awardsRevealed, setAwardsRevealed] = useState(false);
  const [showVotingWizard, setShowVotingWizard] = useState(false);
  const [nominee, setNominee] = useState<VotingNominee | null>(null);

  // Supporter switch
  const [isSupporting, setIsSupporting] = useState(false);
  const [showSupporter, setShowSupporter] = useState(false);
  const [supporterBusy, setSupporterBusy] = useState(false);
  const [supporterError, setSupporterError] = useState<string | null>(null);
  const [supporterResult, setSupporterResult] = useState<SupporterResult | null>(null);

  // Shop
  const [showShop, setShowShop] = useState(false);

  const isOwnProfile = Boolean(userId && artistId && userId === artistId);
  const showActions = !isOwnProfile;

  // Sticky header
  const scrollY = useRef(new Animated.Value(0)).current;
  const stickyOpacity = scrollY.interpolate({
    inputRange: [HERO_H - 180, HERO_H - 90],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const stickyTranslate = scrollY.interpolate({
    inputRange: [HERO_H - 180, HERO_H - 90],
    outputRange: [-60, 0],
    extrapolate: 'clamp',
  });

  // user.supportedArtistId is already on the auth context — live state, no call
  useEffect(() => {
    setIsSupporting(Boolean(userId && user?.supportedArtistId === artistId));
  }, [userId, user?.supportedArtistId, artistId]);

  // ── Load everything in ONE parallel batch ────────────────────
  useEffect(() => {
    if (!artistId) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const viewingOther = Boolean(userId && userId !== artistId);

        const [
          artistRes,
          followersRes,
          songsRes,
          defaultRes,
          followRes,
          awardsRes,
          standingRes,
          photosRes,
        ] = await Promise.all([
          axiosInstance.get(`/v1/users/profile/${artistId}`),
          axiosInstance.get(`/v1/users/${artistId}/followers/count`).catch(() => ({ data: { count: 0 } })),
          axiosInstance.get(`/v1/media/songs/artist/${artistId}`).catch(() => ({ data: [] })),
          axiosInstance.get(`/v1/users/${artistId}/default-song`).catch(() => ({ data: null })),
          viewingOther
            ? axiosInstance.get(`/v1/users/${artistId}/is-following`).catch(() => ({ data: { isFollowing: false } }))
            : Promise.resolve({ data: { isFollowing: false } }),
          axiosInstance.get(`/v1/users/${artistId}/awards`).catch((e) => {
            console.error('[Awards] tally load failed:', artistId, e?.message);
            return { data: [] };
          }),
          axiosInstance.get(`/v1/users/${artistId}/standing`).catch(() => ({ data: null })),
          axiosInstance.get(`/v1/users/${artistId}/photos`).catch((e) => {
            console.error('[Photos] load failed:', artistId, e?.message);
            return { data: { photos: [] } };
          }),
        ]);

        if (cancelled) return;

        setArtist(artistRes.data);
        setBio(artistRes.data?.bio || '');
        setFollowerCount(followersRes.data?.count || 0);
        setSongs(Array.isArray(songsRes.data) ? songsRes.data : []);
        setDefaultSong(defaultRes.data || null);
        setIsFollowing(Boolean(followRes.data?.isFollowing));
        setAwards(normalizeAwards(awardsRes.data));
        setStanding(standingRes.data || null);
        setPhotos(Array.isArray(photosRes.data?.photos) ? photosRes.data.photos : []);

        console.log('[ArtistScreen] loaded:', {
          artistId,
          songs: songsRes.data?.length || 0,
          photos: photosRes.data?.photos?.length || 0,
        });
      } catch (e: any) {
        if (cancelled) return;
        console.error('[ArtistScreen] load failed:', artistId, e?.message);
        setError('Failed to load artist details');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [artistId, userId]);

  // Medals slide in after the portrait has landed
  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => setAwardsRevealed(true), 650);
    return () => clearTimeout(t);
  }, [loading, artistId]);

  // ── Derived ──────────────────────────────────────────────────
  const artistPhoto = artist?.photoUrl ? buildUrl(artist.photoUrl) : null;

  const topSong = useMemo(() => {
    if (!songs.length) return null;
    return songs.reduce((prev, cur) => ((cur.score || 0) > (prev.score || 0) ? cur : prev), songs[0]);
  }, [songs]);

  const topArtwork = topSong ? buildUrl(topSong.artworkUrl) || artistPhoto : artistPhoto;

  const socialLinks = useMemo(
    () =>
      SOCIAL_DEFS.map((d) => ({ ...d, url: artist?.[d.field] as string | undefined })).filter(
        (d) => Boolean(d.url)
      ),
    [artist]
  );

  const visibleSongs = showAllSongs ? songs : songs.slice(0, 5);
  const isFirstPick = !user?.supportedArtistId;
  const standingArea = standing?.jurisdictionName || artist?.jurisdiction?.name || 'your area';

  // ── Actions ──────────────────────────────────────────────────
  // NOTE: mobile has no guest browsing — AppNavigator renders LoginScreen for
  // the whole app when `user` is null, so this screen is only reachable when
  // signed in. There is also no 'Login' route registered, so navigating to it
  // would throw. This stays purely as a defensive guard.
  const requireAuth = useCallback((): boolean => {
    if (!userId) {
      Alert.alert('Sign in required', 'Please sign in to continue.');
      return false;
    }
    return true;
  }, [userId]);

  const toggleFollow = async () => {
    if (!requireAuth()) return;
    const prev = isFollowing;
    const prevCount = followerCount;
    setIsFollowing(!prev);
    setFollowerCount((c) => (prev ? c - 1 : c + 1));
    try {
      if (prev) {
        await axiosInstance.delete(`/v1/users/${artistId}/follow`);
      } else {
        await axiosInstance.post(`/v1/users/${artistId}/follow`);
      }
      console.log('[Follow] ok:', { artistId, following: !prev });
    } catch (e: any) {
      console.error('[Follow] failed:', { artistId, err: e?.message });
      setIsFollowing(prev);
      setFollowerCount(prevCount);
      Alert.alert('Something went wrong', 'Please try again.');
    }
  };

  /**
   * All playback goes through requestPlay so PlayChoiceModal governs
   * "play now vs add to queue" — the previous playMedia call skipped it.
   * Play counting is unchanged (the player records the play).
   */
  const playSong = (song: any) => {
    if (!song || !artist) return;
    const url = buildUrl(song.fileUrl);
    if (!url) {
      Alert.alert('Unavailable', 'This track has no playable file yet.');
      return;
    }
    requestPlay({
      type: 'song',
      id: song.songId,
      songId: song.songId,
      url,
      fileUrl: url,
      title: song.title,
      artist: artist.username,
      artistId: artist.userId,
      artwork: buildUrl(song.artworkUrl) || artistPhoto,
      artworkUrl: buildUrl(song.artworkUrl) || artistPhoto,
      downloadPolicy: song.downloadPolicy,
      downloadPrice: song.downloadPrice,
    } as any);
  };

  const playDefault = () => {
    const target = defaultSong || topSong;
    if (!target) {
      Alert.alert('No song available', 'This artist has no default song yet.');
      return;
    }
    playSong(target);
  };

  const openSupporter = () => {
    if (!requireAuth()) return;
    setSupporterResult(null);
    setSupporterError(null);
    setShowSupporter(true);
  };

  const confirmSupporter = async () => {
    if (!userId) return;
    setSupporterBusy(true);
    setSupporterError(null);
    try {
      const res = await axiosInstance.put(`/v1/users/${userId}/supported-artist`, { artistId });
      const data = res.data || {};
      console.log('[Support] supported-artist update ok:', { artistId, status: data.status });
      setSupporterResult(data);
      if (data.status === 'immediate' || data.status === 'cancelled') setIsSupporting(true);
      await refreshUser?.();
    } catch (e: any) {
      console.error('[Support] supported-artist update failed:', { artistId, err: e?.message });
      setSupporterError(
        e?.response?.data?.error || 'Could not update your supported artist. Please try again.'
      );
    } finally {
      setSupporterBusy(false);
    }
  };

  const openShop = () => {
    if (!requireAuth()) return;
    console.log('[Shop] open:', {
      artistId,
      sellable: songs.filter((s) => s.downloadPolicy !== 'unavailable').length,
    });
    setShowShop(true);
  };

  const handleShopPick = (song: ShopSong) => {
    console.log('[Shop] song picked:', { songId: song.songId, policy: song.downloadPolicy });
    setShowShop(false);
    // SongScreen currently reads only `songId` from route params, so this
    // lands the user on the track; its own download control takes it from
    // there. If you add an `openDownload` param to SongScreen later, pass it
    // here to jump straight into the sheet.
    navigation.navigate('Song', { songId: song.songId });
  };

  const openVote = () => {
    if (!requireAuth()) return;
    setNominee({
      id: artistId,
      name: artist?.username,
      type: 'artist',
      jurisdiction: artist?.jurisdiction,
    } as VotingNominee);
    setShowVotingWizard(true);
  };

  const saveBio = async () => {
    try {
      await axiosInstance.put(`/v1/users/profile/${artistId}/bio`, { bio });
      console.log('[Bio] saved:', { artistId });
      Alert.alert('Saved', 'Bio updated successfully.');
    } catch (e: any) {
      console.error('[Bio] save failed:', { artistId, err: e?.message });
      Alert.alert('Failed', 'Could not update bio.');
    }
  };

  // ── States ───────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={themeColor} />
      </View>
    );
  }

  if (error || !artist) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Artist not found</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* ===== STICKY HEADER ===== */}
      <Animated.View
        pointerEvents="box-none"
        style={[
          styles.sticky,
          { opacity: stickyOpacity, transform: [{ translateY: stickyTranslate }] },
        ]}
      >
        <View style={styles.stickyInner}>
          {artistPhoto ? (
            <Image source={{ uri: artistPhoto }} style={[styles.stickyAvatar, { borderColor: themeColor }]} />
          ) : null}
          <Text style={styles.stickyName} numberOfLines={1}>
            {artist.username}
          </Text>
          {showActions ? (
            <TouchableOpacity
              style={[styles.stickyBtn, { backgroundColor: themeColor }]}
              onPress={playDefault}
              accessibilityRole="button"
              accessibilityLabel="Play"
            >
              <Play size={12} color="#fff" fill="#fff" />
              <Text style={styles.stickyBtnText}>Play</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </Animated.View>

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
        })}
        contentContainerStyle={styles.scrollContent}
      >
        {/* ===== HERO ===== */}
        <View style={styles.hero}>
          {artistPhoto ? (
            <Image source={{ uri: artistPhoto }} style={styles.heroImg} resizeMode="cover" />
          ) : (
            <View style={[styles.heroImg, { backgroundColor: '#1a1a1f' }]} />
          )}

          <LinearGradient
            colors={['rgba(17,17,20,0.55)', 'transparent']}
            style={styles.heroTopScrim}
            pointerEvents="none"
          />
          <LinearGradient
            colors={['transparent', 'rgba(17,17,20,0.55)', 'rgba(17,17,20,0.95)', C.base]}
            locations={[0.25, 0.6, 0.85, 1]}
            style={styles.heroScrim}
            pointerEvents="none"
          />

          <ArtistAwardRails
            awards={awards}
            themeColor={lightenHex(themeColor, 60)}
            revealed={awardsRevealed}
            top={64}
          />

          <View style={styles.heroContent}>
            <View style={styles.tagRow}>
              <TouchableOpacity
                style={[styles.jurisdictionChip, { backgroundColor: `${themeColor}4D`, borderColor: themeColor }]}
                onPress={() =>
                  navigation.navigate('Jurisdiction', {
                    jurisdictionName: artist.jurisdiction?.name,
                  })
                }
                accessibilityRole="button"
              >
                <MapPin size={11} color="#fff" />
                <Text style={styles.jurisdictionText}>
                  {artist.jurisdiction?.name || 'Unknown'}
                </Text>
              </TouchableOpacity>

              {standing?.rank != null ? (
                <View style={[styles.rankChip, { backgroundColor: themeColor }]}>
                  <Text style={styles.rankText}>#{standing.rank}</Text>
                </View>
              ) : null}
            </View>

            <Text style={styles.heroName} numberOfLines={2}>
              {artist.username}
            </Text>

            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{fmt(artist.totalPlays)}</Text>
                <Text style={styles.statLabel}>PLAYS</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{fmt(followerCount)}</Text>
                <Text style={styles.statLabel}>FOLLOWERS</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{fmt(artist.score)}</Text>
                <Text style={styles.statLabel}>SCORE</Text>
              </View>
            </View>

            {showActions ? (
              <>
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={[styles.btnPrimary, { backgroundColor: themeColor }]}
                    onPress={playDefault}
                    accessibilityRole="button"
                    accessibilityLabel="Play"
                  >
                    <Play size={16} color="#fff" fill="#fff" />
                    <Text style={styles.btnPrimaryText}>Play</Text>
                  </TouchableOpacity>

                  <MessageButton
                    recipientId={artistId}
                    recipientName={artist.username}
                    recipientPhotoUrl={artistPhoto}
                  />
                </View>

                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={[
                      styles.btnGhost,
                      isSupporting
                        ? { backgroundColor: themeColor, borderColor: themeColor }
                        : { borderColor: themeColor, backgroundColor: `${themeColor}33` },
                    ]}
                    onPress={openSupporter}
                    accessibilityRole="button"
                  >
                    <Zap size={15} color="#fff" />
                    <Text style={styles.btnGhostText}>
                      {isSupporting ? 'Supporting' : 'Support'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.btnGhost,
                      isFollowing && { backgroundColor: themeColor, borderColor: themeColor },
                    ]}
                    onPress={toggleFollow}
                    accessibilityRole="button"
                  >
                    <UserPlus size={15} color="#fff" />
                    <Text style={styles.btnGhostText}>
                      {isFollowing ? 'Following' : 'Follow'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.btnGhost} onPress={openVote} accessibilityRole="button">
                    <Star size={15} color="#fff" />
                    <Text style={styles.btnGhostText}>Vote</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.hintRow}>
                  <Zap size={12} color={themeSoft} />
                  <Text style={[styles.hintText, { color: themeSoft }]}>
                    Your vote moves them up the {standingArea} rankings
                  </Text>
                </View>
              </>
            ) : null}
          </View>
        </View>

        {/* ===== BODY ===== */}
        <View style={styles.body}>
          {/* Territory rank (public; hides itself if not computed) */}
          <ArtistTerritory
            artistId={artistId}
            artistName={artist.username}
            themeColor={themeColor}
            cardStyle={styles.cardGap}
          />

          {/* Fans Pick — ambient tint from the song's own artwork */}
          {topSong ? (
            <View style={[styles.card, styles.cardGap]}>
              {topArtwork ? (
                <Image source={{ uri: topArtwork }} style={styles.fansAmbient} blurRadius={30} />
              ) : null}
              <LinearGradient
                colors={['rgba(20,20,24,0.55)', 'rgba(20,20,24,0.92)']}
                style={StyleSheet.absoluteFill as any}
                pointerEvents="none"
              />
              <View style={styles.fansRow}>
                <TouchableOpacity
                  onPress={() => navigation.navigate('Song', { songId: topSong.songId })}
                  accessibilityRole="button"
                >
                  {topArtwork ? (
                    <Image source={{ uri: topArtwork }} style={styles.fansArt} />
                  ) : (
                    <View style={styles.fansArt} />
                  )}
                </TouchableOpacity>
                <View style={styles.fansInfo}>
                  <View style={[styles.badge, { backgroundColor: `${themeColor}44`, borderColor: themeColor }]}>
                    <Text style={styles.badgeText}>FANS PICK</Text>
                  </View>
                  <Text style={styles.fansTitle} numberOfLines={2}>
                    {topSong.title}
                  </Text>
                  {/* Play count only — the score/points figure was removed */}
                  <Text style={styles.fansMeta}>{fmt(playsOf(topSong))} plays</Text>
                  <TouchableOpacity
                    style={[styles.fansPlay, { backgroundColor: themeColor }]}
                    onPress={() => playSong(topSong)}
                    accessibilityRole="button"
                    accessibilityLabel={`Play ${topSong.title}`}
                  >
                    <Play size={14} color="#fff" fill="#fff" />
                    <Text style={styles.fansPlayText}>Play</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ) : null}

          {/* Support card */}
          {showActions ? (
            <View
              style={[
                styles.card,
                styles.cardGap,
                { backgroundColor: `${themeColor}1A`, borderColor: `${themeColor}3D` },
              ]}
            >
              <View style={styles.supportHead}>
                {artistPhoto ? <Image source={{ uri: artistPhoto }} style={styles.supportAvatar} /> : null}
                <View style={styles.supportCopy}>
                  <Text style={styles.supportTitle} numberOfLines={1}>
                    Support {artist.username}
                  </Text>
                  <Text style={styles.supportSub} numberOfLines={2}>
                    {isSupporting
                      ? 'They’re your supported artist — your listening backs them.'
                      : `Make ${artist.username} your supported artist.`}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={[
                  styles.supportBtn,
                  isSupporting
                    ? { backgroundColor: `${themeColor}44`, borderColor: themeColor }
                    : { backgroundColor: themeColor, borderColor: themeColor },
                ]}
                onPress={openSupporter}
                accessibilityRole="button"
              >
                <Zap size={16} color="#fff" />
                <Text style={styles.supportBtnText}>
                  {isSupporting ? 'Supporting' : 'Support'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.supportBtn, styles.supportBtnOutline, { borderColor: `${themeColor}99` }]}
                onPress={openShop}
                accessibilityRole="button"
              >
                <ShoppingBag size={16} color="#fff" />
                <Text style={styles.supportBtnText}>Shop</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Popular */}
          <View
            style={[
              styles.card,
              styles.cardGap,
              { backgroundColor: `${themeColor}26`, borderColor: `${themeColor}47` },
            ]}
          >
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Popular</Text>
              {songs.length > 5 ? (
                <TouchableOpacity
                  onPress={() => setShowAllSongs((v) => !v)}
                  accessibilityRole="button"
                >
                  <Text style={styles.seeAll}>{showAllSongs ? 'SHOW LESS' : 'SEE ALL'}</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {visibleSongs.length === 0 ? (
              <Text style={styles.empty}>No songs yet</Text>
            ) : (
              visibleSongs.map((song, i) => {
                const art = buildUrl(song.artworkUrl) || artistPhoto;
                return (
                  <View key={song.songId} style={styles.track}>
                    <Text style={styles.trackNum}>{i + 1}</Text>
                    {art ? <Image source={{ uri: art }} style={styles.trackArt} /> : <View style={styles.trackArt} />}
                    <TouchableOpacity
                      style={styles.trackInfo}
                      onPress={() => navigation.navigate('Song', { songId: song.songId })}
                      accessibilityRole="button"
                    >
                      <Text style={styles.trackTitle} numberOfLines={1}>
                        {song.title}
                      </Text>
                      <Text style={styles.trackPlays}>{fmt(playsOf(song))} plays</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.trackPlay, { backgroundColor: `${themeColor}66`, borderColor: themeColor }]}
                      onPress={() => playSong(song)}
                      accessibilityRole="button"
                      accessibilityLabel={`Play ${song.title}`}
                    >
                      <Play size={13} color="#fff" fill="#fff" />
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </View>

          {/* Connect — real brand logos in the user's theme */}
          {socialLinks.length > 0 ? (
            <View style={[styles.card, styles.cardGap]}>
              <Text style={styles.connectTitle}>CONNECT</Text>
              <View style={styles.logoRow}>
                {socialLinks.map((s) => (
                  <TouchableOpacity
                    key={s.key}
                    onPress={() => s.url && Linking.openURL(s.url)}
                    accessibilityRole="link"
                    accessibilityLabel={`${artist.username} on ${s.name}`}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Svg width={26} height={26} viewBox="0 0 24 24">
                      <Path d={SOCIAL_PATHS[s.key]} fill={lightenHex(themeColor, 90)} />
                    </Svg>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : null}

          {/* About */}
          <View style={[styles.card, styles.cardGap]}>
            <Text style={styles.sectionTitle}>About</Text>
            {isOwnProfile ? (
              <>
                <TextInput
                  value={bio}
                  onChangeText={setBio}
                  multiline
                  placeholder="Tell fans about yourself..."
                  placeholderTextColor={C.text3}
                  style={styles.bioInput}
                />
                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: themeColor }]}
                  onPress={saveBio}
                  accessibilityRole="button"
                >
                  <Text style={styles.saveBtnText}>Save Bio</Text>
                </TouchableOpacity>
              </>
            ) : (
              <Text style={styles.bioText}>{bio || 'No bio available'}</Text>
            )}
          </View>

          {/* Photos */}
          <ArtistPhotoGallery
            photos={photos}
            resolveUrl={(u) => buildUrl(u)}
            artistName={artist.username}
            themeColor={themeColor}
            cardStyle={styles.cardGap}
          />
        </View>
      </Animated.ScrollView>

      {/* ===== MODALS ===== */}
      <SupporterSheet
        show={showSupporter}
        onClose={() => setShowSupporter(false)}
        artistName={artist.username}
        artistPhoto={artistPhoto}
        isFirstPick={isFirstPick}
        alreadySupporting={isSupporting && !supporterResult}
        busy={supporterBusy}
        error={supporterError}
        result={supporterResult}
        onConfirm={confirmSupporter}
        themeColor={themeColor}
      />

      <ShopSheet
        show={showShop}
        onClose={() => setShowShop(false)}
        artistName={artist.username}
        songs={songs as ShopSong[]}
        resolveArtwork={(u) => buildUrl(u)}
        onPick={handleShopPick}
        themeColor={themeColor}
      />

      <VotingWizard
        show={showVotingWizard}
        onClose={() => setShowVotingWizard(false)}
        onVoteSuccess={() => setShowVotingWizard(false)}
        nominee={nominee}
        userId={userId}
        filters={{
          selectedGenre: artist.genre?.name?.toLowerCase().replace('/', '-') || 'unknown',
          selectedType: 'artist',
          selectedInterval: 'daily',
          selectedJurisdiction:
            artist.jurisdiction?.name?.toLowerCase().replace(' ', '-') || 'unknown',
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.base },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.base },
  errorText: { color: '#e04040', fontSize: 16 },
  scrollContent: { paddingBottom: 140 },

  // Sticky
  sticky: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    backgroundColor: 'rgba(17,17,20,0.94)',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingTop: 44,
  },
  stickyInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  stickyAvatar: { width: 32, height: 32, borderRadius: 16, borderWidth: 2 },
  stickyName: { flex: 1, fontSize: 16, fontWeight: '700', fontStyle: 'italic', color: C.text1 },
  stickyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 50,
  },
  stickyBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },

  // Hero
  hero: { width: SCREEN_W, height: HERO_H, justifyContent: 'flex-end' },
  heroImg: { ...StyleSheet.absoluteFillObject, width: SCREEN_W, height: HERO_H },
  heroTopScrim: { position: 'absolute', top: 0, left: 0, right: 0, height: 140 },
  heroScrim: { ...StyleSheet.absoluteFillObject },
  heroContent: { paddingHorizontal: 20, paddingBottom: 26 },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  jurisdictionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 5,
    borderWidth: 1,
  },
  jurisdictionText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: '#fff',
  },
  rankChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 5 },
  rankText: { fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 0.4 },
  heroName: {
    fontSize: 44,
    fontWeight: '800',
    fontStyle: 'italic',
    color: C.text1,
    marginBottom: 12,
    letterSpacing: -0.5,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 20,
  },
  statsRow: { flexDirection: 'row', gap: 22, marginBottom: 18 },
  stat: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  statValue: { fontSize: 17, fontWeight: '700', color: C.text1 },
  statLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 1.2, color: C.text3 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' },
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 26,
    paddingVertical: 12,
    borderRadius: 50,
  },
  btnPrimaryText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  btnGhost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  btnGhostText: { fontSize: 13, fontWeight: '600', color: C.text1 },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  hintText: { fontSize: 12, fontWeight: '500', flex: 1 },

  // Body
  body: { paddingHorizontal: 14, marginTop: -8 },
  card: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    padding: 18,
    overflow: 'hidden',
  },
  cardGap: { marginBottom: 14 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: C.text1 },
  seeAll: { fontSize: 11, fontWeight: '600', letterSpacing: 0.8, color: C.text3 },
  empty: { fontSize: 14, color: C.text3, textAlign: 'center', paddingVertical: 14 },

  // Fans pick
  fansAmbient: { ...StyleSheet.absoluteFillObject, opacity: 0.5 },
  fansRow: { flexDirection: 'row', gap: 14 },
  fansArt: { width: 110, height: 110, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)' },
  fansInfo: { flex: 1, minWidth: 0, justifyContent: 'center' },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    marginBottom: 8,
  },
  badgeText: { fontSize: 9, fontWeight: '700', letterSpacing: 1, color: '#fff' },
  fansTitle: {
    fontSize: 21,
    fontWeight: '700',
    fontStyle: 'italic',
    color: C.text1,
    marginBottom: 5,
  },
  fansMeta: { fontSize: 13, color: C.text2, marginBottom: 10 },
  fansPlay: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 50,
  },
  fansPlayText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  // Support card
  supportHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  supportAvatar: { width: 48, height: 48, borderRadius: 12 },
  supportCopy: { flex: 1, minWidth: 0 },
  supportTitle: { fontSize: 15, fontWeight: '800', color: C.text1, marginBottom: 3 },
  supportSub: { fontSize: 12, color: C.text2, lineHeight: 17 },
  supportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 50,
    borderWidth: 1,
    marginBottom: 10,
  },
  supportBtnOutline: { backgroundColor: 'transparent' },
  supportBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // Track rows
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    marginBottom: 4,
  },
  trackNum: { width: 20, textAlign: 'center', fontSize: 14, fontWeight: '600', color: C.text1 },
  trackArt: { width: 42, height: 42, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.06)' },
  trackInfo: { flex: 1, minWidth: 0 },
  trackTitle: { fontSize: 14, fontWeight: '600', color: C.text1 },
  trackPlays: { fontSize: 12, color: C.text2, marginTop: 2 },
  trackPlay: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },

  // Connect
  connectTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: C.text3,
    marginBottom: 16,
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 20, flexWrap: 'wrap' },

  // About
  bioText: { fontSize: 13, lineHeight: 21, color: C.text2 },
  bioInput: {
    minHeight: 100,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    padding: 12,
    color: C.text1,
    fontSize: 13,
    textAlignVertical: 'top',
    marginBottom: 10,
  },
  saveBtn: { alignSelf: 'flex-start', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 50 },
  saveBtnText: { fontSize: 13, fontWeight: '600', color: '#fff' },
});

export default ArtistScreen;