// src/components/ArtistCard.tsx
// Premium artist card with ambient glow, slide-in animation, and luxury aesthetic
// Designed to be a "hook point" — visually stunning, modern, and memorable
//
// Features:
//   - Slide-in from right animation on mount (staggered by index)
//   - Full-bleed artist photo with cinematic gradient overlay
//   - Animated blue glow border on the left edge (Unis signature)
//   - Ambient light leak effect from artwork
//   - Score badge with pulsing glow
//   - Jurisdiction displayed prominently
//   - Premium VIEW button with border glow

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ImageBackground,
  StyleSheet,
  Dimensions,
  Animated,
  Easing,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IS_MOBILE = SCREEN_WIDTH < 480;

// ─────────────────────────────────────────────
// DESIGN TOKENS
// ─────────────────────────────────────────────
const UNIS_BLUE = '#163387';
const UNIS_BLUE_LIGHT = '#2E5AAC';
const UNIS_BLUE_GLOW = 'rgba(22, 51, 135, 0.6)';
const SILVER = '#C0C0C0';
const CARD_HEIGHT = IS_MOBILE ? 240 : 280;
const CARD_BORDER_RADIUS = 16;

// ─────────────────────────────────────────────
// INTERFACES
// ─────────────────────────────────────────────
export interface ArtistItem {
  userId: string;
  username: string;
  photoUrl?: string;
  jurisdictionId?: string;
  jurisdictionName?: string;
  score?: number;
}

interface ArtistCardProps {
  artist: ArtistItem;
  onPress: () => void;
  onViewPress: () => void;
  index?: number; // For staggered animation delay
}

// ─────────────────────────────────────────────
// AMBIENT GLOW OVERLAY (SVG radial gradient)
// Creates a soft blue light leak from bottom-left
// ─────────────────────────────────────────────
const AmbientGlow: React.FC = () => (
  <View style={StyleSheet.absoluteFill} pointerEvents="none">
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient id="glow" cx="0%" cy="100%" rx="70%" ry="80%">
          <Stop offset="0%" stopColor={UNIS_BLUE} stopOpacity="0.35" />
          <Stop offset="50%" stopColor={UNIS_BLUE} stopOpacity="0.1" />
          <Stop offset="100%" stopColor={UNIS_BLUE} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#glow)" />
    </Svg>
  </View>
);

// ─────────────────────────────────────────────
// SCORE BADGE — small illuminated pill
// ─────────────────────────────────────────────
const ScoreBadge: React.FC<{ score: number }> = ({ score }) => {
  if (!score && score !== 0) return null;

  return (
    <View style={scoreStyles.container}>
      <View style={scoreStyles.badge}>
        <Text style={scoreStyles.icon}>★</Text>
        <Text style={scoreStyles.text}>{score.toLocaleString()}</Text>
      </View>
    </View>
  );
};

const scoreStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: IS_MOBILE ? 10 : 14,
    right: IS_MOBILE ? 10 : 14,
    zIndex: 5,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(22, 51, 135, 0.5)',
    borderRadius: 20,
    paddingHorizontal: IS_MOBILE ? 8 : 10,
    paddingVertical: IS_MOBILE ? 3 : 4,
    shadowColor: UNIS_BLUE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  icon: {
    color: UNIS_BLUE_LIGHT,
    fontSize: IS_MOBILE ? 10 : 12,
  },
  text: {
    color: SILVER,
    fontSize: IS_MOBILE ? 10 : 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────
const ArtistCard: React.FC<ArtistCardProps> = ({
  artist,
  onPress,
  onViewPress,
  index = 0,
}) => {
  const locationName = artist.jurisdictionName || 'Your Area';

  // ── Slide-in animation from right ──
  const slideX = useRef(new Animated.Value(80)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;

  // ── Glowing left border animation ──
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Staggered slide-in
    const delay = index * 150;

    Animated.parallel([
      Animated.timing(slideX, {
        toValue: 0,
        duration: 700,
        delay,
        easing: Easing.out(Easing.bezier(0.16, 1, 0.3, 1)),
        useNativeDriver: true,
      }),
      Animated.timing(fadeIn, {
        toValue: 1,
        duration: 600,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    // Pulsing glow on left border
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 2000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
      ])
    ).start();
  }, []);

  const glowBorderColor = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(22, 51, 135, 0.4)', 'rgba(46, 90, 172, 1)'],
  });

  const glowShadowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.2, 0.7],
  });

  return (
    <Animated.View
      style={[
        styles.outerWrapper,
        {
          opacity: fadeIn,
          transform: [{ translateX: slideX }],
        },
      ]}
    >
      {/* Animated glow border — left accent line */}
      <Animated.View
        style={[
          styles.glowBorder,
          {
            backgroundColor: glowBorderColor,
            shadowColor: UNIS_BLUE,
            shadowOpacity: glowShadowOpacity,
          },
        ]}
      />

      <TouchableOpacity
        style={styles.container}
        onPress={onPress}
        activeOpacity={0.92}
      >
        {/* Full-bleed artist photo */}
        <ImageBackground
          source={{ uri: artist.photoUrl || 'https://picsum.photos/400/300' }}
          style={styles.imageBackground}
          resizeMode="cover"
        >
          {/* Cinematic gradient overlay — dark from right for text legibility */}
          <LinearGradient
            colors={[
              'rgba(0, 0, 0, 0)',
              'rgba(0, 0, 0, 0.15)',
              'rgba(0, 0, 0, 0.5)',
              'rgba(0, 0, 0, 0.85)',
            ]}
            locations={[0, 0.3, 0.6, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />

          {/* Bottom gradient for depth */}
          <LinearGradient
            colors={[
              'rgba(0, 0, 0, 0)',
              'rgba(0, 0, 0, 0.6)',
            ]}
            locations={[0.5, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
          />

          {/* Ambient blue glow from bottom-left */}
          <AmbientGlow />

          {/* Score badge — top right */}
          <ScoreBadge score={artist.score || 0} />

          {/* Content overlay — positioned bottom-right */}
          <View style={styles.contentOverlay}>
            {/* Artist info */}
            <View style={styles.infoSection}>
              {/* Jurisdiction tag */}
              <View style={styles.jurisdictionTag}>
                <View style={styles.jurisdictionDot} />
                <Text style={styles.jurisdictionText}>{locationName}</Text>
              </View>

              {/* Artist name — large, bold, cinematic */}
              <Text style={styles.artistName} numberOfLines={2}>
                {artist.username}
              </Text>

              {/* Thin separator line */}
              <View style={styles.separator} />
            </View>

            {/* VIEW button */}
            <TouchableOpacity
              style={styles.viewButton}
              onPress={(e) => {
                e.stopPropagation?.();
                onViewPress();
              }}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['rgba(22, 51, 135, 0.15)', 'rgba(22, 51, 135, 0.05)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.viewButtonGradient}
              >
                <Text style={styles.viewButtonText}>VIEW</Text>
                <Text style={styles.viewButtonArrow}>→</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </ImageBackground>
      </TouchableOpacity>
    </Animated.View>
  );
};

// ─────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────
const styles = StyleSheet.create({
  outerWrapper: {
    flexDirection: 'row',
    marginBottom: 2,
  },

  // Animated glowing left accent border
  glowBorder: {
    width: 3,
    borderTopLeftRadius: CARD_BORDER_RADIUS,
    borderBottomLeftRadius: CARD_BORDER_RADIUS,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 12,
    elevation: 8,
  },

  container: {
    flex: 1,
    height: CARD_HEIGHT,
    borderTopRightRadius: CARD_BORDER_RADIUS,
    borderBottomRightRadius: CARD_BORDER_RADIUS,
    overflow: 'hidden',
    // Outer card shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },

  imageBackground: {
    flex: 1,
    justifyContent: 'flex-end',
  },

  // Content positioned at bottom-right of card
  contentOverlay: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    padding: IS_MOBILE ? 14 : 20,
    paddingTop: 0,
  },

  infoSection: {
    flex: 1,
    marginRight: 12,
  },

  // Jurisdiction pill
  jurisdictionTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  jurisdictionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: UNIS_BLUE_LIGHT,
    shadowColor: UNIS_BLUE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 4,
  },
  jurisdictionText: {
    color: UNIS_BLUE_LIGHT,
    fontSize: IS_MOBILE ? 10 : 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },

  // Artist name — cinematic title treatment
  artistName: {
    color: '#FFFFFF',
    fontSize: IS_MOBILE ? 22 : 28,
    fontWeight: '800',
    letterSpacing: 0.5,
    lineHeight: IS_MOBILE ? 26 : 32,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },

  // Thin accent separator
  separator: {
    width: 40,
    height: 2,
    backgroundColor: UNIS_BLUE,
    marginTop: 8,
    borderRadius: 1,
    shadowColor: UNIS_BLUE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 3,
  },

  // VIEW button with glass effect
  viewButton: {
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(22, 51, 135, 0.5)',
    shadowColor: UNIS_BLUE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  viewButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: IS_MOBILE ? 8 : 10,
    paddingHorizontal: IS_MOBILE ? 14 : 18,
  },
  viewButtonText: {
    color: SILVER,
    fontSize: IS_MOBILE ? 11 : 12,
    fontWeight: '800',
    letterSpacing: 2,
  },
  viewButtonArrow: {
    color: UNIS_BLUE_LIGHT,
    fontSize: IS_MOBILE ? 14 : 16,
    fontWeight: '300',
  },
});

export default ArtistCard;