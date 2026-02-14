// src/components/SongNotification.tsx
//
// Toast notification that appears when a new song starts playing.
// Slides in from the left, displays artwork + title + artist,
// pulses with a Unis blue border glow, then slides out after 3 seconds.
//
// Sits ABOVE the Player (zIndex: 1100 > Player's 1000)

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import { usePlayer } from '../context/PlayerContext';
import { getMediaUrl } from '../services/axiosInstance';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const NOTIFICATION_DURATION = 3000;
const SLIDE_IN_DURATION = 500;
const SLIDE_OUT_DURATION = 400;

const UNIS_BLUE = '#163387';
const FLASH_BLUE = '#007bff';

const SongNotification: React.FC = () => {
  const { currentMedia } = usePlayer();

  const translateX = useRef(new Animated.Value(-SCREEN_WIDTH)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const borderGlow = useRef(new Animated.Value(0)).current;
  const isVisible = useRef(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const glowAnimation = useRef<Animated.CompositeAnimation | null>(null);
  const prevMediaId = useRef<string | null>(null);

  useEffect(() => {
    if (!currentMedia) return;

    const mediaId = currentMedia.id || currentMedia.title;
    if (mediaId === prevMediaId.current) return;
    prevMediaId.current = mediaId;

    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
    }

    if (isVisible.current) {
      translateX.setValue(-SCREEN_WIDTH);
      opacity.setValue(0);
    }

    isVisible.current = true;

    Animated.parallel([
      Animated.spring(translateX, {
        toValue: 0,
        damping: 20,
        stiffness: 180,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: SLIDE_IN_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    glowAnimation.current = Animated.loop(
      Animated.sequence([
        Animated.timing(borderGlow, {
          toValue: 1,
          duration: 750,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
        Animated.timing(borderGlow, {
          toValue: 0,
          duration: 750,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
      ])
    );
    glowAnimation.current.start();

    hideTimer.current = setTimeout(() => {
      glowAnimation.current?.stop();

      Animated.parallel([
        Animated.timing(translateX, {
          toValue: -SCREEN_WIDTH,
          duration: SLIDE_OUT_DURATION,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: SLIDE_OUT_DURATION,
          useNativeDriver: true,
        }),
      ]).start(() => {
        isVisible.current = false;
        borderGlow.setValue(0);
      });
    }, NOTIFICATION_DURATION);

    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      glowAnimation.current?.stop();
    };
  }, [currentMedia]);

  if (!currentMedia) return null;

  const animatedBorderColor = borderGlow.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(0, 123, 255, 0)', 'rgba(0, 123, 255, 0.9)'],
  });

  const animatedShadowOpacity = borderGlow.interpolate({
    inputRange: [0, 1],
    outputRange: [0.2, 0.7],
  });

  const artworkUrl = getMediaUrl(currentMedia.artwork || (currentMedia as any).imageUrl);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateX }],
          opacity,
        },
      ]}
      pointerEvents="none"
    >
      <Animated.View
        style={[
          styles.card,
          {
            borderColor: animatedBorderColor,
            shadowColor: FLASH_BLUE,
            shadowOpacity: animatedShadowOpacity as any,
          },
        ]}
      >
        <View style={styles.artworkContainer}>
          {artworkUrl ? (
            <Image
              source={{ uri: artworkUrl }}
              style={styles.artwork}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.artwork, styles.artworkPlaceholder]}>
              <Text style={styles.artworkPlaceholderText}>♪</Text>
            </View>
          )}
        </View>

        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
            {currentMedia.title || 'Unknown Track'}
          </Text>
          <Text style={styles.artist} numberOfLines={1} ellipsizeMode="tail">
            {currentMedia.artist || 'Unknown Artist'}
          </Text>
        </View>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 140,       // Well above mini player
    left: 12,
    right: 60,
    zIndex: 1100,      // Above Player's 1000
    elevation: 20,     // Android z-ordering
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(22, 22, 24, 0.97)',
    borderRadius: 14,
    padding: 12,
    gap: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  artworkContainer: {
    shadowColor: FLASH_BLUE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  artwork: {
    width: 54,
    height: 54,
    borderRadius: 10,
  },
  artworkPlaceholder: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  artworkPlaceholderText: {
    fontSize: 24,
    color: 'rgba(255, 255, 255, 0.3)',
  },
  info: {
    flex: 1,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
    marginBottom: 3,
  },
  artist: {
    color: UNIS_BLUE,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
});

export default SongNotification;