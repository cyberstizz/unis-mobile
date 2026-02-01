// src/components/Player.tsx
// Full-featured audio player - ported from web Player.jsx
// Supports mini mode (bottom bar) and expanded mode (fullscreen)
// Uses expo-linear-gradient to match web SCSS gradients exactly

import React, { useState, useEffect, useCallback, useRef } from 'react';
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

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const IS_MOBILE = SCREEN_WIDTH <= 600;

// Design tokens from player.scss
const COLORS = {
  bgBlack: '#000000',
  bgDark: '#1A1A1A',
  bgDarker: '#242424',
  textSilver: '#C0C0C0',
  textGray: '#A9A9A9',
  accentWhite: '#FFFFFF',
  unisBlue: '#163387',
  unisSilver: '#918f8f',
  // Gradient colors
  gradientStart: '#1A1A1A',
  gradientEnd: '#000000',
  trayGradientStart: '#242424',
  trayGradientEnd: '#1A1A1A',
};

// Simple triangle components for prev/next buttons (matches web app style)
interface TriangleProps {
  size?: number;
  color?: string;
  direction: 'left' | 'right';
}

const Triangle: React.FC<TriangleProps> = ({ size = 24, color = COLORS.unisBlue, direction }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    {direction === 'left' ? (
      // Left-pointing triangle (previous)
      <Path d="M18 4 L6 12 L18 20 Z" fill={color} />
    ) : (
      // Right-pointing triangle (next)
      <Path d="M6 4 L18 12 L6 20 Z" fill={color} />
    )}
  </Svg>
);

