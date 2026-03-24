import { getMediaUrl } from '../services/axiosInstance';
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
  Animated,
  PanResponder,
  ImageBackground,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as SecureStore from 'expo-secure-store';
import { Heart, Vote, ChevronUp, ChevronDown, Download, Plus } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';

import { usePlayer } from '../context/PlayerContext';
import axiosInstance from '../services/axiosInstance';
import UnisPlayButton from './Unisplaybutton';
import UnisPauseButton from './Unispausebutton';
import VotingWizard from './VotingWizard';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const IS_MOBILE = SCREEN_WIDTH <= 600;

// ─── Design tokens — updated to match web player.scss ────────
const COLORS = {
  bgBase: '#0a0a0c',
  bgSurface: '#111114',
  bgElevated: '#18181c',
  bgHover: '#1f1f24',
  textPrimary: '#f0f0f2',
  textSecondary: 'rgba(255,255,255,0.55)',
  textTertiary: 'rgba(255,255,255,0.35)',
  borderSubtle: 'rgba(255,255,255,0.06)',
  borderMedium: 'rgba(255,255,255,0.1)',
  unisBlue: '#163387',
  unisBlueBright: '#1c41ad',
  unisBlueGlow: 'rgba(22,51,135,0.3)',
  textSilver: '#C0C0C0',
  textGray: '#A9A9A9',
  accentWhite: '#FFFFFF',
};

interface TriangleProps {
  size?: number;
  color?: string;
  direction: 'left' | 'right';
}

const Triangle: React.FC<TriangleProps> = ({ size = 24, color = COLORS.unisBlue, direction }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    {direction === 'left' ? (
      <Path d="M18 4 L6 12 L18 20 Z" fill={color} />
    ) : (
      <Path d="M6 4 L18 12 L6 20 Z" fill={color} />
    )}
  </Svg>
);

const SEEKBAR_HEIGHT = 4;
const THUMB_SIZE = 18;
const ARTWORK_SIZE = 50;
const ARTWORK_SIZE_MOBILE = 42;
const PLAY_BUTTON_SIZE = 50;
const PLAY_BUTTON_SIZE_MOBILE = 42;
const ACTION_BUTTON_SIZE = 38;
const EXPANDED_ARTWORK_SIZE = Math.min(350, SCREEN_WIDTH - 40);
const TRAY_MAX_HEIGHT = 120;

interface VoteNominee {
  id: string;
  name: string;
  type: 'song';
  genreKey: string;
  jurisdiction: string;
}

