// src/screens/SongScreen.tsx
// ─────────────────────────────────────────────────────────────────────────────
// 1:1 port of web songPage.jsx. Brought fully up to date with the web page:
//   • Theme-aware — brand surfaces derive from useAuth().theme via THEME_HEX
//     (mirrors web `--unis-primary`), replacing the old hardcoded #163387/#4a8fe7.
//   • Play button routes through requestPlay → PlayChoiceModal (never bypasses
//     the queue-choice modal) and mirrors the player's true state for THIS song:
//     shows Pause when this song is playing and toggles play/pause directly.
//   • Play tracking is effect-based — a play is counted only when the player's
//     current track actually CHANGES to this song (not on button press), so
//     "Add to queue" never over-counts and queue-driven plays still count.
//   • "Don't Play" persists to /v1/playlists/blocked-songs (was a stub alert).
//   • Report opens the report form; Lyrics editing opens the real LyricsWizard
//     (was a stub alert).
//   • Secondary actions match web exactly: Don't Play · Report · Copy Link.
//     (Follow lives in the sidebar artist card, as on web.)
//   • buildUrl for every media URL; genreId carried into the vote nominee.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef } from 'react';
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
  Alert,
  Animated,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Heart, FileText } from 'lucide-react-native';
import * as ExpoClipboard from 'expo-clipboard';

import { useAuth } from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';
import axiosInstance from '../services/axiosInstance';
import { buildUrl } from '../utils/buildUrl';
import VotingWizard from '../components/VotingWizard';
import CommentSection from '../components/Commentsection';
import LyricsWizard from '../components/LyricsWizard';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IS_MOBILE = SCREEN_WIDTH < 768;
const ARTWORK_SIZE = IS_MOBILE ? Math.min(SCREEN_WIDTH - 64, 260) : 220;

// The public web origin — used for shareable/reportable song URLs.
const WEB_ORIGIN = 'https://unis.app';

// ─── Theme — mirrors web `--unis-primary` / ThemePicker / EarningsScreen ──────
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

