// src/components/WinnersNotification.tsx
//
// Notification that appears once per day when the user signs in,
// showing current leaderboard highlights from their jurisdiction.
// Slides in from the right with a purple gradient card and
// flashing colored border, then auto-dismisses after 5 seconds.
//
// Port notes:
// - localStorage → expo-secure-store (already in the project)
// - CSS @keyframes slideInRight/slideOutRight → Animated translateX
// - CSS @keyframes flashingColoredBorder → Animated loop
// - lucide-react icons → lucide-react-native (already in the project)
// - CSS variable --border-color → dynamic style prop
// - backdrop-filter: blur → solid gradient background

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import { Trophy, TrendingUp, Music, Users } from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../context/AuthContext';
import axiosInstance, { getMediaUrl } from '../services/axiosInstance';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DISPLAY_DURATION = 5000;
const SLIDE_IN_DURATION = 500;
const SLIDE_OUT_DURATION = 450;

const STORAGE_KEY = 'winnersNotificationShown';

// Notification color themes
const COLORS = {
  gold: '#FFD700',
  cyan: '#00D4FF',
  purple: '#9D4EDD',
  coral: '#FF6B6B',
};

interface NotificationData {
  type: string;
  iconName: 'trophy' | 'trending-up' | 'music' | 'users';
  title: string;
  message: string;
  color: string;
  artwork?: string | null;
}

// Icon component to avoid storing JSX in state
const NotificationIcon: React.FC<{ name: string; color: string }> = ({ name, color }) => {
  const size = 22;
  switch (name) {
    case 'trophy':
      return <Trophy size={size} color={color} />;
    case 'trending-up':
      return <TrendingUp size={size} color={color} />;
    case 'users':
      return <Users size={size} color={color} />;
    case 'music':
    default:
      return <Music size={size} color={color} />;
  }
};

const WinnersNotification: React.FC = () => {
  const { user } = useAuth();
  const [show, setShow] = useState(false);
  const [notification, setNotification] = useState<NotificationData | null>(null);

  // Animations
  const translateX = useRef(new Animated.Value(SCREEN_WIDTH)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const borderGlow = useRef(new Animated.Value(0)).current;
  const glowAnimation = useRef<Animated.CompositeAnimation | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const slideIn = useCallback(() => {
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

    // Start border glow loop
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
  }, []);

  const slideOut = useCallback(() => {
    glowAnimation.current?.stop();

    Animated.parallel([
      Animated.timing(translateX, {
        toValue: SCREEN_WIDTH,
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
      setShow(false);
      borderGlow.setValue(0);
    });
  }, []);

  const fetchNotificationData = useCallback(async () => {
    if (!user) return;

    try {
      const userJurisdiction =
        user.jurisdiction?.jurisdictionId || '00000000-0000-0000-0000-000000000003';
      const userGenre =
        user.genre?.genreId || '00000000-0000-0000-0000-000000000101';

      const response = await axiosInstance.get(
        `/v1/vote/leaderboards?jurisdictionId=${userJurisdiction}&genreId=${userGenre}&targetType=artist&intervalId=00000000-0000-0000-0000-000000000201&limit=3`
      );

      const leaderboardData = response.data;

      if (leaderboardData && leaderboardData.length > 0) {
        const leader = leaderboardData[0];
        const notificationTypes: NotificationData[] = [
          {
            type: 'leading',
            iconName: 'trophy',
            title: '🏆 Current Leader',
            message: `${leader.name} is leading for Artist of the Day with ${leader.votes} votes!`,
            color: COLORS.gold,
          },
          {
            type: 'trending',
            iconName: 'trending-up',
            title: '📈 Top 3 Artists',
            message: `${leaderboardData
              .slice(0, 3)
              .map((a: any) => a.name)
              .join(', ')} are battling for the top spot!`,
            color: COLORS.cyan,
          },
          {
            type: 'community',
            iconName: 'users',
            title: '👥 Community Pulse',
            message: `${leader.votes} votes cast today in your community. Make yours count!`,
            color: COLORS.purple,
          },
        ];

        // Random variety
        const randomNotif =
          notificationTypes[Math.floor(Math.random() * notificationTypes.length)];

        setNotification({
          ...randomNotif,
          artwork: leader.artwork || null,
        });
      } else {
        throw new Error('No leaderboard data');
      }
    } catch (error) {
      console.error('Failed to fetch notification data:', error);

      // Fallback
      setNotification({
        type: 'welcome',
        iconName: 'music',
        title: '🎵 Welcome to UNIS',
        message: "Check out today's leaderboards and cast your vote!",
        color: COLORS.coral,
        artwork: null,
      });
    }

    // Show and schedule hide
    setShow(true);

    // Store today's date so we don't show again
    try {
      await SecureStore.setItemAsync(STORAGE_KEY, new Date().toDateString());
    } catch (e) {
      console.warn('Could not save notification shown date:', e);
    }
  }, [user]);

  // Trigger on user login, once per day
  useEffect(() => {
    if (!user) return;

    const checkAndShow = async () => {
      try {
        const lastShown = await SecureStore.getItemAsync(STORAGE_KEY);
        const today = new Date().toDateString();

        if (lastShown === today) return; // Already shown today

        fetchNotificationData();
      } catch (e) {
        // SecureStore error — show anyway
        fetchNotificationData();
      }
    };

    checkAndShow();

    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      glowAnimation.current?.stop();
    };
  }, [user]);

  // Animate when show changes
  useEffect(() => {
    if (show && notification) {
      slideIn();

      hideTimer.current = setTimeout(() => {
        slideOut();
      }, DISPLAY_DURATION);
    }

    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [show, notification]);

  if (!notification) return null;

  // Dynamic border color interpolation
  const animatedBorderColor = borderGlow.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(255, 255, 255, 0)', notification.color],
  });

  const animatedShadowOpacity = borderGlow.interpolate({
    inputRange: [0, 1],
    outputRange: [0.2, 0.6],
  });

  const artworkUrl = getMediaUrl(notification.artwork);

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
            shadowColor: notification.color,
            shadowOpacity: animatedShadowOpacity as any,
          },
        ]}
      >
        {/* Purple gradient overlay (simulated with nested view) */}
        <View style={styles.gradientBg} />

        {/* Artwork */}
        {artworkUrl && (
          <View style={styles.artworkContainer}>
            <Image
              source={{ uri: artworkUrl }}
              style={styles.artwork}
              resizeMode="cover"
            />
          </View>
        )}

        {/* Content */}
        <View style={styles.content}>
          <View style={styles.header}>
            <NotificationIcon name={notification.iconName} color={notification.color} />
            <Text style={styles.title} numberOfLines={1}>
              {notification.title}
            </Text>
          </View>
          <Text style={styles.message} numberOfLines={3}>
            {notification.message}
          </Text>
        </View>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 90,
    left: 16,
    right: 12,
    zIndex: 101,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 14,
    gap: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    overflow: 'hidden',
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  gradientBg: {
    ...StyleSheet.absoluteFillObject,
    // Simulating the purple gradient — LinearGradient would be ideal
    // but this avoids an extra import. If you want the exact gradient,
    // wrap the card content in <LinearGradient> from expo-linear-gradient
    backgroundColor: 'rgba(75, 0, 130, 0.95)',
    borderRadius: 14,
  },
  artworkContainer: {
    zIndex: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  artwork: {
    width: 62,
    height: 62,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  content: {
    flex: 1,
    zIndex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    textShadowColor: 'rgba(0, 0, 0, 0.4)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  message: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 19,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});

export default WinnersNotification;