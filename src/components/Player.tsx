// src/components/Player.tsx
// ─────────────────────────────────────────────────────────────
// Mobile port of web src/player.jsx (Nov 2026).
//
// PLAY-FLOW (the Player is the ONLY place plays are recorded — screens never
// post plays; they hand songs to requestPlay):
//   1. A play counts after 15s, or 25% of the song (max 30s), whichever first.
//   2. Signed in → POST /v1/media/song/{id}/play?source=…  → { playId };
//      the server reads the listener from the session, never from the URL.
//      The "+1 pts · Play counted" pill confirms it.
//   3. When the song changes (skip, end, new choice) the outgoing play is
//      finished with POST /v1/media/play/complete { playId, percentPlayed }.
//   Logged-out plays (anonymous-play + visitorId) stay wired for parity.
//
// Likes: the "+N pts · Like counted" pill is the confirmation (pointsAwarded
// comes from the server; a re-like awards 0 and shows a toast instead).
//
// Mini player (phone layout of web's): art/title → song page, artist → artist
// page, heart, transport, queue button with count, tools tray (Comments,
// queue status, Vote, Add, Like, Download). Expanded view: full-screen art,
// scrubber, transport, like / vote / download.
//
// Web's Pocket Lock is a browser workaround for phones in pockets; the app
// uses the phone's own lock screen (music keeps playing), so it isn't ported.
// ─────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  ImageBackground,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronDown, ChevronUp, Download, Heart, ListMusic, Plus, SkipBack, SkipForward } from 'lucide-react-native';

import { usePlayer } from '../context/PlayerContext';
import { useAuth } from '../context/AuthContext';
import { useReward } from '../context/RewardContext';
import { useFeedback, errorMessage } from '../context/FeedbackContext';
import axiosInstance from '../services/axiosInstance';
import { getVisitorId } from '../utils/visitorId';
import { openScreen } from '../navigation/navigationRef';
import { useUnisTheme, mix } from '../theme/unisTheme';
import { CommentIcon, VoteIcon, PlayGlyph, PauseGlyph } from '../icons/UnisIcons';
import VotingWizard from './VotingWizard';
import PlaylistWizard from './PlaylistWizard';
import QueuePanel from './QueuePanel';
import DownloadModal from './DownloadModal';
import Sheet from './ui/Sheet';
import CommentSection from './Commentsection';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const EXPANDED_ART = Math.min(350, SCREEN_WIDTH - 48);

const formatTime = (ms: number) => {
  if (!ms || isNaN(ms)) return '0:00';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
};