// Dimensions from player.scss
const SEEKBAR_HEIGHT = 4;
const THUMB_SIZE = 18;
const ARTWORK_SIZE = 45;
const ARTWORK_SIZE_MOBILE = 40;
const PLAY_BUTTON_SIZE = 45;
const PLAY_BUTTON_SIZE_MOBILE = 40;
const ACTION_BUTTON_SIZE = 42;
const EXPANDED_ARTWORK_SIZE = Math.min(350, SCREEN_WIDTH - 40);
const TRAY_MAX_HEIGHT = 120;

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

  // Local state
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [showMobileActions, setShowMobileActions] = useState(false);
  
  // Animation values
  const mobileActionsHeight = useRef(new Animated.Value(0)).current;
  
  // Seekbar ref for measuring
  const seekbarRef = useRef<View>(null);
  const seekbarLayout = useRef({ x: 0, y: 0, width: 0, height: 0 });

  // Extract user ID from token
  useEffect(() => {
    const getUserId = async () => {
      try {
        const token = await SecureStore.getItemAsync('token');
        if (token) {
          const payload = JSON.parse(atob(token.split('.')[1]));
          setUserId(payload.userId);
        }
      } catch (err) {
        console.error('Failed to extract userId from token:', err);
      }
    };
    getUserId();
  }, []);

  // Fetch like status when media changes
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
      } catch (err) {
        if (isMounted) {
          setIsLiked(false);
          setLikeCount(0);
        }
      }
    };
    
    fetchLikeStatus();
    return () => { isMounted = false; };
  }, [currentMedia?.id, userId]);

  // Toggle mobile actions tray with animation
  const toggleMobileActions = useCallback(() => {
    const toValue = showMobileActions ? 0 : TRAY_MAX_HEIGHT;
    Animated.timing(mobileActionsHeight, {
      toValue,
      duration: 300,
      useNativeDriver: false,
    }).start();
    setShowMobileActions(!showMobileActions);
  }, [showMobileActions, mobileActionsHeight]);

  // Handle like
  const handleLike = async () => {
    if (!userId) {
      Alert.alert('Login Required', 'Please log in to like songs');
      return;
    }
    
    const songId = currentMedia?.id || currentMedia?.songId;
    if (!songId) return;
    
    try {
      const method = isLiked ? 'delete' : 'post';
      const res = await axiosInstance({
        method,
        url: `/v1/media/song/${songId}/like?userId=${userId}`,
      });
      
      if (res.data.success) {
        setIsLiked(!isLiked);
        setLikeCount(prev => isLiked ? Math.max(0, prev - 1) : prev + 1);
      }
    } catch (err) {
      console.error('Like toggle failed:', err);
    }
  };

  // Handle vote (placeholder)
  const handleVote = () => {
    if (!userId) {
      Alert.alert('Login Required', 'Please log in to vote');
      return;
    }
    console.log('Vote clicked - VotingWizard not yet implemented');
    Alert.alert('Coming Soon', 'Voting will be available soon');
  };

  // Handle add to playlist (placeholder)
  const handleAddToPlaylist = () => {
    console.log('Add to playlist clicked - PlaylistWizard not yet implemented');
    Alert.alert('Coming Soon', 'Playlist management will be available soon');
  };

  // Handle download (placeholder)
  const handleDownload = () => {
    Alert.alert('Coming Soon', 'Download functionality will be available soon');
  };

  // Format time (ms to mm:ss)
  const formatTime = (ms: number): string => {
    if (!ms || isNaN(ms)) return '0:00';
    const totalSeconds = Math.floor(ms / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate progress percentage
  const progress = duration > 0 ? (position / duration) * 100 : 0;

  // Seekbar layout handler
  const handleSeekbarLayout = useCallback((event: any) => {
    const { x, y, width, height } = event.nativeEvent.layout;
    seekbarLayout.current = { x, y, width, height };
  }, []);

  // PanResponder for seekbar dragging
  const seekbarPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const { locationX } = evt.nativeEvent;
        const percentage = Math.max(0, Math.min(1, locationX / seekbarLayout.current.width));
        const newPosition = percentage * duration;
        seekTo(newPosition);
      },
      onPanResponderMove: (evt) => {
        const { locationX } = evt.nativeEvent;
        const percentage = Math.max(0, Math.min(1, locationX / seekbarLayout.current.width));
        const newPosition = percentage * duration;
        seekTo(newPosition);
      },
    })
  ).current;

  // Base64 decode helper
  const atob = (input: string): string => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let str = input.replace(/=+$/, '');
    let output = '';

    for (let bc = 0, bs = 0, buffer, i = 0; (buffer = str.charAt(i++)); ) {
      buffer = chars.indexOf(buffer) as any;
      if (buffer === -1) continue;
      bs = bc % 4 ? bs * 64 + buffer : buffer;
      if (bc++ % 4) {
        output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)));
      }
    }

    return output;
  };

  // Don't render if no media
  if (!currentMedia) {
    return null;
  }

  const artwork = currentMedia.artwork || currentMedia.artworkUrl || 'https://picsum.photos/200';

  // ==================== EXPANDED VIEW ====================
  if (isExpanded) {
    return (
      <View style={[styles.expandedContainer, { paddingTop: insets.top }]}>
        {/* Blurred background with album art */}
        <ImageBackground
          source={{ uri: artwork }}
          style={styles.expandedBackground}
          blurRadius={20}
        >
          {/* Dark overlay to match filter: brightness(0.4) */}
          <View style={styles.expandedOverlay} />
        </ImageBackground>

        <View style={styles.expandedContent}>
          {/* Minimize button */}
          <TouchableOpacity
            style={styles.minimizeButton}
            onPress={toggleExpand}
          >
            <Text style={styles.minimizeText}>Minimize</Text>
          </TouchableOpacity>

          {/* Artwork */}
          <View style={styles.expandedArtworkContainer}>
            <Image
              source={{ uri: artwork }}
              style={styles.expandedArtwork}
            />
          </View>

          {/* Song info */}
          <View style={styles.expandedInfo}>
            <Text style={styles.expandedTitle} numberOfLines={1}>
              {currentMedia.title}
            </Text>
            <Text style={styles.expandedArtist} numberOfLines={1}>
              {currentMedia.artist}
            </Text>
          </View>

          {/* Time info */}
          <View style={styles.expandedTimeInfo}>
            <Text style={styles.timeText}>{formatTime(position)}</Text>
            <Text style={styles.timeText}>{formatTime(duration)}</Text>
          </View>

          {/* Expanded seekbar */}
          <View
            style={styles.expandedSeekbarContainer}
            onLayout={handleSeekbarLayout}
            {...seekbarPanResponder.panHandlers}
          >
            <View style={styles.expandedSeekbarTrack}>
              <View
                style={[styles.expandedSeekbarProgress, { width: `${progress}%` }]}
              />
              <View
                style={[
                  styles.expandedSeekbarThumb,
                  { left: `${progress}%`, marginLeft: -8 },
                ]}
              />
            </View>
          </View>

          {/* Controls */}
          <View style={styles.expandedControls}>
            <TouchableOpacity onPress={prev} style={styles.expandedControlButton}>
              <Triangle size={35} color={COLORS.accentWhite} direction="left" />
            </TouchableOpacity>
            
            <TouchableOpacity
              onPress={togglePlayPause}
              style={styles.expandedPlayButton}
            >
              {isBuffering ? (
                <ActivityIndicator size="large" color={COLORS.unisBlue} />
              ) : isPlaying ? (
                <UnisPauseButton size={60} />
              ) : (
                <UnisPlayButton size={60} />
              )}
            </TouchableOpacity>
            
            <TouchableOpacity onPress={next} style={styles.expandedControlButton}>
              <Triangle size={35} color={COLORS.accentWhite} direction="right" />
            </TouchableOpacity>
          </View>

          {/* Action buttons */}
          <View style={styles.expandedActions}>
            <TouchableOpacity
              onPress={handleLike}
              style={[styles.expandedActionButton, isLiked && styles.likedButton]}
            >
              <Heart
                size={24}
                color={isLiked ? COLORS.unisBlue : COLORS.textGray}
                fill={isLiked ? COLORS.unisBlue : 'none'}
              />
            </TouchableOpacity>
            
            <TouchableOpacity onPress={handleVote} style={styles.expandedActionButton}>
              <Vote size={24} color={COLORS.textGray} />
            </TouchableOpacity>
            
            <TouchableOpacity onPress={handleDownload} style={styles.expandedActionButton}>
              <Download size={24} color={COLORS.textGray} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // ==================== MINI PLAYER VIEW ====================
  return (
    <View style={styles.container}>
      {/* Mobile actions tray - slides up from bottom */}
      {/* Uses LinearGradient: linear-gradient(to top, #1A1A1A, #242424) */}
      <Animated.View 
        style={[
          styles.mobileActionsTray, 
          { height: mobileActionsHeight }
        ]}
      >
        <LinearGradient
          colors={[COLORS.trayGradientStart, COLORS.trayGradientEnd]}
          start={{ x: 0, y: 1 }}
          end={{ x: 0, y: 0 }}
          style={styles.trayGradient}
        >
          <View style={styles.trayContent}>
            <TouchableOpacity onPress={handleVote} style={styles.trayAction}>
              <Vote size={20} color={COLORS.textSilver} />
              <Text style={styles.trayLabel}>Vote</Text>
            </TouchableOpacity>
            
            <TouchableOpacity onPress={handleAddToPlaylist} style={styles.trayAction}>
              <Plus size={20} color={COLORS.textSilver} />
              <Text style={styles.trayLabel}>Add</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              onPress={handleLike}
              style={[styles.trayAction, isLiked && styles.trayActionLiked]}
            >
              <Heart
                size={20}
                color={isLiked ? COLORS.unisBlue : COLORS.textSilver}
                fill={isLiked ? COLORS.unisBlue : 'none'}
              />
              <Text style={[styles.trayLabel, isLiked && styles.trayLabelLiked]}>
                {isLiked ? 'Liked' : 'Like'}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity onPress={handleDownload} style={styles.trayAction}>
              <Download size={20} color={COLORS.textSilver} />
              <Text style={styles.trayLabel}>Download</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </Animated.View>

      {/* Main player gradient background */}
      {/* Uses LinearGradient: linear-gradient(to bottom, #1A1A1A, #000000) */}
      {/* paddingBottom creates space for safe area, gradient extends to bottom */}
      <LinearGradient
        colors={[COLORS.gradientStart, COLORS.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[styles.playerGradient, { paddingBottom: insets.bottom }]}
      >
        {/* Seekbar - positioned at top of player */}
        <View
          ref={seekbarRef}
          style={styles.seekbar}
          onLayout={handleSeekbarLayout}
          {...seekbarPanResponder.panHandlers}
        >
          <View style={styles.seekbarTrack}>
            <View style={[styles.seekbarProgress, { width: `${progress}%` }]} />
            <View
              style={[
                styles.seekbarThumb,
                { left: `${progress}%`, marginLeft: -THUMB_SIZE / 2 },
              ]}
            />
          </View>
        </View>

        {/* Mini player bar */}
        <View style={styles.miniPlayer}>
          {/* Song info - tappable to expand */}
          <TouchableOpacity style={styles.songInfo} onPress={toggleExpand}>
            <Image
              source={{ uri: artwork }}
              style={styles.miniArtwork}
            />
            <View style={styles.miniInfo}>
              <Text style={styles.miniTitle} numberOfLines={1}>
                {currentMedia.title}
              </Text>
              <Text style={styles.miniArtist} numberOfLines={1}>
                {currentMedia.artist}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Playback controls - centered */}
          <View style={styles.miniControls}>
            <TouchableOpacity onPress={prev} style={styles.trackToggle}>
              <Triangle size={24} color={COLORS.unisBlue} direction="left" />
            </TouchableOpacity>
            
            <TouchableOpacity onPress={togglePlayPause} style={styles.playPauseButton}>
              {isBuffering ? (
                <ActivityIndicator size="small" color={COLORS.unisBlue} />
              ) : isPlaying ? (
                <UnisPauseButton size={PLAY_BUTTON_SIZE_MOBILE} />
              ) : (
                <UnisPlayButton size={PLAY_BUTTON_SIZE_MOBILE} />
              )}
            </TouchableOpacity>
            
            <TouchableOpacity onPress={next} style={styles.trackToggle}>
              <Triangle size={24} color={COLORS.unisBlue} direction="right" />
            </TouchableOpacity>
          </View>

          {/* Desktop actions - visible on larger screens */}
          {!IS_MOBILE && (
            <View style={styles.desktopActions}>
              <TouchableOpacity onPress={handleVote} style={styles.actionButton}>
                <Vote size={18} color={COLORS.textGray} />
              </TouchableOpacity>
              
              <TouchableOpacity onPress={handleAddToPlaylist} style={styles.actionButton}>
                <Plus size={18} color={COLORS.textGray} />
              </TouchableOpacity>
              
              <TouchableOpacity
                onPress={handleLike}
                style={[styles.actionButton, isLiked && styles.actionButtonLiked]}
              >
                <Heart
                  size={18}
                  color={isLiked ? COLORS.unisBlue : COLORS.textGray}
                  fill={isLiked ? COLORS.unisBlue : 'none'}
                />
              </TouchableOpacity>
              
              <TouchableOpacity onPress={handleDownload} style={styles.actionButton}>
                <Download size={18} color={COLORS.textGray} />
              </TouchableOpacity>
            </View>
          )}

          {/* Mobile actions toggle - visible on mobile only */}
          {IS_MOBILE && (
            <TouchableOpacity
              style={styles.mobileActionsToggle}
              onPress={toggleMobileActions}
            >
              {showMobileActions ? (
                <ChevronDown size={20} color={COLORS.unisBlue} />
              ) : (
                <ChevronUp size={20} color={COLORS.unisBlue} />
              )}
            </TouchableOpacity>
          )}
        </View>
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  // ==================== MINI PLAYER STYLES ====================
  
  // Main container - fixed at bottom with black background extending to screen edge
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    backgroundColor: COLORS.bgBlack, // Fills safe area with black
  },
  
  // Black fill for the bottom safe area (behind navigation gestures)
  // Kept as backup style if needed
  bottomSafeAreaFill: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.bgBlack,
  },
  
  // Gradient background for mini player
  // Matches: linear-gradient(to bottom, #1A1A1A, $bg-black)
  playerGradient: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(22, 51, 135, 0.3)', // rgba($unis-blue, 0.3)
  },
  
  // Seekbar container - at top of player
  seekbar: {
    width: '100%',
    height: SEEKBAR_HEIGHT + 20, // Extra padding for touch area
    paddingTop: 10,
    justifyContent: 'flex-start',
  },
  seekbarTrack: {
    height: SEEKBAR_HEIGHT,
    backgroundColor: 'rgba(22, 51, 135, 0.3)', // rgba($unis-blue, 0.3)
    position: 'relative',
  },
  seekbarProgress: {
    height: '100%',
    backgroundColor: COLORS.unisBlue,
  },
  seekbarThumb: {
    position: 'absolute',
    top: -(THUMB_SIZE - SEEKBAR_HEIGHT) / 2,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: COLORS.unisBlue,
    // Shadow to match: box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3)
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  
  // Mobile actions tray
  // Matches: .mobile-actions-tray with linear-gradient(to top, #1A1A1A, #242424)
  mobileActionsTray: {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    right: 0,
    overflow: 'hidden',
    borderTopWidth: 1,
    borderTopColor: 'rgba(22, 51, 135, 0.3)',
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
    backgroundColor: 'rgba(22, 51, 135, 0.1)', // rgba($unis-blue, 0.1)
    borderWidth: 1,
    borderColor: 'rgba(22, 51, 135, 0.3)', // rgba($unis-blue, 0.3)
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minWidth: 70,
    gap: 5,
  },
  trayActionLiked: {
    borderColor: COLORS.unisBlue,
  },
  trayLabel: {
    color: COLORS.textSilver,
    fontSize: 10,
    textAlign: 'center',
    marginTop: 5,
  },
  trayLabelLiked: {
    color: COLORS.unisBlue,
  },
  
  // Mini player bar
  miniPlayer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 60,
    paddingHorizontal: IS_MOBILE ? 10 : 20,
    paddingBottom: 10,
  },
  
  // Song info section
  songInfo: {
    flex: IS_MOBILE ? 0 : 1,
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: IS_MOBILE ? '35%' : undefined,
    gap: IS_MOBILE ? 8 : 12,
  },
  miniArtwork: {
    width: IS_MOBILE ? ARTWORK_SIZE_MOBILE : ARTWORK_SIZE,
    height: IS_MOBILE ? ARTWORK_SIZE_MOBILE : ARTWORK_SIZE,
    borderRadius: 6,
    // Shadow to match: box-shadow: 0 2px 5px rgba(0,0,0,0.5)
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 5,
    elevation: 5,
  },
  miniInfo: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 0, // Allows text truncation
  },
  miniTitle: {
    color: COLORS.accentWhite,
    fontSize: IS_MOBILE ? 12 : 14,
    fontWeight: '600',
  },
  miniArtist: {
    color: COLORS.textSilver,
    fontSize: IS_MOBILE ? 10 : 12,
  },
  
  // Playback controls - centered
  miniControls: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: IS_MOBILE ? 8 : 20,
  },
  trackToggle: {
    width: IS_MOBILE ? 28 : 32,
    height: IS_MOBILE ? 28 : 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trackToggleText: {
    color: COLORS.unisBlue,
    fontSize: 24,
  },
  playPauseButton: {
    width: IS_MOBILE ? PLAY_BUTTON_SIZE_MOBILE : PLAY_BUTTON_SIZE,
    height: IS_MOBILE ? PLAY_BUTTON_SIZE_MOBILE : PLAY_BUTTON_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: IS_MOBILE ? 13 : 0,
  },
  
  // Desktop actions
  desktopActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 20,
    paddingRight: 8,
    minWidth: 180,
  },
  actionButton: {
    width: ACTION_BUTTON_SIZE,
    height: ACTION_BUTTON_SIZE,
    borderRadius: ACTION_BUTTON_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  actionButtonLiked: {
    backgroundColor: 'rgba(22, 51, 135, 0.15)',
  },
  
  // Mobile actions toggle
  mobileActionsToggle: {
    padding: 5,
    marginLeft: 10,
  },
  
  // ==================== EXPANDED PLAYER STYLES ====================
  
  expandedContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.bgBlack,
    zIndex: 2000,
  },
  expandedBackground: {
    ...StyleSheet.absoluteFillObject,
  },
  // Overlay to match: filter: blur(20px) brightness(0.4)
  expandedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  expandedContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  
  // Minimize button
  minimizeButton: {
    position: 'absolute',
    top: 20,
    left: 20,
    padding: 10,
    zIndex: 10,
  },
  minimizeText: {
    color: COLORS.accentWhite,
    fontSize: 24,
  },
  
  // Expanded artwork
  expandedArtworkContainer: {
    marginBottom: 40,
    // Shadow to match: box-shadow: 0 10px 30px rgba(0,0,0,0.5)
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 10,
  },
  expandedArtwork: {
    width: EXPANDED_ARTWORK_SIZE,
    height: EXPANDED_ARTWORK_SIZE,
    borderRadius: 12,
  },
  
  // Expanded info
  expandedInfo: {
    alignItems: 'center',
    marginBottom: 30,
    width: '100%',
    maxWidth: 500,
  },
  expandedTitle: {
    color: COLORS.accentWhite,
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 5,
    textAlign: 'center',
  },
  expandedArtist: {
    color: COLORS.textSilver,
    fontSize: 18,
    textAlign: 'center',
  },
  
  // Time info
  expandedTimeInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: 500,
    marginBottom: 10,
  },
  timeText: {
    color: COLORS.textSilver,
    fontSize: 14,
  },
  
  // Expanded seekbar
  expandedSeekbarContainer: {
    width: '100%',
    maxWidth: 500,
    height: 30,
    justifyContent: 'center',
    marginBottom: 30,
  },
  expandedSeekbarTrack: {
    height: 6,
    backgroundColor: 'rgba(22, 51, 135, 0.3)',
    borderRadius: 3,
    position: 'relative',
  },
  expandedSeekbarProgress: {
    height: '100%',
    backgroundColor: COLORS.unisBlue,
    borderRadius: 3,
  },
  expandedSeekbarThumb: {
    position: 'absolute',
    top: -5,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.unisBlue,
    borderWidth: 2,
    borderColor: COLORS.accentWhite,
    // Shadow to match: box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4)
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  
  // Expanded controls
  expandedControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 30,
    marginBottom: 20,
  },
  expandedControlButton: {
    padding: 10,
  },
  expandedControlText: {
    color: COLORS.accentWhite,
    fontSize: 35,
  },
  expandedPlayButton: {
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  // Expanded actions
  expandedActions: {
    flexDirection: 'row',
    gap: 20,
  },
  expandedActionButton: {
    padding: 10,
  },
  likedButton: {
    // Additional styling for liked state
  },
});

export default Player;