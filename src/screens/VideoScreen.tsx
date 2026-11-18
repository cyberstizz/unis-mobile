// src/screens/VideoScreen.tsx
// ─────────────────────────────────────────────────────────────
// Mobile port of web src/videoPage.jsx — modeled on YouTube's mobile watch
// page: 16:9 player pinned at the top, title → meta → artist row → action
// chips → expandable description, comments directly below. Videos are not
// votable and win no awards, so there is no Vote flow here.
//
// Playback rule: the inline video and the global audio player are mutually
// exclusive. Starting the video pauses the player; starting the player
// pauses the video. One play is tracked per visit (logged-in only).
//
// If the video fails to load, a diagnostic card shows the player's error,
// the stored and resolved URLs, and a HEAD probe of the file (status,
// Content-Type, Accept-Ranges).
// ─────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import * as Clipboard from 'expo-clipboard';
import { ChevronDown, ChevronUp, Flag, Heart, Link as LinkIcon } from 'lucide-react-native';
import axiosInstance from '../services/axiosInstance';
import { buildUrl } from '../utils/buildUrl';
import { usePlayer } from '../context/PlayerContext';
import { useAuth } from '../context/AuthContext';
import { useFeedback, errorMessage } from '../context/FeedbackContext';
import { useReward } from '../context/RewardContext';
import { useUnisTheme } from '../theme/unisTheme';
import { webUrl } from '../config/links';
import CommentSection from '../components/Commentsection';

const FALLBACK = require('../../assets/theQuiet.jpg');

const formatDuration = (seconds: number | null) => {
  if (!seconds) return '--:--';
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
};
const formatDate = (dateString?: string) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const diffDays = Math.floor((Date.now() - date.getTime()) / 86400000);
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