const Player: React.FC = () => {
  const insets = useSafeAreaInsets();
  const t = useUnisTheme();
  const { user, isGuest } = useAuth();
  const { showReward } = useReward();
  const feedback = useFeedback();
  const {
    currentMedia, isPlaying, isExpanded, isBuffering, position, duration, queue,
    togglePlayPause, next, prev, seekTo, toggleExpand, setExpanded,
    showPlaylistManager, closePlaylistManager,
  } = usePlayer();

  const userId = user?.userId ?? null;

  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [trayOpen, setTrayOpen] = useState(false);
  const [showVoteWizard, setShowVoteWizard] = useState(false);
  const [voteData, setVoteData] = useState<{ nominee: any; filters: any } | null>(null);
  const [showPlaylistWizard, setShowPlaylistWizard] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [showDownload, setShowDownload] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [seekPreview, setSeekPreview] = useState<number | null>(null);

  const trayAnim = useRef(new Animated.Value(0)).current;
  const barWidth = useRef(1);
  const durationRef = useRef(0);
  durationRef.current = duration;

  // ── PLAY-FLOW refs ──
  const playRewardedRef = useRef(false);
  const activeSongIdRef = useRef<string | null>(null);
  const currentPlayIdRef = useRef<string | null>(null);
  const currentPlayIsAnonRef = useRef(false);
  const lastPercentRef = useRef(0);

  const songId = currentMedia?.id || currentMedia?.songId || null;

  useEffect(() => {
    if (duration > 0) lastPercentRef.current = Math.min(100, (position / duration) * 100);
  }, [position, duration]);

  const completeCurrentPlay = useCallback(() => {
    const playId = currentPlayIdRef.current;
    if (!playId) return;
    currentPlayIdRef.current = null;
    const percentPlayed = Math.round(lastPercentRef.current * 100) / 100;
    if (currentPlayIsAnonRef.current) {
      currentPlayIsAnonRef.current = false;
      getVisitorId()
        .then((visitorId) => axiosInstance.post('/v1/media/anonymous-play/complete', { playId, visitorId, percentPlayed }))
        .catch((err) => console.error('Logged-out play completion failed:', err));
      return;
    }
    axiosInstance
      .post('/v1/media/play/complete', { playId, percentPlayed })
      .catch((err) => console.error('Play completion failed:', err));
  }, []);

  // Song changed → finish the outgoing play, reset the gate.
  useEffect(() => {
    const id = currentMedia?.qid || songId;
    if (!id || activeSongIdRef.current === id) return;
    completeCurrentPlay();
    activeSongIdRef.current = id;
    playRewardedRef.current = false;
    lastPercentRef.current = 0;
  }, [currentMedia?.qid, songId, completeCurrentPlay]);

  // Queue cleared / player unmounted → finish the play.
  useEffect(() => {
    if (!currentMedia) {
      completeCurrentPlay();
      activeSongIdRef.current = null;
    }
  }, [currentMedia, completeCurrentPlay]);
  useEffect(() => () => completeCurrentPlay(), [completeCurrentPlay]);

  // The 15s / 25% gate.
  useEffect(() => {
    if (!currentMedia || !songId || playRewardedRef.current) return;
    if (currentMedia.type === 'video') return;
    const sec = position / 1000;
    const dur = duration / 1000;
    const reachedMinimum = sec >= 15;
    const reachedPercent = dur > 0 && sec >= Math.min(dur * 0.25, 30);
    if (!reachedMinimum && !reachedPercent) return;
    playRewardedRef.current = true;
    const source = encodeURIComponent(currentMedia.source || 'player');

    if (isGuest || !userId) {
      getVisitorId()
        .then((visitorId) =>
          axiosInstance.post(`/v1/media/song/${songId}/anonymous-play?visitorId=${encodeURIComponent(visitorId)}&source=${source}`),
        )
        .then((res) => {
          currentPlayIdRef.current = res?.data?.playId || null;
          currentPlayIsAnonRef.current = Boolean(res?.data?.playId);
        })
        .catch((err) => console.error('Failed to record logged-out play:', err));
      return;
    }

    axiosInstance
      .post(`/v1/media/song/${songId}/play?source=${source}`)
      .then((res) => {
        currentPlayIdRef.current = res?.data?.playId || null;
        currentPlayIsAnonRef.current = false;
        // Only a counted play earns the point (30-minute cooldown per song).
        if (res?.data?.counted !== false) {
          showReward({ points: 1, label: 'Play counted', type: 'play', anchor: 'player' });
        }
      })
      .catch((err) => {
        console.error('Failed to track rewarded play:', err);
        playRewardedRef.current = false; // allow retry
      });
  }, [currentMedia, songId, position, duration, isGuest, userId, showReward]);

  // ── Like status ──
  useEffect(() => {
    let alive = true;
    if (!songId || !userId) {
      setIsLiked(false);
      setLikeCount(0);
      return;
    }
    axiosInstance.get(`/v1/media/song/${songId}/is-liked?userId=${userId}`)
      .then((res) => { if (alive) setIsLiked(res.data.isLiked || false); })
      .catch(() => { if (alive) setIsLiked(false); });
    axiosInstance.get(`/v1/media/song/${songId}/likes/count`)
      .then((res) => { if (alive) setLikeCount(res.data.count || 0); })
      .catch(() => { if (alive) setLikeCount(0); });
    return () => { alive = false; };
  }, [songId, userId]);

  const handleLike = async () => {
    if (!songId || !userId) return;
    const wasLiked = isLiked;
    try {
      const res = await axiosInstance({ method: wasLiked ? 'delete' : 'post', url: `/v1/media/song/${songId}/like?userId=${userId}` });
      if (res.data.success) {
        const nextLiked = !wasLiked;
        setIsLiked(nextLiked);
        setLikeCount((p) => (wasLiked ? Math.max(0, p - 1) : p + 1));
        const earned = res.data.pointsAwarded;
        const title = currentMedia?.title ? `“${currentMedia.title}”` : 'this song';
        if (nextLiked && (earned === undefined || earned > 0)) {
          showReward({ points: earned || 1, label: 'Like counted', type: 'like', anchor: 'player' });
        } else if (nextLiked) {
          feedback.success(`Liked ${title}`, { id: 'player-like' });
        } else {
          feedback.info(`Removed ${title} from your likes`, { id: 'player-like' });
        }
      } else {
        feedback.error(wasLiked ? "Couldn't remove your like. Try again." : "Couldn't like this song. Try again.");
      }
    } catch (err) {
      console.error('Like toggle failed:', err);
      feedback.error(errorMessage(err, wasLiked ? "Couldn't remove your like. Try again." : "Couldn't like this song. Try again."));
    }
  };

  // ── Vote (ironclad: real jurisdiction + genre ids from the song) ──
  const handleVote = async () => {
    if (!currentMedia) return;
    const safeId = currentMedia.id || currentMedia.songId;
    const safeTitle = currentMedia.title || 'Unknown Song';
    const safeArtist = currentMedia.artist || 'Unknown Artist';
    if (!safeId) {
      feedback.error("Can't vote on this track right now. Open its song page and vote from there.");
      return;
    }
    setVoteData(null);
    try {
      const res = await axiosInstance.get(`/v1/media/song/${safeId}`);
      const songData = res.data;
      let jurisdictionName = 'Harlem';
      if (songData.jurisdiction) {
        jurisdictionName = typeof songData.jurisdiction === 'string' ? songData.jurisdiction : songData.jurisdiction.name || jurisdictionName;
      }
      setVoteData({
        nominee: {
          id: safeId,
          name: safeTitle,
          type: 'song',
          jurisdiction: jurisdictionName,
          jurisdictionId: songData.jurisdiction?.jurisdictionId || null,
          genreId: songData.genre?.genreId || null,
          genreKey: songData.genre?.name || 'rap-hiphop',
          artist: safeArtist,
          artwork: currentMedia.artwork,
          artworkUrl: songData.artworkUrl || currentMedia.artworkUrl,
          imageUrl: songData.imageUrl || currentMedia.imageUrl,
        },
        filters: {
          selectedType: 'song',
          selectedGenre: (songData.genre?.name || 'rap-hiphop').toLowerCase().replace('/', '-'),
          selectedInterval: 'daily',
          selectedJurisdiction: jurisdictionName.toLowerCase().replace(/\s+/g, '-'),
        },
      });
    } catch (err) {
      console.error('Vote fetch error:', err);
    }
    setShowVoteWizard(true);
  };

  const fallbackNominee = useMemo(() => {
    if (!currentMedia) return null;
    return {
      id: currentMedia.id || currentMedia.songId,
      name: currentMedia.title,
      type: 'song',
      jurisdiction: currentMedia.jurisdiction,
      genreKey: currentMedia.genreKey || 'rap-hiphop',
      artist: currentMedia.artist,
      artwork: currentMedia.artwork,
      artworkUrl: currentMedia.artworkUrl,
    };
  }, [currentMedia]);

  // ── Navigation ──
  const goToSong = () => {
    if (!songId) return;
    setExpanded(false);
    openScreen('Song', { songId });
  };
  const goToArtist = () => {
    const artistId = currentMedia?.artistId || currentMedia?.artist_id;
    if (!artistId) return;
    setExpanded(false);
    openScreen('Artist', { artistId });
  };

  // ── Tray ──
  const toggleTray = () => {
    Animated.timing(trayAnim, { toValue: trayOpen ? 0 : 1, duration: 260, useNativeDriver: false }).start();
    setTrayOpen(!trayOpen);
  };
  const closeTray = () => {
    if (!trayOpen) return;
    Animated.timing(trayAnim, { toValue: 0, duration: 200, useNativeDriver: false }).start();
    setTrayOpen(false);
  };

  // ── Seekbar ──
  const seekPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => setSeekPreview(Math.min(1, Math.max(0, e.nativeEvent.locationX / barWidth.current))),
        onPanResponderMove: (e) => setSeekPreview(Math.min(1, Math.max(0, e.nativeEvent.locationX / barWidth.current))),
        onPanResponderRelease: (e) => {
          const r = Math.min(1, Math.max(0, e.nativeEvent.locationX / barWidth.current));
          seekTo(r * durationRef.current);
          setSeekPreview(null);
        },
        onPanResponderTerminate: () => setSeekPreview(null),
      }),
    [seekTo],
  );

  const progress = seekPreview ?? (duration > 0 ? position / duration : 0);
  const shownPosition = seekPreview != null ? seekPreview * duration : position;
  const artwork = currentMedia?.artwork || currentMedia?.artworkUrl || null;

  const modals = (
    <>
      <VotingWizard
        visible={showVoteWizard}
        onClose={() => { setShowVoteWizard(false); setVoteData(null); }}
        onVoteSuccess={() => setShowVoteWizard(false)}
        nominee={(voteData?.nominee || fallbackNominee) as any}
        userId={userId as any}
        filters={(voteData?.filters || { selectedType: 'song' }) as any}
      />
      <PlaylistWizard open={showPlaylistWizard || showPlaylistManager} onClose={() => { setShowPlaylistWizard(false); closePlaylistManager(); }} selectedTrack={currentMedia} />
      <QueuePanel open={showQueue} onClose={() => setShowQueue(false)} />
      <DownloadModal
        isOpen={showDownload}
        onClose={() => setShowDownload(false)}
        song={currentMedia ? {
          id: currentMedia.id || currentMedia.songId,
          title: currentMedia.title || 'Untitled',
          artist: currentMedia.artist || 'Unknown Artist',
          artworkUrl: currentMedia.artwork,
          fileName: `${currentMedia.artist || 'Artist'} - ${currentMedia.title || 'Track'}.mp3`,
        } : {}}
      />
      {currentMedia && (
        <Sheet visible={showComments} onClose={() => setShowComments(false)} title="Comments" fullHeight>
          <CommentSection songId={songId as string} userId={userId} songArtistId={currentMedia.artistId || ''} embedded />
        </Sheet>
      )}
    </>
  );

  if (!currentMedia) return modals;

  // ══════════ EXPANDED ══════════
  if (isExpanded) {
    return (
      <>
        <View style={[styles.expanded, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          {artwork ? <ImageBackground source={{ uri: artwork }} style={StyleSheet.absoluteFill} blurRadius={24} /> : null}
          <LinearGradient colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0.85)']} style={StyleSheet.absoluteFill} />
          <Pressable onPress={toggleExpand} style={styles.minimize} accessibilityLabel="Minimize">
            <Text style={styles.minimizeText}>Minimize</Text>
          </Pressable>
          <View style={styles.expandedBody}>
            <Pressable onPress={goToSong}>
              {artwork ? (
                <Image source={{ uri: artwork }} style={styles.expandedArt} />
              ) : (
                <View style={[styles.expandedArt, { backgroundColor: t.soft }]} />
              )}
            </Pressable>
            <Pressable onPress={goToSong} style={{ marginTop: 28, alignItems: 'center' }}>
              <Text style={styles.expandedTitle} numberOfLines={1}>{currentMedia.title}</Text>
            </Pressable>
            <Pressable onPress={goToArtist}>
              <Text style={styles.expandedArtist} numberOfLines={1}>{currentMedia.artist}</Text>
            </Pressable>

            <View style={styles.timeRow}>
              <Text style={styles.time}>{formatTime(shownPosition)}</Text>
              <Text style={styles.time}>{formatTime(duration)}</Text>
            </View>
            <View style={styles.bigSeek} onLayout={(e) => { barWidth.current = e.nativeEvent.layout.width || 1; }} {...seekPan.panHandlers}>
              <View style={styles.bigTrack}>
                <View style={[styles.bigFill, { width: `${progress * 100}%`, backgroundColor: t.primary2 }]} />
                <View style={[styles.bigKnob, { left: `${progress * 100}%`, borderColor: t.primary2 }]} />
              </View>
            </View>

            <View style={styles.bigControls}>
              <Pressable onPress={prev} style={styles.bigSkip} accessibilityLabel="Previous"><SkipBack size={30} color="#fff" fill="#fff" /></Pressable>
              <Pressable onPress={togglePlayPause} style={[styles.bigPlay, { backgroundColor: '#fff' }]} accessibilityLabel={isPlaying ? 'Pause' : 'Play'}>
                {isBuffering ? <ActivityIndicator color={t.primary} /> : isPlaying ? <PauseGlyph size={32} color="#0b0c10" /> : <PlayGlyph size={32} color="#0b0c10" />}
              </Pressable>
              <Pressable onPress={next} style={styles.bigSkip} accessibilityLabel="Next"><SkipForward size={30} color="#fff" fill="#fff" /></Pressable>
            </View>

            <View style={styles.bigActions}>
              <Pressable onPress={handleLike} style={styles.bigAction} accessibilityLabel={isLiked ? 'Unlike' : 'Like'} accessibilityState={{ selected: isLiked }}>
                <Heart size={24} color={isLiked ? '#fff' : 'rgba(255,255,255,0.75)'} fill={isLiked ? '#fff' : 'none'} />
                {likeCount > 0 && <Text style={styles.likeCount}>{likeCount}</Text>}
              </Pressable>
              <Pressable onPress={handleVote} style={styles.bigAction} accessibilityLabel="Vote for this song">
                <VoteIcon size={26} color="rgba(255,255,255,0.8)" />
              </Pressable>
              <Pressable onPress={() => setShowPlaylistWizard(true)} style={styles.bigAction} accessibilityLabel="Add to playlist or queue">
                <Plus size={24} color="rgba(255,255,255,0.8)" />
              </Pressable>
              <Pressable onPress={() => setShowDownload(true)} style={styles.bigAction} accessibilityLabel="Download">
                <Download size={22} color="rgba(255,255,255,0.8)" />
              </Pressable>
              <Pressable onPress={() => setShowQueue(true)} style={styles.bigAction} accessibilityLabel="Queue">
                <ListMusic size={22} color="rgba(255,255,255,0.8)" />
              </Pressable>
            </View>
          </View>
        </View>
        {modals}
      </>
    );
  }

  // ══════════ MINI PLAYER ══════════
  const trayHeight = trayAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 168] });
  const surface = mix(t.primary, '#0b0c10', 0.92);

  return (
    <>
      <View style={styles.container} pointerEvents="box-none">
        <Animated.View style={[styles.tray, { height: trayHeight, opacity: trayAnim }]}>
          <LinearGradient colors={[mix(t.primary, '#14151b', 0.86), surface]} style={styles.trayShell}>
            <View style={styles.trayHandle} />
            <View style={styles.trayHeader}>
              <Text style={[styles.trayKicker, { color: t.textAccent }]}>Now playing tools</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Pressable onPress={() => { closeTray(); setShowComments(true); }} style={styles.trayComments} accessibilityLabel="Open comments">
                  <CommentIcon size={13} color="#fff" />
                  <Text style={styles.trayCommentsText}>Comments</Text>
                </Pressable>
                <View style={[styles.statusPill, { backgroundColor: t.soft }]}>
                  <Text style={styles.statusText}>{queue.length > 0 ? `${queue.length} in queue` : 'Live session'}</Text>
                </View>
              </View>
            </View>
            <View style={styles.trayRow}>
              {[
                { key: 'vote', label: 'Vote', hint: 'Influence', icon: <VoteIcon size={20} color="#fff" />, onPress: () => { closeTray(); handleVote(); }, featured: true },
                { key: 'add', label: 'Add', hint: 'Playlist', icon: <Plus size={20} color="#fff" />, onPress: () => { closeTray(); setShowPlaylistWizard(true); } },
                {
                  key: 'like',
                  label: isLiked ? 'Liked' : 'Like',
                  hint: likeCount > 0 ? `${likeCount} total` : 'Support',
                  icon: <Heart size={20} color="#fff" fill={isLiked ? '#fff' : 'none'} />,
                  onPress: handleLike,
                  active: isLiked,
                },
                { key: 'dl', label: 'Download', hint: 'Offline', icon: <Download size={18} color="#fff" />, onPress: () => { closeTray(); setShowDownload(true); } },
              ].map((a) => (
                <Pressable
                  key={a.key}
                  onPress={a.onPress}
                  style={({ pressed }) => [
                    styles.trayAction,
                    (a.featured || a.active) && { backgroundColor: t.soft, borderColor: t.border },
                    pressed && { transform: [{ scale: 0.95 }] },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={a.label}
                >
                  {a.icon}
                  <Text style={styles.trayLabel}>{a.label}</Text>
                  <Text style={styles.trayHint}>{a.hint}</Text>
                </Pressable>
              ))}
            </View>
          </LinearGradient>
        </Animated.View>

        <View style={[styles.bar, { backgroundColor: surface }]}>
          <View style={styles.seek} onLayout={(e) => { barWidth.current = e.nativeEvent.layout.width || 1; }} {...seekPan.panHandlers}>
            <View style={styles.seekTrack}>
              <View style={[styles.seekFill, { width: `${progress * 100}%`, backgroundColor: t.primary2 }]} />
            </View>
          </View>

          <View style={styles.mini}>
            <Pressable onPress={toggleExpand} onLongPress={goToSong} style={styles.trackInfo} accessibilityLabel="Expand player">
              {artwork ? <Image source={{ uri: artwork }} style={styles.miniArt} /> : <View style={[styles.miniArt, { backgroundColor: t.soft }]} />}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.miniTitle} numberOfLines={1} onPress={goToSong}>{currentMedia.title}</Text>
                <Text style={styles.miniArtist} numberOfLines={1} onPress={goToArtist}>{currentMedia.artist}</Text>
              </View>
            </Pressable>
            <Pressable onPress={handleLike} hitSlop={6} style={styles.heart} accessibilityLabel={isLiked ? 'Unlike' : 'Like'}>
              <Heart size={18} color={isLiked ? t.primary2 : 'rgba(255,255,255,0.6)'} fill={isLiked ? t.primary2 : 'none'} />
            </Pressable>
            <Pressable onPress={prev} hitSlop={6} style={styles.ctrl} accessibilityLabel="Previous"><SkipBack size={18} color="#fff" fill="#fff" /></Pressable>
            <Pressable onPress={togglePlayPause} style={[styles.play, { backgroundColor: '#fff' }]} accessibilityLabel={isPlaying ? 'Pause' : 'Play'}>
              {isBuffering ? <ActivityIndicator size="small" color={t.primary} /> : isPlaying ? <PauseGlyph size={20} color="#0b0c10" /> : <PlayGlyph size={20} color="#0b0c10" />}
            </Pressable>
            <Pressable onPress={next} hitSlop={6} style={styles.ctrl} accessibilityLabel="Next"><SkipForward size={18} color="#fff" fill="#fff" /></Pressable>
            <Pressable onPress={toggleTray} hitSlop={6} style={styles.ctrl} accessibilityLabel={trayOpen ? 'Hide tools' : 'Show tools'}>
              {trayOpen ? <ChevronDown size={20} color="rgba(255,255,255,0.7)" /> : <ChevronUp size={20} color="rgba(255,255,255,0.7)" />}
            </Pressable>
            <Pressable onPress={() => { closeTray(); setShowQueue(true); }} hitSlop={6} style={styles.ctrl} accessibilityLabel={`Queue${queue.length ? ` (${queue.length})` : ''}`}>
              <ListMusic size={19} color="rgba(255,255,255,0.8)" />
              {queue.length > 0 && (
                <View style={[styles.badge, { backgroundColor: t.primary }]}>
                  <Text style={styles.badgeText}>{queue.length > 99 ? '99+' : queue.length}</Text>
                </View>
              )}
            </Pressable>
          </View>
        </View>
      </View>
      {modals}
    </>
  );
};

