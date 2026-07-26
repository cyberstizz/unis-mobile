// src/components/ArtistAwardRails.tsx
// Ported from web `artistpage.jsx` award rails (v3).
//
// Two mirrored medal columns pinned to the hero's edges — LEFT = artist
// awards (theme accent), RIGHT = song awards (gold). Only awards actually won
// render. Each medal shows its interval symbol, a ×N win chip and the full
// award name. Absolutely positioned overlays: they never move hero content.
//
// Data: GET /v1/users/{artistId}/awards → [{ entity, interval, count }]
// (see ArtistAwardTallyController). Interval keys are the live
// voting_intervals names lowercased: daily | weekly | midterm | monthly |
// quarterly | annual.
//
// Entrance: the caller flips `revealed` ~650ms after load; each medal adds a
// 100ms stagger, so a full rail settles under 2s. Respects reduce-motion.

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  AccessibilityInfo,
} from 'react-native';
import Svg, { Path, Circle, G } from 'react-native-svg';

// ─── Award definitions ─────────────────────────────────────────
export interface AwardTally {
  entity: 'artist' | 'song';
  interval: string;
  count: number;
}

interface AwardDef {
  key: string;
  entity: 'artist' | 'song';
  interval: string;
  rank: number;
  label: string;
}

export const AWARD_DEFS: AwardDef[] = [
  { key: 'artist-annual',    entity: 'artist', interval: 'annual',    rank: 0, label: 'Artist of the Year' },
  { key: 'artist-quarterly', entity: 'artist', interval: 'quarterly', rank: 1, label: 'Artist of the Quarter' },
  { key: 'artist-monthly',   entity: 'artist', interval: 'monthly',   rank: 2, label: 'Artist of the Month' },
  { key: 'artist-midterm',   entity: 'artist', interval: 'midterm',   rank: 3, label: 'Artist of the Midterm' },
  { key: 'artist-weekly',    entity: 'artist', interval: 'weekly',    rank: 4, label: 'Artist of the Week' },
  { key: 'artist-daily',     entity: 'artist', interval: 'daily',     rank: 5, label: 'Artist of the Day' },
  { key: 'song-annual',      entity: 'song',   interval: 'annual',    rank: 0, label: 'Song of the Year' },
  { key: 'song-quarterly',   entity: 'song',   interval: 'quarterly', rank: 1, label: 'Song of the Quarter' },
  { key: 'song-monthly',     entity: 'song',   interval: 'monthly',   rank: 2, label: 'Song of the Month' },
  { key: 'song-midterm',     entity: 'song',   interval: 'midterm',   rank: 3, label: 'Song of the Midterm' },
  { key: 'song-weekly',      entity: 'song',   interval: 'weekly',    rank: 4, label: 'Song of the Week' },
  { key: 'song-daily',       entity: 'song',   interval: 'daily',     rank: 5, label: 'Song of the Day' },
];

/**
 * Accepts either the array form ([{entity, interval, count}]) or a plain map
 * ({ "artist-daily": 3 }), mirroring the web normalizeAwards().
 */
export const normalizeAwards = (data: any): Record<string, number> => {
  const map: Record<string, number> = {};
  if (!data) return map;
  if (Array.isArray(data)) {
    data.forEach((a: any) => {
      const key =
        a.key ||
        `${String(a.entity || a.category || '').toLowerCase()}-${String(
          a.interval || a.period || ''
        ).toLowerCase()}`;
      const count = a.count ?? a.wins ?? a.times ?? 0;
      if (key) map[key] = (map[key] || 0) + Number(count || 0);
    });
  } else if (typeof data === 'object') {
    Object.entries(data).forEach(([k, v]) => {
      map[k.toLowerCase()] = Number(v || 0);
    });
  }
  return map;
};