const Player: React.FC = () => {
  const insets = useSafeAreaInsets();
  const {
    currentMedia,
    isPlaying,
    isExpanded,
    isBuffering,
    position,
    duration,
    togglePlayPause,
    next,
    prev,
    seekTo,
    toggleExpand,
  } = usePlayer();

  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [showMobileActions, setShowMobileActions] = useState(false);
  const [showVoteWizard, setShowVoteWizard] = useState(false);
  const [voteNominee, setVoteNominee] = useState<VoteNominee | null>(null);
  const [voteLoading, setVoteLoading] = useState(false);

  const mobileActionsHeight = useRef(new Animated.Value(0)).current;
  const seekbarRef = useRef<View>(null);
  const seekbarLayout = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const durationRef = useRef(0);

  useEffect(() => { durationRef.current = duration; }, [duration]);

  // ── Extract userId from JWT ──
  useEffect(() => {
    const getUserId = async () => {
      try {
        const token = await SecureStore.getItemAsync('token');
        if (token) {
          const payload = JSON.parse(atob(token.split('.')[1]));
          setUserId(payload.userId);
        }
      } catch (err) { console.error('Failed to extract userId:', err); }
    };
    getUserId();
  }, []);

  // ── Fetch like status ──
  useEffect(() => {
    let isMounted = true;
    const fetchLikeStatus = async () => {
      if (!currentMedia?.id || !userId) return;
      const songId = currentMedia.id || currentMedia.songId;
      try {
        const [likedRes, countRes] = await Promise.all([
          axiosInstance.get(`/v1/media/song/${songId}/is-liked?userId=${userId}`),
          axiosInstance.get(`/v1/media/song/${songId}/likes/count`),
        ]);
        if (isMounted) {
          setIsLiked(likedRes.data.isLiked || false);
          setLikeCount(countRes.data.count || 0);
        }
      } catch {
        if (isMounted) { setIsLiked(false); setLikeCount(0); }
      }
    };
    fetchLikeStatus();
    return () => { isMounted = false; };
  }, [currentMedia?.id, userId]);

  // ── Toggle mobile actions tray ──
  const toggleMobileActions = useCallback(() => {
    Animated.timing(mobileActionsHeight, {
      toValue: showMobileActions ? 0 : TRAY_MAX_HEIGHT,
      duration: 300,
      useNativeDriver: false,
    }).start();
    setShowMobileActions(!showMobileActions);
  }, [showMobileActions, mobileActionsHeight]);

  // ── Like ──
  const handleLike = async () => {
    if (!userId) { Alert.alert('Login Required', 'Please log in to like songs'); return; }
    const songId = currentMedia?.id || currentMedia?.songId;
    if (!songId) return;
    try {
      const method = isLiked ? 'delete' : 'post';
      const res = await axiosInstance({ method, url: `/v1/media/song/${songId}/like?userId=${userId}` });
      if (res.data.success) {
        setIsLiked(!isLiked);
        setLikeCount(prev => isLiked ? Math.max(0, prev - 1) : prev + 1);
      }
    } catch (err) { console.error('Like toggle failed:', err); }
  };

  // ── Vote — same logic as web Player ──
  const handleVote = async () => {
    if (!userId) { Alert.alert('Login Required', 'Please log in to vote'); return; }
    const songId = currentMedia?.id || currentMedia?.songId;
    if (!songId) return;

    const hasFullDetails = currentMedia?.genre && currentMedia?.jurisdiction;
    let genre: string;
    let jurisdiction: string;

    if (hasFullDetails) {
      genre = currentMedia.genre!.toLowerCase().replace('/', '-');
      jurisdiction = currentMedia.jurisdiction!.toLowerCase().replace(/\s+/g, '-');
    } else {
      setVoteLoading(true);
      try {
        const res = await axiosInstance.get(`/v1/media/song/${songId}`);
        const song = res.data;
        genre = ((typeof song.genre === 'object' ? song.genre?.name : song.genre) || 'unknown').toLowerCase().replace('/', '-');
        let jurisdictionName = 'harlem';
        if (song.jurisdiction) {
          jurisdictionName = typeof song.jurisdiction === 'string' ? song.jurisdiction : song.jurisdiction.name || 'harlem';
        }
        jurisdiction = jurisdictionName.toLowerCase().replace(/\s+/g, '-');
      } catch {
        Alert.alert('Error', 'Could not load song details.');
        setVoteLoading(false);
        return;
      } finally { setVoteLoading(false); }
    }

    setVoteNominee({ id: songId, name: currentMedia?.title ?? 'Unknown', type: 'song', genreKey: genre, jurisdiction });
    setShowVoteWizard(true);
  };

  const votingFilters = useMemo(() => {
    if (!voteNominee) return undefined;
    return {
      selectedGenre: voteNominee.genreKey ?? 'unknown',
      selectedType: 'song' as const,
      selectedInterval: 'daily' as const,
      selectedJurisdiction: voteNominee.jurisdiction ?? 'unknown',
    };
  }, [voteNominee]);

  const handleAddToPlaylist = () => Alert.alert('Coming Soon', 'Playlist management will be available soon');
  const handleDownload = () => Alert.alert('Coming Soon', 'Download functionality will be available soon');

  const formatTime = (ms: number): string => {
    if (!ms || isNaN(ms)) return '0:00';
    const totalSeconds = Math.floor(ms / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (position / duration) * 100 : 0;

  const handleSeekbarLayout = useCallback((event: any) => {
    seekbarLayout.current = event.nativeEvent.layout;
  }, []);

  const seekbarPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        seekbarRef.current?.measure((x, y, width, height, pageX) => {
          if (width > 0 && durationRef.current > 0) {
            const touchX = evt.nativeEvent.pageX - pageX;
            seekTo(Math.max(0, Math.min(1, touchX / width)) * durationRef.current);
          }
        });
      },
      onPanResponderMove: (evt) => {
        seekbarRef.current?.measure((x, y, width, height, pageX) => {
          if (width > 0 && durationRef.current > 0) {
            const touchX = evt.nativeEvent.pageX - pageX;
            seekTo(Math.max(0, Math.min(1, touchX / width)) * durationRef.current);
          }
        });
      },
    })
  ).current;

  const atob = (input: string): string => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let str = input.replace(/=+$/, '');
    let output = '';
    for (let bc = 0, bs = 0, buffer, i = 0; (buffer = str.charAt(i++)); ) {
      buffer = chars.indexOf(buffer) as any;
      if ((buffer as number) === -1) continue;
      bs = bc % 4 ? bs * 64 + (buffer as number) : (buffer as number);
      if (bc++ % 4) output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)));
    }
    return output;
  };

  if (!currentMedia) return null;

  const artwork = getMediaUrl(currentMedia.artwork || currentMedia.artworkUrl) || 'https://picsum.photos/200';

  const VoteIcon = () => voteLoading
    ? <ActivityIndicator size="small" color={COLORS.textGray} />
    : <Vote size={24} color={COLORS.textGray} />;

  const VoteIconSmall = () => voteLoading
    ? <ActivityIndicator size="small" color={COLORS.textSilver} />
    : <Vote size={20} color={COLORS.textSilver} />;

  const votingWizardElement = (
    <VotingWizard
      visible={showVoteWizard}
      onClose={() => setShowVoteWizard(false)}
      onVoteSuccess={() => setShowVoteWizard(false)}
      nominee={voteNominee}
      userId={userId}
      filters={votingFilters}
    />
  );

  // ══════════════ EXPANDED VIEW ══════════════
  if (isExpanded) {
    return (
      <>
        <View style={[styles.expandedContainer, { paddingTop: insets.top }]}>
          <ImageBackground source={{ uri: artwork }} style={styles.expandedBackground} blurRadius={20}>
            <View style={styles.expandedOverlay} />
          </ImageBackground>

          <View style={styles.expandedContent}>
            <TouchableOpacity style={styles.minimizeButton} onPress={toggleExpand}>
              <Text style={styles.minimizeText}>Minimize</Text>
            </TouchableOpacity>

            <View style={styles.expandedArtworkContainer}>
              <Image source={{ uri: artwork }} style={styles.expandedArtwork} />
            </View>

            <View style={styles.expandedInfo}>
              <Text style={styles.expandedTitle} numberOfLines={1}>{currentMedia.title}</Text>
              <Text style={styles.expandedArtist} numberOfLines={1}>{currentMedia.artist}</Text>
            </View>

            <View style={styles.expandedTimeInfo}>
              <Text style={styles.timeText}>{formatTime(position)}</Text>
              <Text style={styles.timeText}>{formatTime(duration)}</Text>
            </View>

            <View style={styles.expandedSeekbarContainer} onLayout={handleSeekbarLayout} {...seekbarPanResponder.panHandlers}>
              <View style={styles.expandedSeekbarTrack}>
                <View style={[styles.expandedSeekbarProgress, { width: `${progress}%` }]} />
                <View style={[styles.expandedSeekbarThumb, { left: `${progress}%`, marginLeft: -8 }]} />
              </View>
            </View>

            <View style={styles.expandedControls}>
              <TouchableOpacity onPress={prev} style={styles.expandedControlButton}>
                <Triangle size={35} color={COLORS.accentWhite} direction="left" />
              </TouchableOpacity>
              <TouchableOpacity onPress={togglePlayPause} style={styles.expandedPlayButton}>
                {isBuffering ? <ActivityIndicator size="large" color={COLORS.unisBlue} />
                  : isPlaying ? <UnisPauseButton size={60} /> : <UnisPlayButton size={60} />}
              </TouchableOpacity>
              <TouchableOpacity onPress={next} style={styles.expandedControlButton}>
                <Triangle size={35} color={COLORS.accentWhite} direction="right" />
              </TouchableOpacity>
            </View>

            <View style={styles.expandedActions}>
              <TouchableOpacity onPress={handleLike} style={[styles.expandedActionButton, isLiked && styles.likedButton]}>
                <Heart size={24} color={isLiked ? COLORS.unisBlue : COLORS.textGray} fill={isLiked ? COLORS.unisBlue : 'none'} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleVote} style={styles.expandedActionButton} disabled={voteLoading}>
                <VoteIcon />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDownload} style={styles.expandedActionButton}>
                <Download size={24} color={COLORS.textGray} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
        {votingWizardElement}
      </>
    );
  }

  // ══════════════ MINI PLAYER ══════════════
  return (
    <>
      <View style={styles.container}>
        {/* Mobile actions tray */}
        <Animated.View style={[styles.mobileActionsTray, { height: mobileActionsHeight }]}>
          <LinearGradient colors={[COLORS.bgElevated, COLORS.bgSurface]} start={{ x: 0, y: 1 }} end={{ x: 0, y: 0 }} style={styles.trayGradient}>
            <View style={styles.trayContent}>
              <TouchableOpacity onPress={handleVote} style={styles.trayAction} disabled={voteLoading}>
                <VoteIconSmall /><Text style={styles.trayLabel}>Vote</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleAddToPlaylist} style={styles.trayAction}>
                <Plus size={20} color={COLORS.textSilver} /><Text style={styles.trayLabel}>Add</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleLike} style={[styles.trayAction, isLiked && styles.trayActionLiked]}>
                <Heart size={20} color={isLiked ? COLORS.unisBlue : COLORS.textSilver} fill={isLiked ? COLORS.unisBlue : 'none'} />
                <Text style={[styles.trayLabel, isLiked && styles.trayLabelLiked]}>{isLiked ? 'Liked' : 'Like'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDownload} style={styles.trayAction}>
                <Download size={20} color={COLORS.textSilver} /><Text style={styles.trayLabel}>Download</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Main player bar */}
        <View style={[styles.playerBar, { paddingBottom: insets.bottom }]}>
          {/* Progress bar across top */}
          <View ref={seekbarRef} style={styles.seekbar} onLayout={handleSeekbarLayout} {...seekbarPanResponder.panHandlers}>
            <View style={styles.seekbarTrack}>
              <View style={[styles.seekbarProgress, { width: `${progress}%` }]} />
            </View>
          </View>

          <View style={styles.miniPlayer}>
            {/* LEFT — Track info */}
            <TouchableOpacity style={styles.trackInfo} onPress={toggleExpand} activeOpacity={0.8}>
              <Image source={{ uri: artwork }} style={styles.miniArtwork} />
              <View style={styles.miniTextWrap}>
                <Text style={styles.miniTitle} numberOfLines={1}>{currentMedia.title}</Text>
                <Text style={styles.miniArtist} numberOfLines={1}>{currentMedia.artist}</Text>
              </View>
            </TouchableOpacity>

            {/* CENTER — Controls */}
            <View style={styles.miniControls}>
              <TouchableOpacity onPress={prev} style={styles.controlBtn}>
                <Triangle size={18} color={COLORS.textSecondary} direction="left" />
              </TouchableOpacity>
              <TouchableOpacity onPress={togglePlayPause} style={styles.playBtn}>
                {isBuffering ? <ActivityIndicator size="small" color={COLORS.accentWhite} />
                  : isPlaying ? <UnisPauseButton size={PLAY_BUTTON_SIZE_MOBILE} /> : <UnisPlayButton size={PLAY_BUTTON_SIZE_MOBILE} />}
              </TouchableOpacity>
              <TouchableOpacity onPress={next} style={styles.controlBtn}>
                <Triangle size={18} color={COLORS.textSecondary} direction="right" />
              </TouchableOpacity>
            </View>

            {/* RIGHT — Actions (desktop) or toggle (mobile) */}
            {!IS_MOBILE ? (
              <View style={styles.rightActions}>
                <TouchableOpacity onPress={handleVote} style={styles.actionBtn} disabled={voteLoading}>
                  {voteLoading ? <ActivityIndicator size="small" color={COLORS.textGray} /> : <Vote size={16} color={COLORS.textSecondary} />}
                </TouchableOpacity>
                <TouchableOpacity onPress={handleAddToPlaylist} style={styles.actionBtn}>
                  <Plus size={16} color={COLORS.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleLike} style={[styles.actionBtn, isLiked && styles.actionBtnLiked]}>
                  <Heart size={16} color={isLiked ? COLORS.unisBlue : COLORS.textSecondary} fill={isLiked ? COLORS.unisBlue : 'none'} />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleDownload} style={styles.actionBtn}>
                  <Download size={16} color={COLORS.textSecondary} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.mobileToggle} onPress={toggleMobileActions}>
                {showMobileActions ? <ChevronDown size={20} color={COLORS.textSecondary} /> : <ChevronUp size={20} color={COLORS.textSecondary} />}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
      {votingWizardElement}
    </>
  );
};