const styles = StyleSheet.create({
  container: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 1000 },
  tray: { overflow: 'hidden' },
  trayShell: { flex: 1, paddingHorizontal: 14, paddingTop: 8, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  trayHandle: { alignSelf: 'center', width: 34, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)', marginBottom: 8 },
  trayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  trayKicker: { fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  trayComments: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)' },
  trayCommentsText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  statusPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  statusText: { color: '#fff', fontSize: 11.5, fontWeight: '600' },
  trayRow: { flexDirection: 'row', gap: 8 },
  trayAction: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.04)' },
  trayLabel: { color: '#fff', fontSize: 12.5, fontWeight: '700', marginTop: 2 },
  trayHint: { color: 'rgba(255,255,255,0.5)', fontSize: 10.5 },
  bar: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)' },
  seek: { height: 12, justifyContent: 'center' },
  seekTrack: { height: 3, backgroundColor: 'rgba(255,255,255,0.1)' },
  seekFill: { height: 3 },
  mini: { flexDirection: 'row', alignItems: 'center', height: 60, paddingHorizontal: 10, gap: 4 },
  trackInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  miniArt: { width: 42, height: 42, borderRadius: 7 },
  miniTitle: { color: '#f0f0f2', fontSize: 13.5, fontWeight: '600' },
  miniArtist: { color: 'rgba(255,255,255,0.55)', fontSize: 11.5, marginTop: 1 },
  heart: { width: 32, height: 40, alignItems: 'center', justifyContent: 'center' },
  ctrl: { width: 32, height: 40, alignItems: 'center', justifyContent: 'center' },
  play: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginHorizontal: 2 },
  badge: { position: 'absolute', top: 4, right: -2, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 9.5, fontWeight: '800' },
  expanded: { ...StyleSheet.absoluteFillObject, zIndex: 2000, backgroundColor: '#0a0a0c' },
  minimize: { position: 'absolute', top: 54, left: 20, padding: 8, zIndex: 10 },
  minimizeText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  expandedBody: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  expandedArt: { width: EXPANDED_ART, height: EXPANDED_ART, borderRadius: 14 },
  expandedTitle: { color: '#fff', fontSize: 24, fontWeight: '700', textAlign: 'center' },
  expandedArtist: { color: 'rgba(255,255,255,0.7)', fontSize: 17, marginTop: 4, textAlign: 'center' },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', maxWidth: 500, marginTop: 28 },
  time: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontVariant: ['tabular-nums'] },
  bigSeek: { width: '100%', maxWidth: 500, height: 30, justifyContent: 'center' },
  bigTrack: { height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.15)' },
  bigFill: { height: 5, borderRadius: 3 },
  bigKnob: { position: 'absolute', top: -6, width: 17, height: 17, borderRadius: 9, marginLeft: -8, backgroundColor: '#fff', borderWidth: 2 },
  bigControls: { flexDirection: 'row', alignItems: 'center', gap: 34, marginTop: 14 },
  bigSkip: { padding: 8 },
  bigPlay: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  bigActions: { flexDirection: 'row', gap: 18, marginTop: 28 },
  bigAction: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10 },
  likeCount: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600' },
});

export default Player;
