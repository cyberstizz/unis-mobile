// src/components/WinnersNotification.tsx
//
// Notification that appears once per day when the user signs in,
// showing current leaderboard highlights from their jurisdiction.
// Slides in from the right with a purple gradient card and
// flashing colored border, then auto-dismisses after 5 seconds.
//
// v2: Replaced random template selection with threshold-based logic.
// Never shows 0-vote leaders or fabricated competition.
// Four tiers: competitive, active, zero-activity, fallback.

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
  blue: '#4ea8f5',
};

// Thresholds — tune these as your user base grows
const THRESHOLDS = {
  COMPETITIVE: 3,   // Leader needs 3+ votes
  ACTIVE: 1,        // At least 1 vote exists
};

interface NotificationData {
  type: string;
  iconName: 'trophy' | 'trending-up' | 'music' | 'users';
  title: string;
  message: string;
  color: string;
  artwork?: string | null;
}

interface LeaderEntry {
  name: string;
  votes: number;
  artwork: string | null;
}

// ── Threshold-based message selection ────────────────────────
const selectNotification = (
  leaderboardData: LeaderEntry[],
  jurisdictionName: string
): NotificationData => {
  if (!leaderboardData || leaderboardData.length === 0) {
    return {
      type: 'welcome',
      iconName: 'music',
      title: '\u{1F3B5} Welcome to Unis',
      message: 'Check out the leaderboards and support your favorite local artists.',
      color: COLORS.coral,
      artwork: null,
    };
  }

  const leader = leaderboardData[0];
  const runnerUp = leaderboardData.length > 1 ? leaderboardData[1] : null;
  const totalVotes = leaderboardData.reduce((sum, e) => sum + e.votes, 0);

  // Tier 1: Competitive — leader has 3+ votes
  if (leader.votes >= THRESHOLDS.COMPETITIVE) {
    const gap = leader.votes - (runnerUp?.votes || 0);
    const isCloseRace = runnerUp && gap <= 2 && runnerUp.votes >= 1;

    if (isCloseRace) {
      return {
        type: 'close-race',
        iconName: 'trending-up',
        title: '\u{1F4C8} Close Race',
        message: `${leader.name} and ${runnerUp!.name} are neck and neck for Artist of the Day \u2014 ${gap === 0 ? 'tied' : `just ${gap} vote${gap === 1 ? '' : 's'} apart`}!`,
        color: COLORS.cyan,
        artwork: leader.artwork,
      };
    }

    return {
      type: 'leading',
      iconName: 'trophy',
      title: '\u{1F3C6} Current Leader',
      message: `${leader.name} is leading for Artist of the Day with ${leader.votes} vote${leader.votes === 1 ? '' : 's'}. ${totalVotes} total vote${totalVotes === 1 ? '' : 's'} cast today.`,
      color: COLORS.gold,
      artwork: leader.artwork,
    };
  }

  // Tier 2: Active — at least some votes, not enough for competitive
  if (totalVotes >= THRESHOLDS.ACTIVE) {
    return {
      type: 'active',
      iconName: 'users',
      title: '\u{1F5F3}\uFE0F Polls Are Open',
      message: `${totalVotes} vote${totalVotes === 1 ? '' : 's'} cast so far today in ${jurisdictionName}. Every vote counts \u2014 make yours heard!`,
      color: COLORS.blue,
      artwork: leader.artwork,
    };
  }

  // Tier 3: Zero activity — artists exist but no votes
  return {
    type: 'zero-activity',
    iconName: 'music',
    title: '\u{1F3B5} Voting Is Open',
    message: `Today's Artist of the Day polls are open in ${jurisdictionName}. Be the first to cast your vote!`,
    color: COLORS.purple,
    artwork: null,
  };
};

// ── Icon component ───────────────────────────────────────────
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

// ═════════════════════════════════════════════════════════════
// COMPONENT
// ═════════════════════════════════════════════════════════════
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

  // ── Fetch and evaluate leaderboard data ────────────────────
  const fetchNotificationData = useCallback(async () => {
    if (!user) return;

    const jurisdictionId =
      user.jurisdiction?.jurisdictionId || '00000000-0000-0000-0000-000000000003';
    const jurisdictionName = user.jurisdiction?.name || 'your area';
    const genreId =
      user.genre?.genreId || '00000000-0000-0000-0000-000000000101';

    try {
      const response = await axiosInstance.get(
        `/v1/vote/leaderboards?jurisdictionId=${jurisdictionId}&genreId=${genreId}&targetType=artist&intervalId=00000000-0000-0000-0000-000000000201&limit=5`
      );

      const leaderboardData: LeaderEntry[] = (response.data || []).map((entry: any) => ({
        name: entry.name || entry.username || 'Unknown',
        votes: entry.votes || entry.voteCount || 0,
        artwork: getMediaUrl(entry.artwork || entry.photoUrl || entry.artworkUrl) || null,
      }));

      const picked = selectNotification(leaderboardData, jurisdictionName);
      setNotification(picked);
    } catch (error) {
      console.error('Failed to fetch notification data:', error);

      setNotification({
        type: 'welcome',
        iconName: 'music',
        title: '\u{1F3B5} Welcome to Unis',
        message: 'Check out the leaderboards and support your favorite local artists.',
        color: COLORS.coral,
        artwork: null,
      });
    }

    setShow(true);

    // Store today's date (EST-aligned) so we don't show again
    try {
      const todayEst = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' });
      await SecureStore.setItemAsync(STORAGE_KEY, todayEst);
    } catch (e) {
      console.warn('Could not save notification shown date:', e);
    }
  }, [user]);

  // ── Trigger on user login, once per day (EST-aligned) ──────
  useEffect(() => {
    if (!user) return;

    const checkAndShow = async () => {
      try {
        const lastShown = await SecureStore.getItemAsync(STORAGE_KEY);
        const todayEst = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' });

        if (lastShown === todayEst) return;

        fetchNotificationData();
      } catch (e) {
        fetchNotificationData();
      }
    };

    // Small delay so it doesn't compete with initial load
    const timer = setTimeout(checkAndShow, 2000);

    return () => {
      clearTimeout(timer);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      glowAnimation.current?.stop();
    };
  }, [user]);

  // ── Animate when show changes ──────────────────────────────
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
        {/* Purple gradient overlay */}
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  gradientBg: {
    ...StyleSheet.absoluteFillObject,
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