// ─── Interval glyphs ───────────────────────────────────────────
// sun = daily, arc = weekly, half-moon = midterm, full moon = monthly,
// quarter-pie = quarterly, crown = annual. Entity is carried by COLOR.
const IntervalGlyph: React.FC<{ interval: string; color: string; size: number }> = ({
  interval,
  color,
  size,
}) => {
  switch (interval) {
    case 'daily':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx="12" cy="12" r="4" fill={color} />
          <Path
            d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
          />
        </Svg>
      );
    case 'weekly':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M4 14a8 8 0 0 1 16 0" stroke={color} strokeWidth={2.1} fill="none" strokeLinecap="round" />
          <Circle cx="12" cy="14" r="1.6" fill={color} />
          <Path d="M12 14l4.5-4" stroke={color} strokeWidth={2.1} strokeLinecap="round" />
        </Svg>
      );
    case 'midterm':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx="12" cy="12" r="8" stroke={color} strokeWidth={2} fill="none" />
          <Path d="M12 4a8 8 0 0 1 0 16z" fill={color} />
        </Svg>
      );
    case 'monthly':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx="12" cy="12" r="8" fill={color} />
          <Circle cx="9.4" cy="9.6" r="1.5" fill="rgba(0,0,0,0.45)" />
          <Circle cx="14.6" cy="13.4" r="2" fill="rgba(0,0,0,0.35)" />
          <Circle cx="10" cy="15" r="1.1" fill="rgba(0,0,0,0.35)" />
        </Svg>
      );
    case 'quarterly':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx="12" cy="12" r="8" stroke={color} strokeWidth={2} fill="none" />
          <Path d="M12 12V4a8 8 0 0 1 8 8z" fill={color} />
        </Svg>
      );
    case 'annual':
    default:
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 11H5L3 7z" fill={color} />
        </Svg>
      );
  }
};

// Medal chrome: ribbon tails + glass disc + double ring, all in `color`.
const MedalBase: React.FC<{ color: string; width: number; height: number }> = ({
  color,
  width,
  height,
}) => (
  <Svg width={width} height={height} viewBox="0 0 64 80">
    <G fill={color} opacity={0.88}>
      <G transform="translate(24.5 46) rotate(-16)">
        <Path d="M-5.5 -4 h11 v27 l-5.5 -6.5 l-5.5 6.5 z" />
      </G>
      <G transform="translate(39.5 46) rotate(16)">
        <Path d="M-5.5 -4 h11 v27 l-5.5 -6.5 l-5.5 6.5 z" />
      </G>
    </G>
    <Circle cx="32" cy="29" r="26" fill="rgba(9, 9, 13, 0.78)" />
    <Circle cx="32" cy="29" r="26" fill="none" stroke={color} strokeWidth={2.2} />
    <Circle cx="32" cy="29" r="20.5" fill="none" stroke={color} strokeWidth={1} opacity={0.35} />
  </Svg>
);

// ─── Single medal ──────────────────────────────────────────────
const MEDAL_W = 42;
const MEDAL_H = 52;
const GLYPH = 16;

interface BadgeProps {
  label: string;
  interval: string;
  count: number;
  color: string;
  side: 'left' | 'right';
  revealed: boolean;
  delay: number;
  reduceMotion: boolean;
}

