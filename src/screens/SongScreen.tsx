// src/screens/SongScreen.tsx
// Full port of web songPage.jsx — two-column layout (stacked on mobile),
// text-label buttons, ambient sidebar, ms→s duration fix, artist photo

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
  Share,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Heart } from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import * as ExpoClipboard from 'expo-clipboard';

import { usePlayer } from '../context/PlayerContext';
import axiosInstance, { getMediaUrl } from '../services/axiosInstance';
import VotingWizard from '../components/VotingWizard';
import CommentSection from '../components/Commentsection';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IS_MOBILE = SCREEN_WIDTH < 768;
const ARTWORK_SIZE = IS_MOBILE ? Math.min(SCREEN_WIDTH - 64, 260) : 220;

// ─── Design tokens (matching web songPage.scss) ──────────────
const C = {
  bgPrimary: '#0d0f14',
  bgSecondary: '#141720',
  bgTertiary: '#1a1d28',
  bgSurface: 'rgba(255,255,255,0.03)',
  textPrimary: '#e8e6e1',
  textSecondary: '#9a978f',
  textTertiary: '#5f5d58',
  unisBlue: '#163387',
  unisBlueHover: '#1e44a8',
  unisBlueDim: 'rgba(22,51,135,0.15)',
  unisBlueGlow: 'rgba(22,51,135,0.4)',
  accentBlue: '#4a8fe7',
  accentBlueDim: 'rgba(74,143,231,0.15)',
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

const SongScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { playMedia } = usePlayer();
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const songId = route.params?.songId;

  const [song, setSong] = useState<Song | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [showVotingWizard, setShowVotingWizard] = useState(false);
  const [selectedNominee, setSelectedNominee] = useState<any>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const atob = (input: string): string => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let str = input.replace(/=+$/, ''); let output = '';
    for (let bc = 0, bs = 0, buffer, i = 0; (buffer = str.charAt(i++)); ) {
      buffer = chars.indexOf(buffer) as any; if ((buffer as number) === -1) continue;
      bs = bc % 4 ? bs * 64 + (buffer as number) : (buffer as number);
      if (bc++ % 4) output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)));
    }
    return output;
  };

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

  // ── Init ──
  useEffect(() => {
    const getUserId = async () => {
      try {
        const token = await SecureStore.getItemAsync('token');
        if (token) setUserId(JSON.parse(atob(token.split('.')[1])).userId);
      } catch {}
    };
    getUserId();
  }, []);

  useEffect(() => { if (songId) fetchSongData(); }, [songId]);

  useEffect(() => {
    if (!song?.id || !userId) return;
    const fetchLikes = async () => {
      try {
        const [likedRes, countRes] = await Promise.all([
          axiosInstance.get(`/v1/media/song/${song.id}/is-liked?userId=${userId}`),
          axiosInstance.get(`/v1/media/song/${song.id}/likes/count`),
        ]);
        setIsLiked(likedRes.data.isLiked || false);
        setLikeCount(countRes.data.count || 0);
      } catch { setIsLiked(false); setLikeCount(0); }
    };
    fetchLikes();
  }, [song?.id, userId]);

  const fetchSongData = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axiosInstance.get(`/v1/media/song/${songId}`);
      const d = res.data;
      setSong({
        id: d.songId,
        title: d.title,
        artist: d.artist?.username || 'Unknown',
        artistId: d.artist?.userId || '',
        artistPhoto: getMediaUrl(d.artist?.photoUrl) || null,
        jurisdiction: d.jurisdiction?.name || 'Unknown',
        genre: d.genre?.name || 'Unknown',
        artwork: getMediaUrl(d.artworkUrl) || 'https://picsum.photos/400',
        url: getMediaUrl(d.fileUrl) || null,
        description: d.description || 'No description available.',
        playCount: d.playCount || 0,
        playsToday: d.playsToday || 0,
        score: d.score || 0,
        explicit: d.explicit || false,
        lyrics: d.lyrics || '',
        credits: { producer: 'N/A', writer: 'N/A', mix: 'N/A' },
        duration: d.duration ? Math.round(d.duration / 1000) : null,
        createdAt: d.createdAt || '',
      });
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    } catch { setError('Failed to load song details'); }
    finally { setLoading(false); }
  };

  // ── Handlers ──
  const handlePlay = async () => {
    if (!song?.url) { Alert.alert('Unavailable', 'Song not available for playback'); return; }
    playMedia({ id: song.id, songId: song.id, title: song.title, artist: song.artist, url: song.url, artwork: song.artwork } as any, []);
    setSong(p => p ? { ...p, playCount: p.playCount + 1, playsToday: p.playsToday + 1 } : null);
    if (song.id && userId) {
      try { await axiosInstance.post(`/v1/media/song/${song.id}/play?userId=${userId}`); }
      catch { setSong(p => p ? { ...p, playCount: p.playCount - 1, playsToday: p.playsToday - 1 } : null); }
    }
  };

  const handleVote = () => {
    if (!userId) { Alert.alert('Login Required', 'Please log in to vote.'); return; }
    if (!song) return;
    setSelectedNominee({ id: song.id, name: song.title, type: 'song', jurisdiction: song.jurisdiction });
    setShowVotingWizard(true);
  };

  const handleLike = async () => {
    if (!userId) { Alert.alert('Login Required', 'Please log in to like songs'); return; }
    if (!song?.id) return;
    try {
      const res = await axiosInstance({ method: isLiked ? 'delete' : 'post', url: `/v1/media/song/${song.id}/like?userId=${userId}` });
      if (res.data.success) { setIsLiked(!isLiked); setLikeCount(p => isLiked ? Math.max(0, p - 1) : p + 1); }
    } catch { Alert.alert('Error', 'Failed to update like.'); }
  };

  const handleFollow = async () => {
    if (!userId || !song?.artistId) return;
    const prev = isFollowing; setIsFollowing(!prev);
    try {
      if (!prev) await axiosInstance.post(`/v1/users/${song.artistId}/follow`);
      else await axiosInstance.delete(`/v1/users/${song.artistId}/follow`);
    } catch { setIsFollowing(prev); }
  };

  const handleShare = async () => {
    try { await Share.share({ message: `Check out "${song?.title}" by ${song?.artist} on Unis!` }); } catch {}
  };

  const handleCopyLink = async () => {
    try { await ExpoClipboard.setStringAsync(`https://unis.app/song/${song?.id}`); setCopySuccess(true); setTimeout(() => setCopySuccess(false), 2000); } catch {}
  };

  const handleArtistClick = () => { if (song?.artistId) navigation.navigate('Artist', { artistId: song.artistId }); };
  const handleJurisdictionClick = () => { if (song?.jurisdiction) navigation.navigate('Jurisdiction', { jurisdictionName: song.jurisdiction }); };

  const isOwner = userId && song?.artistId === userId;

  // ── Loading / Error ──
  if (loading) {
    return <View style={s.loadingWrap}><ActivityIndicator size="large" color={C.unisBlue} /><Text style={s.loadingText}>Loading song...</Text></View>;
  }
  if (error || !song) {
    return <View style={s.loadingWrap}><Text style={s.errorText}>{error || 'Song not found'}</Text><TouchableOpacity onPress={() => navigation.goBack()} style={s.goBackBtn}><Text style={s.goBackBtnText}>Go Back</Text></TouchableOpacity></View>;
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
              <TouchableOpacity onPress={handleJurisdictionClick}>
                <Text style={s.jurisdiction}>{song.jurisdiction}</Text>
              </TouchableOpacity>
              <Text style={s.title}>
                {song.title}
                {song.explicit && <Text style={s.explicit}> E</Text>}
              </Text>
              <TouchableOpacity style={s.artistRow} onPress={handleArtistClick}>
                <View style={[s.artistAvatar, !song.artistPhoto && s.artistAvatarPlaceholder]}>
                  {song.artistPhoto
                    ? <Image source={{ uri: song.artistPhoto }} style={s.artistAvatarImg} />
                    : <Text style={s.artistInitial}>{song.artist?.charAt(0).toUpperCase()}</Text>}
                </View>
                <Text style={s.artistName}>{song.artist}</Text>
              </TouchableOpacity>
              <View style={s.meta}>
                <Text style={s.metaText}>{formatDuration(song.duration)}</Text>
                <View style={s.dot} />
                <Text style={s.metaText}>{formatNumber(song.playCount)} plays</Text>
                <View style={s.dot} />
                <Text style={s.metaText}>{formatDate(song.createdAt)}</Text>
              </View>
              <View style={s.genrePill}><Text style={s.genreText}>{song.genre}</Text></View>
            </View>
          </View>

          {/* ═══ PRIMARY ACTIONS ═══ */}
          <View style={s.primaryActions}>
            <TouchableOpacity style={s.btnPlay} onPress={handlePlay}><Text style={s.btnPlayText}>Play</Text></TouchableOpacity>
            <TouchableOpacity style={s.btnVote} onPress={handleVote}><Text style={s.btnVoteText}>Vote</Text></TouchableOpacity>
            <TouchableOpacity style={[s.btnLike, isLiked && s.btnLikeActive]} onPress={handleLike}>
              <Heart size={16} color={isLiked ? '#fff' : C.textSecondary} fill={isLiked ? '#fff' : 'none'} />
              <Text style={[s.btnLikeText, isLiked && s.btnLikeTextActive]}>{isLiked ? 'Liked' : 'Like'}</Text>
            </TouchableOpacity>
          </View>

          {/* ═══ STATS ═══ */}
          {song.playsToday > 100 && (
            <Text style={s.hotStat}>{formatNumber(song.playsToday)} plays today</Text>
          )}

          {/* ═══ SECONDARY ACTIONS ═══ */}
          <View style={s.secondaryActions}>
            <TouchableOpacity style={[s.actionBtn, isFollowing && s.actionBtnActive]} onPress={handleFollow}>
              <Text style={[s.actionBtnText, isFollowing && s.actionBtnTextActive]}>{isFollowing ? 'Following' : 'Follow'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.actionBtn} onPress={() => Alert.alert('Coming Soon', 'Do not play list coming soon')}>
              <Text style={s.actionBtnText}>Don't Play</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.actionBtn} onPress={() => Alert.alert('Report', 'Report functionality coming soon')}>
              <Text style={s.actionBtnText}>Report</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.actionBtn} onPress={handleShare}>
              <Text style={s.actionBtnText}>Share</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.actionBtn} onPress={handleCopyLink}>
              <Text style={s.actionBtnText}>{copySuccess ? 'Copied!' : 'Copy Link'}</Text>
            </TouchableOpacity>
          </View>

          {/* ═══ LYRICS ═══ */}
          {(song.lyrics || isOwner) && (
            <View style={s.section}>
              <Text style={s.sectionLabel}>Lyrics</Text>
              {song.lyrics ? <Text style={s.lyricsBody}>{song.lyrics}</Text> : null}
              {isOwner && (
                <TouchableOpacity style={s.editBtn} onPress={() => Alert.alert('Coming Soon', 'Lyrics editing coming soon')}>
                  <Text style={s.editBtnText}>{song.lyrics ? 'Edit Lyrics' : 'Add Lyrics'}</Text>
                </TouchableOpacity>
              )}
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
              <TouchableOpacity style={s.artistCard} onPress={handleArtistClick}>
                <View style={[s.artistCardAvatar, !song.artistPhoto && s.artistCardAvatarPlaceholder]}>
                  {song.artistPhoto
                    ? <Image source={{ uri: song.artistPhoto }} style={s.artistCardAvatarImg} />
                    : <Text style={s.artistCardInitial}>{song.artist?.charAt(0).toUpperCase()}</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.artistCardName}>{song.artist}</Text>
                  <Text style={s.artistCardJur}>{song.jurisdiction}</Text>
                </View>
                <TouchableOpacity style={[s.followBtn, isFollowing && s.followBtnActive]} onPress={handleFollow}>
                  <Text style={[s.followBtnText, isFollowing && s.followBtnTextActive]}>{isFollowing ? 'Following' : 'Follow'}</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            </View>

            {song.description && song.description !== 'No description available.' && (
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
        <View style={{ height: 120 }} />
      </ScrollView>

      <VotingWizard
        visible={showVotingWizard}
        onClose={() => { setShowVotingWizard(false); setSelectedNominee(null); }}
        onVoteSuccess={() => { setShowVotingWizard(false); fetchSongData(); }}
        nominee={selectedNominee}
        userId={userId || ''}
        filters={{ selectedGenre: song.genre.toLowerCase().replace('/', '-'), selectedType: 'song', selectedInterval: 'daily', selectedJurisdiction: song.jurisdiction.toLowerCase().replace(' ', '-') }}
      />
    </View>
  );
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bgPrimary },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingTop: 8 },
  loadingWrap: { flex: 1, backgroundColor: C.bgPrimary, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: C.textSecondary, marginTop: 12 },
  errorText: { color: C.accentRed, fontSize: 15, marginBottom: 16 },
  goBackBtn: { borderWidth: 1, borderColor: C.unisBlue, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 24 },
  goBackBtnText: { color: C.unisBlue, fontSize: 14 },

  // Hero
  hero: { flexDirection: IS_MOBILE ? 'column' : 'row', alignItems: IS_MOBILE ? 'center' : 'flex-end', gap: IS_MOBILE ? 20 : 28, marginBottom: 20 },
  albumArt: { width: ARTWORK_SIZE, height: ARTWORK_SIZE, borderRadius: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.5, shadowRadius: 24, elevation: 8 },
  heroInfo: { flex: 1, alignItems: IS_MOBILE ? 'center' : 'flex-start', minWidth: 0 },
  jurisdiction: { fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: C.accentBlue, marginBottom: 6 },
  title: { fontSize: IS_MOBILE ? 28 : 36, fontWeight: '700', color: C.textPrimary, letterSpacing: -0.5, textAlign: IS_MOBILE ? 'center' : 'left', marginBottom: 10 },
  explicit: { color: C.accentRed, fontSize: 12, fontWeight: '700' },
  artistRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  artistAvatar: { width: 28, height: 28, borderRadius: 14, overflow: 'hidden' },
  artistAvatarPlaceholder: { backgroundColor: C.accentBlueDim, justifyContent: 'center', alignItems: 'center' },
  artistAvatarImg: { width: '100%', height: '100%' },
  artistInitial: { color: C.accentBlue, fontSize: 12, fontWeight: '600' },
  artistName: { fontSize: 15, fontWeight: '500', color: C.textPrimary },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 6 },
  metaText: { fontSize: 13, color: C.textSecondary },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: C.textTertiary },
  genrePill: { backgroundColor: C.bgSurface, borderWidth: 1, borderColor: C.borderDefault, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  genreText: { fontSize: 11, color: C.textTertiary },

  // Primary actions
  primaryActions: { flexDirection: 'row', gap: 10, marginBottom: 16, flexWrap: 'wrap', justifyContent: IS_MOBILE ? 'center' : 'flex-start' },
  btnPlay: { paddingVertical: 10, paddingHorizontal: 28, backgroundColor: C.unisBlue, borderRadius: 6 },
  btnPlayText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  btnVote: { paddingVertical: 10, paddingHorizontal: 28, borderWidth: 2, borderColor: C.unisBlue, borderRadius: 6 },
  btnVoteText: { color: C.textPrimary, fontSize: 14, fontWeight: '600' },
  btnLike: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 18, borderWidth: 2, borderColor: C.unisBlue, borderRadius: 6 },
  btnLikeActive: { backgroundColor: C.unisBlue },
  btnLikeText: { color: C.textSecondary, fontSize: 14, fontWeight: '600' },
  btnLikeTextActive: { color: '#fff' },

  hotStat: { color: C.accentGreen, fontWeight: '600', fontSize: 13, marginBottom: 12, textAlign: IS_MOBILE ? 'center' : 'left' },

  // Secondary actions
  secondaryActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: C.borderDefault, justifyContent: IS_MOBILE ? 'center' : 'flex-start' },
  actionBtn: { paddingVertical: 8, paddingHorizontal: 14, borderWidth: 1, borderColor: C.borderHover, borderRadius: 6 },
  actionBtnActive: { backgroundColor: C.accentBlueDim, borderColor: 'rgba(74,143,231,0.3)' },
  actionBtnText: { color: C.textSecondary, fontSize: 13, fontWeight: '500' },
  actionBtnTextActive: { color: C.accentBlue },

  // Sections
  section: { marginBottom: 24 },
  sectionLabel: { fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: C.textTertiary, marginBottom: 12 },
  lyricsBody: { fontSize: 15, lineHeight: 30, color: C.textSecondary },
  editBtn: { marginTop: 12, alignSelf: IS_MOBILE ? 'center' : 'flex-start', backgroundColor: C.accentBlueDim, paddingVertical: 6, paddingHorizontal: 14, borderRadius: 6 },
  editBtnText: { color: C.accentBlue, fontSize: 12, fontWeight: '500' },

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
  artistCardAvatarPlaceholder: { backgroundColor: C.accentBlueDim, justifyContent: 'center', alignItems: 'center' },
  artistCardAvatarImg: { width: '100%', height: '100%' },
  artistCardInitial: { color: C.accentBlue, fontSize: 16, fontWeight: '600' },
  artistCardName: { fontSize: 14, fontWeight: '500', color: C.textPrimary, marginBottom: 2 },
  artistCardJur: { fontSize: 11, color: C.textTertiary },
  followBtn: { backgroundColor: C.accentBlueDim, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 14 },
  followBtnActive: { backgroundColor: C.accentBlue },
  followBtnText: { color: C.accentBlue, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
  followBtnTextActive: { color: '#fff' },

  aboutText: { fontSize: 13, lineHeight: 20, color: C.textSecondary },
  creditRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.borderDefault },
  creditRole: { fontSize: 11, color: C.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
  creditName: { fontSize: 13, color: C.textSecondary },
});

export default SongScreen;