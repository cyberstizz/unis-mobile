// src/context/RewardContext.tsx
// ─────────────────────────────────────────────────────────────
// The "+N pts" reward pill — mobile port of web src/context/RewardContext.jsx
// + RewardScoreSync.jsx. Fires when a play / like / vote credits the user.
// It is the confirmation for those actions (no toast on top of it).
//
//   const { showReward } = useReward();
//   showReward({ points: 1, label: 'Play counted', type: 'play' });
//
// The pill states the exact score (before → after, never abbreviated) once
// the provider knows the user's total, which it reads from the profile.
// ─────────────────────────────────────────────────────────────
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from './AuthContext';
import { buildTheme, mix } from '../theme/unisTheme';

export interface RewardInput {
  points: number;
  label?: string;
  type?: string;
  anchor?: string;
  scoreBefore?: number;
  scoreAfter?: number;
}

interface RewardItem {
  id: string;
  points: number;
  label: string;
  type: string;
  scoreBefore: number | null;
  scoreAfter: number | null;
}

interface RewardApi {
  showReward: (r: RewardInput) => void;
  setScoreTotal: (score: number) => void;
  displayedScore: number | null;
}

const MAX_REWARDS_ON_SCREEN = 4;
const LIFETIME_MS = 2600;

/** Exact score — thousands grouped, never abbreviated. */
export const formatScore = (score: any): string => {
  const value = Number(score);
  if (!Number.isFinite(value)) return '0';
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

const RewardContext = createContext<RewardApi | null>(null);

export const useReward = (): RewardApi => {
  const ctx = useContext(RewardContext);
  if (!ctx) return { showReward: () => {}, setScoreTotal: () => {}, displayedScore: null };
  return ctx;
};

const Pill: React.FC<{ reward: RewardItem; index: number; bottom: number }> = ({ reward, index, bottom }) => {
  const { theme } = useAuth();
  const t = buildTheme(theme);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(anim, { toValue: 1, duration: 900, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: true }),
      Animated.delay(LIFETIME_MS - 1500),
      Animated.timing(anim, { toValue: 2, duration: 600, useNativeDriver: true }),
    ]).start();
  }, [anim]);

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[
        styles.pillWrap,
        { bottom: bottom + index * 62 },
        {
          opacity: anim.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] }),
          transform: [
            { translateY: anim.interpolate({ inputRange: [0, 1, 2], outputRange: [14, -18, -48] }) },
            { scale: anim.interpolate({ inputRange: [0, 1, 2], outputRange: [0.94, 1, 0.97] }) },
          ],
        },
      ]}
    >
      <LinearGradient
        colors={[t.primary, mix(t.primary, '#05070d', 0.26)]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.pill, { borderColor: mix(t.primary, '#ffffff', 0.35), shadowColor: t.primary }]}
      >
        <View style={styles.dot} />
        <View style={{ gap: 3 }}>
          <View style={styles.mainline}>
            <Text style={styles.points}>
              +{reward.points}
              <Text style={styles.unit}> pts</Text>
            </Text>
            {!!reward.label && <Text style={styles.label}>{reward.label}</Text>}
          </View>
          {typeof reward.scoreBefore === 'number' && typeof reward.scoreAfter === 'number' && (
            <Text style={styles.score}>
              Score {formatScore(reward.scoreBefore)} → <Text style={styles.scoreStrong}>{formatScore(reward.scoreAfter)}</Text>
            </Text>
          )}
        </View>
      </LinearGradient>
    </Animated.View>
  );
};

export const RewardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [rewards, setRewards] = useState<RewardItem[]>([]);
  const [displayedScore, setDisplayedScore] = useState<number | null>(null);
  const scoreRef = useRef<number | null>(null);
  const timeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const setScoreTotal = useCallback((score: number) => {
    const n = Number(score);
    if (!Number.isFinite(n)) return;
    scoreRef.current = n;
    setDisplayedScore(n);
  }, []);

  // RewardScoreSync: keep the running total in step with the profile.
  const u: any = user;
  const profileScore = u?.score ?? u?.totalScore ?? u?.points ?? u?.userScore;
  useEffect(() => {
    if (!user || profileScore == null) {
      if (!user) {
        scoreRef.current = null;
        setDisplayedScore(null);
      }
      return;
    }
    setScoreTotal(profileScore);
  }, [user?.userId, profileScore, setScoreTotal]); // eslint-disable-line react-hooks/exhaustive-deps

  const removeReward = useCallback((id: string) => {
    setRewards((prev) => prev.filter((r) => r.id !== id));
    clearTimeout(timeouts.current[id]);
    delete timeouts.current[id];
  }, []);

  useEffect(() => () => Object.values(timeouts.current).forEach(clearTimeout), []);

  const showReward = useCallback(
    ({ points, label = 'Points earned', type = 'default', scoreBefore, scoreAfter }: RewardInput) => {
      if (!points && points !== 0) return;
      const n = Number(points);
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      let before: number | null = null;
      let after: number | null = null;
      if (Number.isFinite(Number(scoreBefore)) && Number.isFinite(Number(scoreAfter))) {
        before = Number(scoreBefore);
        after = Number(scoreAfter);
      } else if (typeof scoreRef.current === 'number' && Number.isFinite(n) && n > 0) {
        before = scoreRef.current;
        after = scoreRef.current + n;
      }
      if (after != null) {
        scoreRef.current = after;
        setDisplayedScore(after);
      }

      setRewards((prev) => [...prev, { id, points: n, label, type, scoreBefore: before, scoreAfter: after }].slice(-MAX_REWARDS_ON_SCREEN));
      timeouts.current[id] = setTimeout(() => removeReward(id), LIFETIME_MS);
    },
    [removeReward],
  );

  // Sits above the mini player (≈ 64px) + the footer.
  const bottom = insets.bottom + 140;

  return (
    <RewardContext.Provider value={{ showReward, setScoreTotal, displayedScore }}>
      {children}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {rewards.map((r, i) => (
          <Pill key={r.id} reward={r} index={i} bottom={bottom} />
        ))}
      </View>
    </RewardContext.Provider>
  );
};

const styles = StyleSheet.create({
  pillWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 9999, elevation: 40 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    maxWidth: 360,
    paddingVertical: 11,
    paddingHorizontal: 15,
    borderRadius: 14,
    borderWidth: 1,
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 14,
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#fff', shadowColor: '#fff', shadowOpacity: 0.85, shadowRadius: 6 },
  mainline: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  points: { color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: -0.2 },
  unit: { fontSize: 12, fontWeight: '700', opacity: 0.85 },
  label: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '600' },
  score: { color: 'rgba(255,255,255,0.82)', fontSize: 12, fontWeight: '500' },
  scoreStrong: { color: '#fff', fontWeight: '800' },
});

export default RewardContext;