const VideoScreen: React.FC = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const videoId: string = route.params?.videoId;
  const t = useUnisTheme();
  const { isPlaying, togglePlayPause } = usePlayer();
  const { user } = useAuth();
  const userId = user?.userId;
  const feedback = useFeedback();
  const { showReward } = useReward();

  const [video, setVideo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isFollowing, setIsFollowing] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [descExpanded, setDescExpanded] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [probe, setProbe] = useState<any>(null);
  const [videoPlaying, setVideoPlaying] = useState(false);

  const videoRef = useRef<Video>(null);
  const hasTrackedPlayRef = useRef(false);

  useEffect(() => {
    if (!videoId) return undefined;
    let active = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const likedUrl = userId ? `/v1/media/video/${videoId}/is-liked?userId=${userId}` : `/v1/media/video/${videoId}/is-liked`;
        const [videoRes, likedRes, likeCountRes] = await Promise.all([
          axiosInstance.get(`/v1/media/video/${videoId}`),
          axiosInstance.get(likedUrl).catch(() => ({ data: { isLiked: false } })),
          axiosInstance.get(`/v1/media/video/${videoId}/likes/count`).catch(() => ({ data: { count: 0 } })),
        ]);
        if (!active) return;
        const d = videoRes.data;
        setVideo({
          id: d.videoId,
          title: d.title,
          artist: d.artist?.username || 'Unknown Artist',
          artistId: d.artist?.userId || null,
          artistPhoto: buildUrl(d.artist?.photoUrl) || null,
          jurisdiction: d.jurisdiction?.name || 'Unknown',
          url: buildUrl(d.videoUrl) || null,
          rawUrl: d.videoUrl || null,
          poster: buildUrl(d.artworkUrl) || null,
          description: d.description || '',
          playCount: d.playCount || 0,
          playsToday: d.playsToday || 0,
          duration: d.duration ? Math.round(d.duration / 1000) : null,
          createdAt: d.createdAt,
          genre: d.genre?.name || null,
        });
        setIsLiked(likedRes.data.isLiked || false);
        setLikeCount(likeCountRes.data.count || 0);
      } catch (err) {
        console.error('Failed to load video:', err);
        if (active) setError('Failed to load video details');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [videoId, userId]);

  useEffect(() => {
    hasTrackedPlayRef.current = false;
    setDescExpanded(false);
    setMediaError(null);
    setProbe(null);
  }, [videoId]);

  // Global player started → pause the inline video.
  useEffect(() => {
    if (isPlaying && videoPlaying) videoRef.current?.pauseAsync().catch(() => {});
  }, [isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pause when leaving the screen.
  useEffect(() => navigation.addListener('blur', () => { videoRef.current?.pauseAsync().catch(() => {}); }), [navigation]);

  const handleVideoPlay = useCallback(() => {
    if (isPlaying) togglePlayPause();
    if (hasTrackedPlayRef.current || !video?.id || !userId) return;
    hasTrackedPlayRef.current = true;
    setVideo((prev: any) => (prev ? { ...prev, playCount: prev.playCount + 1, playsToday: prev.playsToday + 1 } : prev));
    axiosInstance.post(`/v1/media/video/${video.id}/play?userId=${userId}`).catch((err) => {
      console.error('Failed to track video play:', err);
      hasTrackedPlayRef.current = false;
      setVideo((prev: any) => (prev ? { ...prev, playCount: Math.max(0, prev.playCount - 1), playsToday: Math.max(0, prev.playsToday - 1) } : prev));
    });
  }, [isPlaying, togglePlayPause, video?.id, userId]);

  const onStatus = (s: AVPlaybackStatus) => {
    if (!s.isLoaded) return;
    if (s.isPlaying && !videoPlaying) handleVideoPlay();
    setVideoPlaying(s.isPlaying);
  };

  const onVideoError = async (msg: string) => {
    setMediaError(msg || 'The player reported an error without details.');
    console.error('[VideoScreen] playback failed', { msg, rawUrl: video?.rawUrl, resolvedUrl: video?.url });
    if (!video?.url) return;
    try {
      const res = await fetch(video.url, { method: 'HEAD' });
      setProbe({ status: res.status, contentType: res.headers.get('content-type'), acceptRanges: res.headers.get('accept-ranges') });
    } catch (err: any) {
      setProbe({ error: err?.message || 'Request failed (unreachable host)' });
    }
  };

  const handleLike = async () => {
    if (!userId) { feedback.info('Log in to like videos'); return; }
    if (!video?.id) return;
    const name = `“${video.title}”`;
    try {
      if (isLiked) {
        const res = await axiosInstance.delete(`/v1/media/video/${video.id}/like?userId=${userId}`);
        if (res.data.success) {
          setIsLiked(false); setLikeCount((p) => Math.max(0, p - 1));
          feedback.info(`Removed ${name} from your likes`, { id: 'video-like' });
        } else feedback.error("Couldn't remove your like. Try again.");
      } else {
        const res = await axiosInstance.post(`/v1/media/video/${video.id}/like?userId=${userId}`);
        if (res.data.success) {
          setIsLiked(true); setLikeCount((p) => p + 1);
          const earned = res.data.pointsAwarded;
          if (earned > 0) showReward({ points: earned, label: 'Like counted', type: 'like', anchor: 'player' });
          else feedback.success(`Liked ${name}`, { id: 'video-like' });
        } else feedback.error("Couldn't like this video. Try again.");
      }
    } catch (err) {
      console.error('Failed to toggle like:', err);
      feedback.error(errorMessage(err, isLiked ? "Couldn't remove your like. Try again." : "Couldn't like this video. Try again."));
    }
  };

  const handleFollow = async () => {
    if (!video?.artistId) return;
    const next = !isFollowing;
    const who = video.artist || 'this artist';
    setIsFollowing(next);
    try {
      if (next) await axiosInstance.post(`/v1/users/${video.artistId}/follow`);
      else await axiosInstance.delete(`/v1/users/${video.artistId}/follow`);
      feedback.success(next ? `Following ${who}` : `Unfollowed ${who}`, { id: 'video-follow' });
    } catch (err) {
      console.error('Failed to toggle follow:', err);
      setIsFollowing(!next);
      feedback.error(errorMessage(err, next ? `Couldn't follow ${who}. Try again.` : `Couldn't unfollow ${who}. Try again.`));
    }
  };

  const pageUrl = webUrl(`/video/${videoId}`);
  const handleReport = () => Linking.openURL(webUrl(`/report?url=${encodeURIComponent(pageUrl)}`)).catch(() => {});
  const handleCopyLink = async () => {
    try {
      await Clipboard.setStringAsync(pageUrl);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
      feedback.success('Link copied', { id: 'copy-link' });
    } catch {
      feedback.info(`Copy this link: ${pageUrl}`);
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={t.primary} size="large" /><Text style={styles.muted}>Loading video...</Text></View>;
  if (error || !video) return <View style={styles.center}><Text style={styles.err}>{error || 'Video not found'}</Text></View>;

  const hasDescription = Boolean(video.description && video.description.trim());

  return (
    <View style={{ flex: 1 }}>
      {/* Pinned player */}
      <View style={styles.player}>
        {video.url ? (
          <Video
            ref={videoRef}
            style={StyleSheet.absoluteFill}
            source={{ uri: video.url }}
            posterSource={video.poster ? { uri: video.poster } : FALLBACK}
            usePoster
            posterStyle={{ resizeMode: 'cover' }}
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
            onPlaybackStatusUpdate={onStatus}
            onError={onVideoError}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.center]}><Text style={styles.muted}>Video unavailable</Text></View>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.page}>
        {!!mediaError && (
          <View style={styles.diag} accessibilityRole="alert">
            <Text style={styles.diagTitle}>This video didn't load</Text>
            <Text style={styles.diagHint}>{mediaError}</Text>
            {[
              ['Stored URL', video.rawUrl || '(null)'],
              ['Resolved URL', video.url || '(null)'],
              ...(probe && !probe.error ? [
                ['HTTP status', String(probe.status)],
                ['Content-Type', probe.contentType || '(none)'],
                ['Accept-Ranges', probe.acceptRanges || '(none — seeking and iOS playback will fail)'],
              ] : []),
              ...(probe?.error ? [['Probe', probe.error]] : []),
            ].map(([k, v]) => (
              <View key={k} style={styles.diagRow}><Text style={styles.diagK}>{k}</Text><Text style={styles.diagV} selectable>{v}</Text></View>
            ))}
          </View>
        )}

        <Text style={styles.title}>{video.title}</Text>
        <View style={styles.metaLine}>
          <Text style={styles.meta}>{formatNumber(video.playCount)} plays</Text>
          <View style={styles.dot} />
          <Text style={styles.meta}>{formatDate(video.createdAt)}</Text>
          {!!video.genre && <Text style={styles.genre}>{video.genre}</Text>}
          {video.playsToday > 100 && <Text style={styles.hot}>{formatNumber(video.playsToday)} today</Text>}
        </View>

        <View style={styles.artistRow}>
          <Pressable style={styles.artistTap} onPress={() => video.artistId && navigation.navigate('Artist', { artistId: video.artistId })} accessibilityRole="button">
            <View style={[styles.avatar, { backgroundColor: t.soft }]}>
              {video.artistPhoto ? <Image source={{ uri: video.artistPhoto }} style={StyleSheet.absoluteFill} /> : <Text style={[styles.initial, { color: t.textAccent }]}>{video.artist?.charAt(0).toUpperCase() || '?'}</Text>}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.artistName} numberOfLines={1}>{video.artist}</Text>
              <Text style={styles.artistJur}>{video.jurisdiction}</Text>
            </View>
          </Pressable>
          <Pressable style={[styles.follow, isFollowing ? styles.following : { backgroundColor: '#fff' }]} onPress={handleFollow}>
            <Text style={[styles.followText, !isFollowing && { color: '#0b0b0f' }]}>{isFollowing ? 'Following' : 'Follow'}</Text>
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Pressable style={[styles.chip, isLiked && { backgroundColor: t.primary }]} onPress={handleLike} accessibilityState={{ selected: isLiked }}>
            <Heart size={15} color="#fff" fill={isLiked ? '#fff' : 'none'} />
            <Text style={styles.chipText}>{formatNumber(likeCount)}</Text>
          </Pressable>
          <Pressable style={styles.chip} onPress={handleCopyLink}>
            <LinkIcon size={15} color="#fff" />
            <Text style={styles.chipText}>{copySuccess ? 'Copied!' : 'Copy Link'}</Text>
          </Pressable>
          <Pressable style={styles.chip} onPress={handleReport}>
            <Flag size={15} color="#fff" />
            <Text style={styles.chipText}>Report</Text>
          </Pressable>
        </ScrollView>

        <Pressable style={styles.desc} onPress={() => { if (!descExpanded) setDescExpanded(true); }}>
          <View style={styles.metaLine}>
            <Text style={styles.descStat}>{formatNumber(video.playCount)} plays</Text>
            <View style={styles.dot} />
            <Text style={styles.descStat}>{formatDate(video.createdAt)}</Text>
            <View style={styles.dot} />
            <Text style={styles.descStat}>{formatDuration(video.duration)}</Text>
          </View>
          <Text style={[styles.descText, !hasDescription && { color: 'rgba(255,255,255,0.45)' }]} numberOfLines={descExpanded ? undefined : 2}>
            {hasDescription ? video.description : 'No description'}
          </Text>
          <Pressable style={styles.descToggle} onPress={() => setDescExpanded((p) => !p)} hitSlop={6}>
            <Text style={styles.descToggleText}>{descExpanded ? 'Show less' : '...more'}</Text>
            {descExpanded ? <ChevronUp size={13} color="#fff" /> : <ChevronDown size={13} color="#fff" />}
          </Pressable>
        </Pressable>

        <View style={{ marginTop: 16 }}>
          <CommentSection videoId={video.id} userId={userId} artistId={video.artistId} />
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  muted: { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
  err: { color: '#fca5a5', fontSize: 15 },
  player: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' },
  page: { padding: 14, paddingBottom: 160 },
  diag: { padding: 14, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(248,113,113,0.5)', backgroundColor: 'rgba(220,38,38,0.08)', marginBottom: 14, gap: 6 },
  diagTitle: { color: '#fff', fontWeight: '800', fontSize: 15 },
  diagHint: { color: 'rgba(255,255,255,0.75)', fontSize: 13 },
  diagRow: { gap: 2 },
  diagK: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  diagV: { color: '#fff', fontSize: 12, fontFamily: 'Courier' },
  title: { color: '#fff', fontSize: 20, fontWeight: '800', lineHeight: 25 },
  metaLine: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6 },
  meta: { color: 'rgba(255,255,255,0.6)', fontSize: 13 },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: 'rgba(255,255,255,0.4)' },
  genre: { color: 'rgba(255,255,255,0.7)', fontSize: 11.5, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  hot: { color: '#4ade80', fontSize: 12.5, fontWeight: '700' },
  artistRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  artistTap: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  avatar: { width: 40, height: 40, borderRadius: 20, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  initial: { fontWeight: '900', fontSize: 16 },
  artistName: { color: '#fff', fontWeight: '700', fontSize: 15 },
  artistJur: { color: 'rgba(255,255,255,0.55)', fontSize: 12 },
  follow: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999 },
  following: { backgroundColor: 'rgba(255,255,255,0.1)' },
  followText: { color: '#fff', fontWeight: '800', fontSize: 13.5 },
  chips: { gap: 8, marginTop: 14 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.1)' },
  chipText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  desc: { marginTop: 14, padding: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)' },
  descStat: { color: '#fff', fontWeight: '700', fontSize: 12.5 },
  descText: { color: 'rgba(255,255,255,0.85)', fontSize: 14, lineHeight: 20, marginTop: 6 },
  descToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, alignSelf: 'flex-start' },
  descToggleText: { color: '#fff', fontWeight: '800', fontSize: 13 },
});

export default VideoScreen;