const Badge: React.FC<BadgeProps> = ({
  label,
  interval,
  count,
  color,
  side,
  revealed,
  delay,
  reduceMotion,
}) => {
  const progress = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(1);
      return;
    }
    if (!revealed) return;
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: 500,
      delay,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [revealed, delay, reduceMotion, progress]);

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [side === 'left' ? -24 : 24, 0],
  });
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] });

  return (
    <Animated.View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${label}, won ${count} ${count === 1 ? 'time' : 'times'}`}
      style={[styles.badge, { opacity: progress, transform: [{ translateX }, { scale }] }]}
    >
      <View style={styles.medal}>
        <MedalBase color={color} width={MEDAL_W} height={MEDAL_H} />
        <View style={styles.glyphWrap} pointerEvents="none">
          <IntervalGlyph interval={interval} color={color} size={GLYPH} />
        </View>
        <View style={[styles.countChip, { borderColor: color }]}>
          <Text style={[styles.countText, { color }]}>×{count}</Text>
        </View>
      </View>
      <Text style={styles.label} numberOfLines={3}>
        {label}
      </Text>
    </Animated.View>
  );
};

// ─── Rails ─────────────────────────────────────────────────────
interface ArtistAwardRailsProps {
  awards: Record<string, number>;
  /** Theme accent for artist medals (song medals are always gold). */
  themeColor: string;
  /** Flip true shortly after the hero image lands. */
  revealed: boolean;
  /** Distance from the top of the hero. */
  top?: number;
}

const GOLD = '#f5d990';

const ArtistAwardRails: React.FC<ArtistAwardRailsProps> = ({
  awards,
  themeColor,
  revealed,
  top = 12,
}) => {
  const [reduceMotion, setReduceMotion] = React.useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => { if (alive) setReduceMotion(Boolean(v)); })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) =>
      setReduceMotion(Boolean(v))
    );
    return () => {
      alive = false;
      // @ts-ignore RN version differences on the subscription shape
      sub?.remove?.();
    };
  }, []);

  const earned = AWARD_DEFS.map((d) => ({ ...d, count: awards[d.key] || 0 }))
    .filter((a) => a.count > 0)
    .sort((a, b) => a.rank - b.rank);

  const artistAwards = earned.filter((a) => a.entity === 'artist');
  const songAwards = earned.filter((a) => a.entity === 'song');

  if (!artistAwards.length && !songAwards.length) return null;

  return (
    <>
      {artistAwards.length > 0 && (
        <View
          style={[styles.rail, styles.railLeft, { top }]}
          pointerEvents="box-none"
          accessibilityLabel="Artist awards"
        >
          {artistAwards.map((a, i) => (
            <Badge
              key={a.key}
              label={a.label}
              interval={a.interval}
              count={a.count}
              color={themeColor}
              side="left"
              revealed={revealed}
              delay={i * 100}
              reduceMotion={reduceMotion}
            />
          ))}
        </View>
      )}

      {songAwards.length > 0 && (
        <View
          style={[styles.rail, styles.railRight, { top }]}
          pointerEvents="box-none"
          accessibilityLabel="Song awards"
        >
          {songAwards.map((a, i) => (
            <Badge
              key={a.key}
              label={a.label}
              interval={a.interval}
              count={a.count}
              color={GOLD}
              side="right"
              revealed={revealed}
              delay={i * 100}
              reduceMotion={reduceMotion}
            />
          ))}
        </View>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  rail: {
    position: 'absolute',
    zIndex: 3,
    width: 58,
    alignItems: 'center',
  },
  railLeft: { left: 2 },
  railRight: { right: 2 },
  badge: {
    alignItems: 'center',
    marginBottom: 5,
    width: '100%',
  },
  medal: {
    width: MEDAL_W,
    height: MEDAL_H,
    alignItems: 'center',
    justifyContent: 'center',
    // RN has no drop-shadow filter; shadow props give the same seating
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  glyphWrap: {
    position: 'absolute',
    // disc center sits at 29/80 of the viewBox height
    top: MEDAL_H * (29 / 80) - GLYPH / 2,
    left: MEDAL_W / 2 - GLYPH / 2,
  },
  countChip: {
    position: 'absolute',
    top: -4,
    right: -7,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: 'rgba(9, 9, 13, 0.88)',
  },
  countText: {
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  label: {
    marginTop: 1,
    maxWidth: 56,
    textAlign: 'center',
    fontSize: 6.5,
    fontWeight: '700',
    letterSpacing: 0.3,
    lineHeight: 8.5,
    textTransform: 'uppercase',
    color: '#f2f2f4',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
});

export default ArtistAwardRails;