// color-mix(in srgb, primary N%, transparent) has no RN equivalent — approximate
// the web page's translucent accent surfaces (accent-blue-dim ≈ 18%) with rgba.
const hexToRgba = (hex: string, alpha: number): string => {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// ─── Neutral tokens (constant across themes — same decision as the web scss,
//     where only --unis-primary is themed) ──────────────────────────────────
const C = {
  bgPrimary: '#0d0f14',
  bgSecondary: '#141720',
  bgTertiary: '#1a1d28',
  bgSurface: 'rgba(255,255,255,0.03)',
  textPrimary: '#e8e6e1',
  textSecondary: '#9a978f',
  textTertiary: '#5f5d58',
  accentRed: '#e24b4b',
  accentGreen: '#4ecf7a',
  borderDefault: 'rgba(255,255,255,0.06)',
  borderHover: 'rgba(255,255,255,0.12)',
};

interface Song {
  id: string;
  title: string;
  artist: string;
  artistId: string;
  artistPhoto: string | null;
  jurisdiction: string;
  genre: string;
  genreId: string | null; // ★ real UUID so votes never depend on name lookup
  artwork: string;
  url: string | null;
  description: string;
  playCount: number;
  playsToday: number;
  score: number;
  explicit: boolean;
  lyrics: string;
  credits: { producer: string; writer: string; mix: string };
  duration: number | null;
  createdAt: string;
}

const FALLBACK_ARTWORK = 'https://picsum.photos/400';

const SongScreen: React.FC = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const songId = route.params?.songId;

  const { user, theme } = useAuth();
  const userId = user?.userId ?? null;

  // Player sync: read isPlaying + currentMedia + togglePlayPause so the hero
  // button can mirror the player's true state for THIS exact song.
  const { requestPlay, currentMedia, isPlaying, togglePlayPause } = usePlayer();

  const accent = getThemeHex(theme);
  const accentDim = hexToRgba(accent, 0.15);

  const [song, setSong] = useState<Song | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [showVotingWizard, setShowVotingWizard] = useState(false);
  const [selectedNominee, setSelectedNominee] = useState<any>(null);
  const [showLyricsWizard, setShowLyricsWizard] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const hasTrackedInitialRef = useRef(false);
  const previousPlayingIdRef = useRef<string | null>(null);

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '--:--';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatNumber = (num: number) => {
    if (!num) return '0';
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toLocaleString();
  };

  // ── Data fetching — song + like status + like count in parallel (matches web) ──
  useEffect(() => {
    if (!songId) return;
    let active = true;
    const fetchAll = async () => {
      setLoading(true);
      setError('');
      try {
        const likedUrl = userId
          ? `/v1/media/song/${songId}/is-liked?userId=${userId}`
          : `/v1/media/song/${songId}/is-liked`;

        const [songRes, likedRes, likeCountRes] = await Promise.all([
          axiosInstance.get(`/v1/media/song/${songId}`),
          axiosInstance.get(likedUrl).catch(() => ({ data: { isLiked: false } })),
          axiosInstance.get(`/v1/media/song/${songId}/likes/count`).catch(() => ({ data: { count: 0 } })),
        ]);
        if (!active) return;

        const d = songRes.data;
        const normalized: Song = {
          id: d.songId,
          title: d.title,
          artist: d.artist?.username || 'Unknown',
          artistId: d.artist?.userId || '',
          artistPhoto: buildUrl(d.artist?.photoUrl) || null,
          jurisdiction: d.jurisdiction?.name || 'Unknown',
          genre: d.genre?.name || 'Unknown',
          genreId: d.genre?.genreId || null,
          artwork: buildUrl(d.artworkUrl) || FALLBACK_ARTWORK,
          url: buildUrl(d.fileUrl) || null,
          description: d.description || 'No description available',
          playCount: d.playCount || 0,
          playsToday: d.playsToday || 0,
          score: d.score || 0,
          explicit: d.explicit || false,
          lyrics: d.lyrics || '',
          credits: { producer: 'N/A', writer: 'N/A', mix: 'N/A' },
          duration: d.duration ? Math.round(d.duration / 1000) : null,
          createdAt: d.createdAt || '',
        };

        setSong(normalized);
        setIsLiked(likedRes.data.isLiked || false);
        setLikeCount(likeCountRes.data.count || 0);
        Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
      } catch (err) {
        console.error('Failed to load song:', err);
        if (active) setError('Failed to load song details');
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchAll();
    return () => { active = false; };
  }, [songId, userId]);

  // Reset play-tracking guards whenever the page's song changes.
  useEffect(() => {
    hasTrackedInitialRef.current = false;
    previousPlayingIdRef.current = null;
  }, [songId]);

  // ── Play tracking — count a play only when the player's current track
  //    actually CHANGES to this page's song (mirrors web). Skips the initial
  //    "was already playing on arrival" observation and never double-counts. ──
  useEffect(() => {
    if (!song?.id || !userId || !currentMedia) return;

    const playingId = currentMedia.id || currentMedia.songId;
    const prevId = previousPlayingIdRef.current;
    previousPlayingIdRef.current = playingId;

    if (playingId !== song.id) return;

    if (!hasTrackedInitialRef.current) {
      hasTrackedInitialRef.current = true;
      return;
    }
    if (prevId === playingId) return;

    // Optimistic bump
    setSong(prev => prev ? { ...prev, playCount: prev.playCount + 1, playsToday: prev.playsToday + 1 } : prev);

    axiosInstance.post(`/v1/media/song/${song.id}/play?userId=${userId}`)
      .catch(err => {
        console.error('Failed to track song play:', err);
        setSong(prev => prev ? {
          ...prev,
          playCount: Math.max(0, prev.playCount - 1),
          playsToday: Math.max(0, prev.playsToday - 1),
        } : prev);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMedia?.id, currentMedia?.songId, song?.id, userId]);

  // ── Load whether this song is on the user's do-not-play list ──
  useEffect(() => {
    if (!song?.id || !userId) { setIsBlocked(false); return; }
    let active = true;
    axiosInstance.get('/v1/playlists/blocked-songs')
      .then(res => { if (active) setIsBlocked((res.data || []).some((b: any) => b.songId === song.id)); })
      .catch(err => console.error('Failed to load do-not-play status:', err));
    return () => { active = false; };
  }, [song?.id, userId]);

  // Refresh only lyrics/description after the wizard saves (matches web fetchSongData).
  const refreshSong = async () => {
    try {
      const res = await axiosInstance.get(`/v1/media/song/${songId}`);
      const d = res.data;
      setSong(prev => prev ? { ...prev, lyrics: d.lyrics || '', description: d.description || prev.description } : prev);
    } catch (err) { console.error('Failed to refresh song:', err); }
  };

  // ── Player sync for THIS song (mirrors web) ──
  const isThisSongLoaded =
    !!currentMedia && !!song &&
    (currentMedia.id === song.id || currentMedia.songId === song.id);
  const isThisSongPlaying = isThisSongLoaded && isPlaying;

  const handlePlay = () => {
    if (!song?.url) { Alert.alert('Unavailable', 'Song not available for playback'); return; }
    requestPlay({
      id: song.id,
      songId: song.id,
      title: song.title,
      artist: song.artist,
      url: song.url,
      artwork: song.artwork,
      jurisdiction: song.jurisdiction,
    });
  };

  const handleHeroPlayClick = () => {
    if (isThisSongLoaded) togglePlayPause();
    else handlePlay();
  };

  const handleVote = () => {
    if (!userId) { Alert.alert('Login Required', 'Please log in to vote.'); return; }
    if (!song) return;
    setSelectedNominee({
      id: song.id,
      name: song.title,
      type: 'song',
      jurisdiction: song.jurisdiction,
      genreId: song.genreId, // ★ real UUID beats name-derived lookup in the wizard
      artwork: song.artwork,
      artworkUrl: song.artwork,
    });
    setShowVotingWizard(true);
  };

  const handleLike = async () => {
    if (!userId) { Alert.alert('Login Required', 'Please log in to like songs'); return; }
    if (!song?.id) return;
    try {
      if (isLiked) {
        const res = await axiosInstance.delete(`/v1/media/song/${song.id}/like?userId=${userId}`);
        if (res.data.success) { setIsLiked(false); setLikeCount(p => Math.max(0, p - 1)); }
      } else {
        const res = await axiosInstance.post(`/v1/media/song/${song.id}/like?userId=${userId}`);
        if (res.data.success) { setIsLiked(true); setLikeCount(p => p + 1); }
      }
    } catch (err) { console.error('Failed to toggle like:', err); Alert.alert('Error', 'Failed to update like. Please try again.'); }
  };

  const handleFollow = async () => {
    if (!song?.artistId) return;
    const newStatus = !isFollowing;
    setIsFollowing(newStatus);
    try {
      if (newStatus) await axiosInstance.post(`/v1/users/${song.artistId}/follow`);
      else await axiosInstance.delete(`/v1/users/${song.artistId}/follow`);
    } catch (err) { console.error('Failed to toggle follow:', err); setIsFollowing(!newStatus); }
  };

  // ── "Don't Play" — persists to the blocked_songs backend (matches web). ──
  const handleDontPlay = async () => {
    if (!userId) { Alert.alert('Login Required', 'Please log in to manage your do-not-play list.'); return; }
    if (!song?.id) return;
    try {
      if (isBlocked) {
        await axiosInstance.delete(`/v1/playlists/blocked-songs/${song.id}`);
        setIsBlocked(false);
      } else {
        await axiosInstance.post('/v1/playlists/blocked-songs', { songId: song.id });
        setIsBlocked(true);
      }
    } catch (err) {
      console.error('Failed to toggle do-not-play:', err);
      Alert.alert('Error', 'Failed to update your do-not-play list. Please try again.');
    }
  };

  // ── Report — opens the infringement form with this song's URL pre-filled. ──
  const handleReport = () => {
    if (!song?.id) return;
    const songUrl = `${WEB_ORIGIN}/song/${song.id}`;
    Linking.openURL(`${WEB_ORIGIN}/report?url=${encodeURIComponent(songUrl)}`)
      .catch(err => console.error('Failed to open report form:', err));
  };

  const handleCopyLink = async () => {
    try {
      await ExpoClipboard.setStringAsync(`${WEB_ORIGIN}/song/${song?.id}`);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) { console.error('Failed to copy link:', err); }
  };

  const handleArtistClick = () => { if (song?.artistId) navigation.navigate('Artist', { artistId: song.artistId }); };
  const handleJurisdictionClick = () => { if (song?.jurisdiction) navigation.navigate('Jurisdiction', { jurisdictionName: song.jurisdiction }); };

  const isOwner = !!userId && song?.artistId === userId;

  // ── Loading / Error ──
  if (loading) {
    return (
      <View style={s.loadingWrap}>
        <ActivityIndicator size="large" color={accent} />
        <Text style={s.loadingText}>Loading song...</Text>
      </View>
    );
  }
  if (error || !song) {
    return (
      <View style={s.loadingWrap}>
        <Text style={s.errorText}>{error || 'Song not found'}</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={[s.goBackBtn, { borderColor: accent }]}>
          <Text style={[s.goBackBtnText, { color: accent }]}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <ImageBackground source={{ uri: song.artwork }} style={StyleSheet.absoluteFillObject} blurRadius={30}>
        <LinearGradient colors={['rgba(13,15,20,0.7)', C.bgPrimary]} style={StyleSheet.absoluteFillObject} />
      </ImageBackground>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View style={{ opacity: fadeAnim, width: '100%' }}>

          {/* ═══ HERO ═══ */}
          <View style={s.hero}>
            <Image source={{ uri: song.artwork }} style={s.albumArt} />
            <View style={s.heroInfo}>
              <TouchableOpacity
                onPress={handleJurisdictionClick}
                accessibilityRole="button"
                accessibilityLabel={`View the ${song.jurisdiction} jurisdiction`}
              >
                <Text style={[s.jurisdiction, { color: accent }]}>{song.jurisdiction}</Text>
              </TouchableOpacity>
              <Text style={s.title}>
                {song.title}
                {song.explicit && <Text style={s.explicit}>  Explicit</Text>}
              </Text>
              <TouchableOpacity
                style={s.artistRow}
                onPress={handleArtistClick}
                accessibilityRole="button"
                accessibilityLabel={`View ${song.artist}'s artist page`}
              >
                <View style={[s.artistAvatar, !song.artistPhoto && { backgroundColor: accentDim, justifyContent: 'center', alignItems: 'center' }]}>
                  {song.artistPhoto
                    ? <Image source={{ uri: song.artistPhoto }} style={s.artistAvatarImg} />
                    : <Text style={[s.artistInitial, { color: accent }]}>{song.artist?.charAt(0).toUpperCase()}</Text>}
                </View>
                <Text style={s.artistName}>{song.artist}</Text>
              </TouchableOpacity>
              <View style={s.meta}>
                <Text style={s.metaText}>{formatDuration(song.duration)}</Text>
                <View style={s.dot} />
                <Text style={s.metaText}>{formatNumber(song.playCount)} plays</Text>
                <View style={s.dot} />
                <Text style={s.metaText}>{formatDate(song.createdAt)}</Text>
                <View style={s.genrePill}><Text style={s.genreText}>{song.genre}</Text></View>
              </View>
            </View>
          </View>

          {/* ═══ PRIMARY ACTIONS ═══ */}
          <View style={s.primaryActions}>
            <TouchableOpacity
              style={[s.btnPlay, { backgroundColor: accent }]}
              onPress={handleHeroPlayClick}
              accessibilityRole="button"
              accessibilityLabel={isThisSongPlaying ? 'Pause' : 'Play'}
            >
              {isThisSongPlaying ? <PauseGlyph /> : <PlayGlyph />}
              <Text style={s.btnPlayText}>{isThisSongPlaying ? 'Pause' : 'Play'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btnVote, { borderColor: accent }]} onPress={handleVote} accessibilityRole="button">
              <Text style={s.btnVoteText}>Vote</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.btnLike, { borderColor: accent }, isLiked && { backgroundColor: accent }]}
              onPress={handleLike}
              accessibilityRole="button"
              accessibilityState={{ selected: isLiked }}
            >
              <Heart size={16} color={isLiked ? '#fff' : C.textSecondary} fill={isLiked ? '#fff' : 'none'} />
              <Text style={[s.btnLikeText, isLiked && s.btnLikeTextActive]}>{isLiked ? 'Liked' : 'Like'}</Text>
            </TouchableOpacity>
          </View>

          {/* ═══ STATS ═══ */}
          {song.playsToday > 100 && (
            <Text style={s.hotStat}>{formatNumber(song.playsToday)} plays today</Text>
          )}

          {/* ═══ SECONDARY ACTIONS — Don't Play · Report · Copy Link (matches web) ═══ */}
          <View style={s.secondaryActions}>
            <TouchableOpacity
              style={[s.actionBtn, isBlocked && { backgroundColor: accentDim, borderColor: hexToRgba(accent, 0.3) }]}
              onPress={handleDontPlay}
              accessibilityRole="button"
              accessibilityState={{ selected: isBlocked }}
              accessibilityLabel={isBlocked ? `Allow ${song.title} to play again` : `Never play ${song.title}`}
            >
              <Text style={[s.actionBtnText, isBlocked && { color: accent }]}>{isBlocked ? "Won't Play ✓" : "Don't Play"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.actionBtn} onPress={handleReport} accessibilityRole="button">
              <Text style={s.actionBtnText}>Report</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.actionBtn} onPress={handleCopyLink} accessibilityRole="button">
              <Text style={s.actionBtnText} accessibilityLiveRegion="polite">{copySuccess ? 'Copied!' : 'Copy Link'}</Text>
            </TouchableOpacity>
          </View>

          {/* ═══ LYRICS ═══ */}
          {(song.lyrics || isOwner) && (
            <View style={s.section}>
              <View style={s.lyricsHeader}>
                <Text style={s.sectionLabel}>Lyrics</Text>
                {isOwner && (
                  <TouchableOpacity
                    style={[s.editBtn, { backgroundColor: accentDim }]}
                    onPress={() => setShowLyricsWizard(true)}
                    accessibilityRole="button"
                  >
                    <FileText size={13} color={accent} />
                    <Text style={[s.editBtnText, { color: accent }]}>{song.lyrics ? 'Edit' : 'Add Lyrics'}</Text>
                  </TouchableOpacity>
                )}
              </View>
              {song.lyrics ? <Text style={s.lyricsBody}>{song.lyrics}</Text> : null}
            </View>
          )}

          {/* ═══ COMMENTS ═══ */}
          <View style={s.section}>
            <CommentSection songId={song.id} userId={userId} songArtistId={song.artistId} />
          </View>

          {/* ═══ SIDEBAR (stacked on mobile) ═══ */}
          <View style={s.sidebar}>
            <View style={s.sidebarSection}>
              <Text style={s.sidebarTitle}>Song Details</Text>
              <View style={s.detailsGrid}>
                <View style={s.detailCard}><Text style={s.detailLabel}>Duration</Text><Text style={s.detailValue}>{formatDuration(song.duration)}</Text></View>
                <View style={s.detailCard}><Text style={s.detailLabel}>Uploaded</Text><Text style={s.detailValue}>{formatDate(song.createdAt)}</Text></View>
                <View style={s.detailCard}><Text style={s.detailLabel}>Plays</Text><Text style={s.detailValue}>{formatNumber(song.playCount)}</Text></View>
                <View style={s.detailCard}><Text style={s.detailLabel}>Likes</Text><Text style={s.detailValue}>{formatNumber(likeCount)}</Text></View>
              </View>
            </View>

            <View style={s.sidebarSection}>
              <Text style={s.sidebarTitle}>Artist</Text>
              <TouchableOpacity
                style={s.artistCard}
                onPress={handleArtistClick}
                accessibilityRole="button"
                accessibilityLabel={`View ${song.artist}'s artist page`}
              >
                <View style={[s.artistCardAvatar, !song.artistPhoto && { backgroundColor: accentDim, justifyContent: 'center', alignItems: 'center' }]}>
                  {song.artistPhoto
                    ? <Image source={{ uri: song.artistPhoto }} style={s.artistCardAvatarImg} />
                    : <Text style={[s.artistCardInitial, { color: accent }]}>{song.artist?.charAt(0).toUpperCase()}</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.artistCardName}>{song.artist}</Text>
                  <Text style={s.artistCardJur}>{song.jurisdiction}</Text>
                </View>
                <TouchableOpacity
                  style={[s.followBtn, { backgroundColor: accentDim }, isFollowing && { backgroundColor: accent }]}
                  onPress={handleFollow}
                  accessibilityRole="button"
                >
                  <Text style={[s.followBtnText, { color: accent }, isFollowing && s.followBtnTextActive]}>{isFollowing ? 'Following' : 'Follow'}</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            </View>

            {song.description && song.description !== 'No description available' && (
              <View style={s.sidebarSection}>
                <Text style={s.sidebarTitle}>About</Text>
                <Text style={s.aboutText}>{song.description}</Text>
              </View>
            )}

            <View style={s.sidebarSection}>
              <Text style={s.sidebarTitle}>Credits</Text>
              {[{ role: 'Producer', name: song.credits.producer }, { role: 'Writer', name: song.credits.writer }, { role: 'Mix', name: song.credits.mix }].map((c, i) => (
                <View key={i} style={s.creditRow}>
                  <Text style={s.creditRole}>{c.role}</Text>
                  <Text style={s.creditName}>{c.name}</Text>
                </View>
              ))}
            </View>
          </View>

        </Animated.View>
        {/* Keep content clear of the fixed mini-player tray when a track is loaded. */}
        <View style={{ height: currentMedia ? 120 : 40 }} />
      </ScrollView>

      {showLyricsWizard && (
        <LyricsWizard
          visible={showLyricsWizard}
          onClose={() => setShowLyricsWizard(false)}
          onSuccess={refreshSong}
          song={{ id: song.id, songId: song.id, lyrics: song.lyrics } as any}
        />
      )}

      <VotingWizard
        visible={showVotingWizard}
        onClose={() => { setShowVotingWizard(false); setSelectedNominee(null); }}
        onVoteSuccess={() => { setShowVotingWizard(false); refreshSong(); }}
        nominee={selectedNominee}
        userId={userId || ''}
        filters={{ selectedGenre: song.genre.toLowerCase().replace('/', '-'), selectedType: 'song', selectedInterval: 'daily', selectedJurisdiction: song.jurisdiction.toLowerCase().replace(' ', '-') }}
      />
    </View>
  );
};

// Hero play/pause glyphs — drawn with Views so no extra icon import is needed.
const PlayGlyph = () => (
  <View style={{ width: 0, height: 0, borderTopWidth: 6, borderBottomWidth: 6, borderLeftWidth: 10, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: '#fff', marginRight: 2 }} />
);
const PauseGlyph = () => (
  <View style={{ flexDirection: 'row', gap: 3 }}>
    <View style={{ width: 3, height: 12, backgroundColor: '#fff', borderRadius: 1 }} />
    <View style={{ width: 3, height: 12, backgroundColor: '#fff', borderRadius: 1 }} />
  </View>
);

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bgPrimary },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingTop: 8 },
  loadingWrap: { flex: 1, backgroundColor: C.bgPrimary, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: C.textSecondary, marginTop: 12 },
  errorText: { color: C.accentRed, fontSize: 15, marginBottom: 16 },
  goBackBtn: { borderWidth: 1, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 24 },
  goBackBtnText: { fontSize: 14 },

  // Hero
  hero: { flexDirection: IS_MOBILE ? 'column' : 'row', alignItems: IS_MOBILE ? 'center' : 'flex-end', gap: IS_MOBILE ? 20 : 28, marginBottom: 20 },
  albumArt: { width: ARTWORK_SIZE, height: ARTWORK_SIZE, borderRadius: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.5, shadowRadius: 24, elevation: 8 },
  heroInfo: { flex: 1, alignItems: IS_MOBILE ? 'center' : 'flex-start', minWidth: 0 },
  jurisdiction: { fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 },
  title: { fontSize: IS_MOBILE ? 28 : 36, fontWeight: '700', color: C.textPrimary, letterSpacing: -0.5, textAlign: IS_MOBILE ? 'center' : 'left', marginBottom: 10 },
  explicit: { color: C.accentRed, fontSize: 12, fontWeight: '700' },
  artistRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  artistAvatar: { width: 28, height: 28, borderRadius: 14, overflow: 'hidden' },
  artistAvatarImg: { width: '100%', height: '100%' },
  artistInitial: { fontSize: 12, fontWeight: '600' },
  artistName: { fontSize: 15, fontWeight: '500', color: C.textPrimary },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 6, justifyContent: IS_MOBILE ? 'center' : 'flex-start' },
  metaText: { fontSize: 13, color: C.textSecondary },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: C.textTertiary },
  genrePill: { backgroundColor: C.bgSurface, borderWidth: 1, borderColor: C.borderDefault, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  genreText: { fontSize: 11, color: C.textTertiary },

  // Primary actions
  primaryActions: { flexDirection: 'row', gap: 10, marginBottom: 16, flexWrap: 'wrap', justifyContent: IS_MOBILE ? 'center' : 'flex-start' },
  btnPlay: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 24, borderRadius: 6 },
  btnPlayText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  btnVote: { paddingVertical: 10, paddingHorizontal: 28, borderWidth: 2, borderRadius: 6 },
  btnVoteText: { color: C.textPrimary, fontSize: 14, fontWeight: '600' },
  btnLike: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 18, borderWidth: 2, borderRadius: 6 },
  btnLikeText: { color: C.textSecondary, fontSize: 14, fontWeight: '600' },
  btnLikeTextActive: { color: '#fff' },

  hotStat: { color: C.accentGreen, fontWeight: '600', fontSize: 13, marginBottom: 12, textAlign: IS_MOBILE ? 'center' : 'left' },

  // Secondary actions
  secondaryActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: C.borderDefault, justifyContent: IS_MOBILE ? 'center' : 'flex-start' },
  actionBtn: { paddingVertical: 8, paddingHorizontal: 14, borderWidth: 1, borderColor: C.borderHover, borderRadius: 6 },
  actionBtnText: { color: C.textSecondary, fontSize: 13, fontWeight: '500' },

  // Sections
  section: { marginBottom: 24 },
  lyricsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionLabel: { fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: C.textTertiary },
  lyricsBody: { fontSize: 15, lineHeight: 30, color: C.textSecondary },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6 },
  editBtnText: { fontSize: 12, fontWeight: '500' },

  // Sidebar (stacked below on mobile)
  sidebar: { backgroundColor: C.bgSecondary, borderRadius: 12, padding: 20, marginTop: 8 },
  sidebarSection: { marginBottom: 24 },
  sidebarTitle: { fontSize: 11, fontWeight: '600', letterSpacing: 1.8, textTransform: 'uppercase', color: C.textTertiary, marginBottom: 12 },
  detailsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  detailCard: { backgroundColor: C.bgTertiary, borderRadius: 8, padding: 12, minWidth: '45%', flex: 1 },
  detailLabel: { fontSize: 10, color: C.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  detailValue: { fontSize: 14, fontWeight: '500', color: C.textPrimary },

  artistCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.bgTertiary, borderRadius: 12, padding: 12 },
  artistCardAvatar: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden' },
  artistCardAvatarImg: { width: '100%', height: '100%' },
  artistCardInitial: { fontSize: 16, fontWeight: '600' },
  artistCardName: { fontSize: 14, fontWeight: '500', color: C.textPrimary, marginBottom: 2 },
  artistCardJur: { fontSize: 11, color: C.textTertiary },
  followBtn: { borderRadius: 6, paddingVertical: 6, paddingHorizontal: 14 },
  followBtnText: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
  followBtnTextActive: { color: '#fff' },

  aboutText: { fontSize: 13, lineHeight: 20, color: C.textSecondary },
  creditRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.borderDefault },
  creditRole: { fontSize: 11, color: C.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
  creditName: { fontSize: 13, color: C.textSecondary },
});

export default SongScreen;