const styles = StyleSheet.create({
  // ── Shell ──
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
  },
  playerBar: {
    backgroundColor: COLORS.bgSurface,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderSubtle,
  },

  // ── Seekbar ──
  seekbar: {
    width: '100%',
    height: 12,
    justifyContent: 'center',
  },
  seekbarTrack: {
    height: SEEKBAR_HEIGHT,
    backgroundColor: 'rgba(255,255,255,0.1)',
    position: 'relative',
    overflow: 'hidden',
  },
  seekbarProgress: {
    height: '100%',
    backgroundColor: COLORS.unisBlue,
  },

  // ── Mini player 3-column ──
  miniPlayer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 64,
    paddingHorizontal: IS_MOBILE ? 10 : 20,
    paddingBottom: 4,
  },

  // LEFT
  trackInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: IS_MOBILE ? 10 : 14,
    width: IS_MOBILE ? undefined : 240,
    maxWidth: IS_MOBILE ? '35%' : undefined,
    flex: IS_MOBILE ? 0 : undefined,
  },
  miniArtwork: {
    width: IS_MOBILE ? ARTWORK_SIZE_MOBILE : ARTWORK_SIZE,
    height: IS_MOBILE ? ARTWORK_SIZE_MOBILE : ARTWORK_SIZE,
    borderRadius: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  miniTextWrap: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
  },
  miniTitle: {
    color: COLORS.textPrimary,
    fontSize: IS_MOBILE ? 12 : 13.5,
    fontWeight: '600',
  },
  miniArtist: {
    color: COLORS.textSecondary,
    fontSize: IS_MOBILE ? 10 : 12,
    marginTop: 1,
  },

  // CENTER
  miniControls: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: IS_MOBILE ? 12 : 20,
  },
  controlBtn: {
    padding: 4,
  },
  playBtn: {
    width: IS_MOBILE ? PLAY_BUTTON_SIZE_MOBILE : PLAY_BUTTON_SIZE,
    height: IS_MOBILE ? PLAY_BUTTON_SIZE_MOBILE : PLAY_BUTTON_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // RIGHT
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 16,
    width: 200,
  },
  actionBtn: {
    width: ACTION_BUTTON_SIZE,
    height: ACTION_BUTTON_SIZE,
    borderRadius: ACTION_BUTTON_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtnLiked: {
    backgroundColor: 'rgba(22,51,135,0.15)',
  },
  mobileToggle: {
    padding: 5,
    marginLeft: 8,
  },

  // ── Mobile tray ──
  mobileActionsTray: {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    right: 0,
    overflow: 'hidden',
    borderTopWidth: 1,
    borderTopColor: COLORS.borderSubtle,
  },
  trayGradient: {
    flex: 1,
    paddingVertical: 15,
    paddingHorizontal: 20,
  },
  trayContent: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  trayAction: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(22,51,135,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(22,51,135,0.3)',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minWidth: 70,
    gap: 5,
  },
  trayActionLiked: { borderColor: COLORS.unisBlue },
  trayLabel: { color: COLORS.textSilver, fontSize: 10, marginTop: 5 },
  trayLabelLiked: { color: COLORS.unisBlue },

  // ── Expanded ──
  expandedContainer: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: COLORS.bgBase,
    zIndex: 2000,
  },
  expandedBackground: { ...StyleSheet.absoluteFillObject },
  expandedOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  expandedContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  minimizeButton: { position: 'absolute', top: 20, left: 20, padding: 10, zIndex: 10 },
  minimizeText: { color: COLORS.accentWhite, fontSize: 24 },
  expandedArtworkContainer: { marginBottom: 40, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 30, elevation: 10 },
  expandedArtwork: { width: EXPANDED_ARTWORK_SIZE, height: EXPANDED_ARTWORK_SIZE, borderRadius: 12 },
  expandedInfo: { alignItems: 'center', marginBottom: 30, width: '100%', maxWidth: 500 },
  expandedTitle: { color: COLORS.accentWhite, fontSize: 24, fontWeight: '600', marginBottom: 5, textAlign: 'center' },
  expandedArtist: { color: COLORS.textSilver, fontSize: 18, textAlign: 'center' },
  expandedTimeInfo: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', maxWidth: 500, marginBottom: 10 },
  timeText: { color: COLORS.textSecondary, fontSize: 14 },
  expandedSeekbarContainer: { width: '100%', maxWidth: 500, height: 30, justifyContent: 'center', marginBottom: 30 },
  expandedSeekbarTrack: { height: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 3, position: 'relative' },
  expandedSeekbarProgress: { height: '100%', backgroundColor: COLORS.unisBlue, borderRadius: 3 },
  expandedSeekbarThumb: { position: 'absolute', top: -5, width: 16, height: 16, borderRadius: 8, backgroundColor: COLORS.unisBlue, borderWidth: 2, borderColor: COLORS.accentWhite },
  expandedControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 30, marginBottom: 20 },
  expandedControlButton: { padding: 10 },
  expandedPlayButton: { width: 60, height: 60, justifyContent: 'center', alignItems: 'center' },
  expandedActions: { flexDirection: 'row', gap: 20 },
  expandedActionButton: { padding: 10 },
  likedButton: {},
});

export default Player;